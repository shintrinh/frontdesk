'use strict';
/**
 * FrontDesk template server — zero dependencies, no build step.
 * One config file fully describes the business; this server turns it into a
 * working front desk: booking, intake, estimates, reminders, dashboard.
 *
 *   node template/server.js --config config/fixit-auto.json --port 3000
 *
 * A generated app is a thin wrapper around this file (see template/generate.js).
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { loadConfig, slug } = require('./lib/config');
const { Store } = require('./lib/store');
const { listSlots, slotIsFree, validateIntake, isOpenDay } = require('./lib/booking');
const { loadDataset, estimate } = require('./lib/estimate');
const { confirmationsDue, recallsDue, confirmationMessage, recallMessage } = require('./lib/reminders');

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
  const store = new Store(dataDir, slug(config.business.name));
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
        return sendJson(res, 200, { services: config.services, dataset: dataset ? { name: dataset.name, source: dataset.source } : null });
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
        const { serviceId, date, startTime, customerName, phone, intake, channel, status } = body;
        if (!serviceId || !date || !startTime || !customerName || !phone) {
          return sendJson(res, 400, { error: 'MISSING_FIELDS', message: 'serviceId, date, startTime, customerName, phone are required' });
        }
        if (!config.services.some((s) => s.id === serviceId)) {
          return sendJson(res, 400, { error: 'UNKNOWN_SERVICE', message: `unknown service: ${serviceId}` });
        }
        if (!isOpenDay(config, date)) {
          return sendJson(res, 400, { error: 'CLOSED', message: `The shop is closed on ${date}` });
        }
        const intakeError = validateIntake(config, intake || {});
        if (intakeError) return sendJson(res, 400, { error: 'INTAKE_INCOMPLETE', message: intakeError });
        if (!slotIsFree(config, date, serviceId, startTime, store.bookings)) {
          return sendJson(res, 409, { error: 'SLOT_TAKEN', message: `No availability for ${serviceId} on ${date} at ${startTime}` });
        }
        const booking = store.addBooking({ serviceId, date, startTime, customerName, phone, intake: intake || {}, channel: channel || 'voice', status });
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
        const booking = store.cancelBooking(parts[2]);
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
        const sent = store.sendMessage({ to: booking.phone, channel: body.channel || 'sms', kind: 'confirmation', body: text, bookingId: booking.id });
        store.markReminderSent(booking.id);
        return sendJson(res, 200, { sent });
      }
      if (req.method === 'POST' && url.pathname === '/api/recalls/send') {
        const body = await readBody(req);
        const recall = (recallsDue(config, store.bookings) || []).find((r) => r.phone === body.phone);
        if (!recall) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'No recall due for that phone number' });
        const text = recallMessage(config, recall);
        const sent = store.sendMessage({ to: recall.phone, channel: body.channel || 'sms', kind: 'recall', body: text });
        return sendJson(res, 200, { sent });
      }
      if (req.method === 'GET' && url.pathname === '/api/outbox') {
        return sendJson(res, 200, { outbox: store.outbox, note: 'Simulated sends in the template. A real deployment wires Twilio here.' });
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

function start(config, opts = {}) {
  const port = opts.port || Number(process.env.PORT) || 3000;
  const { server, store } = createServer(config, opts);
  server.listen(port, () => {
    console.log(`FrontDesk: ${config.business.name} (${config.business.type})`);
    console.log(`Dashboard: http://localhost:${port}/`);
    console.log(`Health:    http://localhost:${port}/api/health`);
    console.log(`Config:    ${config._path || 'generated'}`);
    console.log(`Data:      ${store.file}`);
  });
  return server;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || process.env.FRONTDESK_CONFIG || path.join(__dirname, '..', 'config', 'fixit-auto.json');
  const config = loadConfig(configPath);
  start(config, args);
}

module.exports = { createServer, start, loadConfig };
