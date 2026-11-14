'use strict';
/**
 * FrontDesk template server — no build step, one optional dependency.
 * One config file fully describes the business; this server turns it into a
 * working front desk: booking, intake, estimates, reminders, dashboard.
 * Storage defaults to a JSON-file snapshot (zero dependencies). Set
 * DATABASE_URL to use Postgres instead (lib/store-pg.js, 'pg' package);
 * bookings then survive restarts on ephemeral hosts.
 *
 *   node template/server.js --config config/fixit-auto.json --port 3000
 *
 * A generated app is a thin wrapper around this file (see template/generate.js).
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { loadConfig, validate, slug } = require('./lib/config');
const { Store } = require('./lib/store');
const { listSlots, slotIsFree, validateIntake, isOpenDay, nextOpenDay, applyIntakeDefaults } = require('./lib/booking');
const { loadDataset, estimate, symptomKeywords } = require('./lib/estimate');
const { confirmationsDue, recallsDue, confirmationMessage, recallMessage } = require('./lib/reminders');

// The kit (config builder) is a static site on another origin, and it
// POSTs configs here. Only that origin (plus localhost for local testing)
// may call the kit-config routes. Everything else on this server is
// same-origin dashboard traffic and needs no CORS.
const KIT_ORIGINS = ['https://frontdesk-kit.onrender.com'];
function kitCorsHeaders(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return {};
  const allowed = KIT_ORIGINS.includes(origin)
    || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'NOT_FOUND' });
  const ext = path.extname(filePath);
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': body.length });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function createServer(config, opts = {}) {
  const dataDir = opts.dataDir || path.join(process.cwd(), 'data');
  // Generated apps serve their own per-vertical dashboard from their own
  // public/ folder; the template dashboard is the fallback.
  const publicDir = opts.publicDir || PUBLIC_DIR;
  // A caller (start() with DATABASE_URL) may inject a ready store, e.g. a
  // PgStore; otherwise the JSON-file store is the default.
  const store = opts.store || new Store(dataDir, slug(config.business.name));
  let dataset = null;
  if (config.estimate && config.estimate.enabled && config.estimate.dataset) {
    // The dataset path is relative to the repo root. Resolve it from the
    // working directory first, then from the template's parent (repo root),
    // so a generated app works no matter where it is launched from.
    const candidates = [
      path.resolve(config.estimate.dataset),
      path.join(__dirname, '..', config.estimate.dataset),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    try { dataset = found ? loadDataset(found) : null; } catch (err) { dataset = null; }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);

      // CORS preflight for the kit-config routes (the kit is a static
      // site on another origin). Only the kit origin gets CORS headers.
      if (req.method === 'OPTIONS' && (url.pathname === '/api/kit-config' || url.pathname === '/api/kit-configs')) {
        const headers = kitCorsHeaders(req);
        if (!Object.keys(headers).length) return sendJson(res, 403, { error: 'FORBIDDEN' });
        res.writeHead(204, headers);
        return res.end();
      }

      // --- Dashboard (static) ---
      if (req.method === 'GET' && url.pathname === '/') return sendFile(res, path.join(publicDir, 'index.html'));
      if (req.method === 'GET' && (url.pathname === '/styles.css' || url.pathname === '/dashboard.js')) {
        return sendFile(res, path.join(publicDir, url.pathname.slice(1)));
      }

      // --- API ---
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, business: config.business.name, type: config.business.type, version: '0.1.0-day1' });
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const { _path, ...publicConfig } = config;
        return sendJson(res, 200, publicConfig);
      }
      if (req.method === 'GET' && url.pathname === '/api/services') {
        return sendJson(res, 200, {
          services: config.services,
          dataset: dataset ? { name: dataset.name, source: dataset.source } : null,
          // As-you-type suggestions for the symptom field (auto vertical).
          suggestions: dataset ? symptomKeywords(dataset) : [],
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/slots') {
        const date = url.searchParams.get('date');
        const serviceId = url.searchParams.get('serviceId');
        if (!date || !serviceId) return sendJson(res, 400, { error: 'MISSING_PARAMS', message: 'date and serviceId are required' });
        const result = listSlots(config, date, serviceId, store.bookings);
        if (result.error) return sendJson(res, 400, { error: 'UNKNOWN_SERVICE', message: result.error });
        return sendJson(res, 200, { date, serviceId, ...result });
      }
      if (req.method === 'POST' && url.pathname === '/api/bookings') {
        const body = await readBody(req);
        // Minimal form (pilot feedback, Day 3): only name + phone are
        // required. Everything else gets the same defaults the dashboard
        // pre-fills in the form, so a name+phone-only POST still books.
        let { serviceId, date, startTime, customerName, phone, intake, channel, status } = body;
        if (!customerName || !phone) {
          return sendJson(res, 400, { error: 'MISSING_FIELDS', message: 'customerName, phone are required' });
        }
        serviceId = serviceId || (config.services[0] && config.services[0].id);
        if (!config.services.some((s) => s.id === serviceId)) {
          return sendJson(res, 400, { error: 'UNKNOWN_SERVICE', message: `unknown service: ${serviceId}` });
        }
        date = date || nextOpenDay(config, new Date().toISOString().slice(0, 10));
        if (!date) {
          return sendJson(res, 400, { error: 'NO_SLOTS', message: 'No open days in the next two weeks' });
        }
        if (!startTime) {
          const grid = listSlots(config, date, serviceId, store.bookings);
          startTime = (!grid.closed && grid.slots.length > 0) ? grid.slots[0] : '';
        }
        if (!startTime) {
          return sendJson(res, 400, { error: 'NO_SLOTS', message: `No availability for ${serviceId} on ${date}` });
        }
        if (!isOpenDay(config, date)) {
          return sendJson(res, 400, { error: 'CLOSED', message: `The shop is closed on ${date}` });
        }
        const intakeWithDefaults = applyIntakeDefaults(config, intake || {}, customerName);
        const intakeError = validateIntake(config, intakeWithDefaults);
        if (intakeError) return sendJson(res, 400, { error: 'INTAKE_INCOMPLETE', message: intakeError });
        if (!slotIsFree(config, date, serviceId, startTime, store.bookings)) {
          return sendJson(res, 409, { error: 'SLOT_TAKEN', message: `No availability for ${serviceId} on ${date} at ${startTime}` });
        }
        const booking = await store.addBooking({ serviceId, date, startTime, customerName, phone, intake: intakeWithDefaults, channel: channel || 'sms', status });
        return sendJson(res, 201, { booking });
      }
      if (req.method === 'GET' && url.pathname === '/api/bookings') {
        return sendJson(res, 200, { bookings: store.listBookings(url.searchParams.get('date') || undefined) });
      }
      if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'bookings' && parts[2]) {
        const booking = store.getBooking(parts[2]);
        if (!booking) return sendJson(res, 404, { error: 'NOT_FOUND' });
        return sendJson(res, 200, { booking });
      }
      if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'bookings' && parts[2] && parts[3] === 'cancel') {
        const booking = await store.cancelBooking(parts[2]);
        if (!booking) return sendJson(res, 404, { error: 'NOT_FOUND' });
        return sendJson(res, 200, { booking });
      }
      if (req.method === 'POST' && url.pathname === '/api/estimate') {
        const body = await readBody(req);
        const result = estimate(config, dataset, body.symptom, body.serviceId);
        if (result.error) return sendJson(res, 400, result);
        return sendJson(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/reminders') {
        return sendJson(res, 200, {
          confirmations: confirmationsDue(config, store.bookings),
          recalls: recallsDue(config, store.bookings),
        });
      }
      if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'reminders' && parts[2] === 'send') {
        const body = await readBody(req);
        const booking = store.getBooking(body.bookingId);
        if (!booking) return sendJson(res, 404, { error: 'NOT_FOUND' });
        const text = confirmationMessage(config, booking);
        const sent = await store.sendMessage({ to: booking.phone, channel: body.channel || 'sms', kind: 'confirmation', body: text, bookingId: booking.id });
        await store.markReminderSent(booking.id);
        return sendJson(res, 200, { sent });
      }
      if (req.method === 'POST' && url.pathname === '/api/recalls/send') {
        const body = await readBody(req);
        const recall = (recallsDue(config, store.bookings) || []).find((r) => r.phone === body.phone);
        if (!recall) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'No recall due for that phone number' });
        const text = recallMessage(config, recall);
        const sent = await store.sendMessage({ to: recall.phone, channel: body.channel || 'sms', kind: 'recall', body: text });
        return sendJson(res, 200, { sent });
      }
      if (req.method === 'GET' && url.pathname === '/api/outbox') {
        return sendJson(res, 200, { outbox: store.outbox, note: 'Simulated sends in the template. A real deployment wires Twilio here.' });
      }
      // --- Kit configs: the config builder (static site on another
      // origin) POSTs a finished config here so the shop owner never has
      // to download and send a file. The config is validated with the
      // same rules as a config file, then stored (Postgres when
      // available, JSON snapshot otherwise) for FenBig to pick up and
      // generate the app from. GET lists recent submissions, newest first.
      if (req.method === 'POST' && url.pathname === '/api/kit-config') {
        const cors = kitCorsHeaders(req);
        const sendKit = (status, obj) => {
          const body = JSON.stringify(obj);
          res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...cors });
          return res.end(body);
        };
        const body = await readBody(req);
        try {
          validate(body);
        } catch (err) {
          return sendKit(400, { error: 'INVALID_CONFIG', message: err.message });
        }
        const entry = await store.addKitConfig(body);
        return sendKit(201, { ok: true, id: entry.id, business: entry.business, type: entry.type, receivedAt: entry.receivedAt });
      }
      if (req.method === 'GET' && url.pathname === '/api/kit-configs') {
        return sendJson(res, 200, { kitConfigs: store.listKitConfigs() });
      }
      return sendJson(res, 404, { error: 'NOT_FOUND', message: `No route: ${req.method} ${url.pathname}` });
    } catch (err) {
      return sendJson(res, 500, { error: 'SERVER_ERROR', message: err.message });
    }
  });

  return { server, store };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) opts.config = argv[i + 1];
    if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[i + 1]);
    if (argv[i] === '--data-dir' && argv[i + 1]) opts.dataDir = argv[i + 1];
  }
  return opts;
}

/**
 * Pick the store for a server run. Returns a ready PgStore when DATABASE_URL
 * is set and Postgres answers, otherwise null (the caller then builds the
 * JSON-file store). A database that is down, deleted, or misconfigured must
 * never take the app down with it: the app falls back to the JSON store and
 * keeps serving, with a loud log line saying bookings will not survive
 * restarts until the database is back. That is the safety net for the free
 * Render Postgres, which expires 90 days after creation.
 */
async function resolveStore(config, opts = {}) {
  if (opts.store) return opts.store;
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PgStore } = require('./lib/store-pg');
    const pgStore = new PgStore({ connectionString: process.env.DATABASE_URL, slug: slug(config.business.name) });
    await pgStore.init();
    return pgStore;
  } catch (err) {
    console.error(`Postgres unavailable (${err.message}); falling back to the JSON-file store. Bookings will not survive restarts until the database is back.`);
    return null;
  }
}

async function start(config, opts = {}) {
  const port = opts.port || Number(process.env.PORT) || 3000;
  // Postgres backend: when DATABASE_URL is set, build and init the PgStore
  // first (it loads existing rows into memory), then hand it to
  // createServer. Without it — or when Postgres is down — the JSON-file
  // store is the default and this function behaves exactly as before.
  const resolved = await resolveStore(config, opts);
  if (resolved) opts = { ...opts, store: resolved };
  const { server, store } = createServer(config, opts);
  server.listen(port, () => {
    console.log(`FrontDesk: ${config.business.name} (${config.business.type})`);
    console.log(`Dashboard: http://localhost:${port}/`);
    console.log(`Health:    http://localhost:${port}/api/health`);
    console.log(`Config:    ${config._path || 'generated'}`);
    console.log(`Data:      ${store.file || store.location}`);
  });
  return server;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || process.env.FRONTDESK_CONFIG || path.join(__dirname, '..', 'config', 'fixit-auto.json');
  const config = loadConfig(configPath);
  start(config, args).catch((err) => {
    console.error('FrontDesk failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { createServer, start, loadConfig, resolveStore };
