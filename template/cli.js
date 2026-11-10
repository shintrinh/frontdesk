'use strict';
/**
 * FrontDesk CLI — the second surface for the template (besides the web
 * dashboard). Zero dependencies, Node >= 20.
 *
 *   node template/cli.js validate --config config/fixit-auto.json
 *   node template/cli.js generate --config config/paws-vet.json --out apps/paws-vet
 *   node template/cli.js slots --config config/fixit-auto.json --date 2026-11-12 --service oil-change
 *   node template/cli.js estimate --config config/fixit-auto.json --symptom "grinding noise when I brake"
 *   node template/cli.js bookings --config apps/fixit-auto/config.json [--date 2026-11-12]
 *   node template/cli.js serve --config config/fixit-auto.json [--port 3000]
 *
 * Bookings data lives in a data/ folder next to the config file by default
 * (the same folder a generated app writes to); override with --data-dir.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig, slug } = require('./lib/config');
const { listSlots } = require('./lib/booking');
const { loadDataset, estimate } = require('./lib/estimate');
const { Store } = require('./lib/store');
const { generate } = require('./generate');
const { start } = require('./server');

function usageError(message) {
  console.error(`Error: ${message}\n\nUsage:\n  frontdesk validate --config <config.json>\n  frontdesk generate --config <config.json> --out <app-dir>\n  frontdesk slots --config <config.json> --date YYYY-MM-DD --service <id>\n  frontdesk estimate --config <config.json> --symptom "..." [--service <id>]\n  frontdesk bookings --config <config.json> [--date YYYY-MM-DD] [--data-dir <dir>]\n  frontdesk serve --config <config.json> [--port <n>] [--data-dir <dir>]`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['config', 'out', 'date', 'service', 'symptom', 'data-dir', 'port'].includes(key)) {
        opts[key] = argv[i + 1];
        i += 1;
      } else {
        usageError(`unknown flag: ${arg}`);
      }
    } else if (!opts._command) {
      opts._command = arg;
    } else {
      usageError(`unexpected argument: ${arg}`);
    }
  }
  return opts;
}

function needConfig(opts) {
  if (!opts.config) usageError('--config <config.json> is required');
  return loadConfig(opts.config);
}

function defaultDataDir(opts, config) {
  if (opts['data-dir']) return path.resolve(opts['data-dir']);
  // Generated apps keep data next to their config (apps/<slug>/data/).
  const sibling = path.join(path.dirname(path.resolve(opts.config)), 'data');
  if (fs.existsSync(sibling)) return sibling;
  // The template server run from the repo root writes ./data/<slug>.json.
  const cwdData = path.join(process.cwd(), 'data');
  if (config && fs.existsSync(path.join(cwdData, `${slug(config.business.name)}.json`))) return cwdData;
  return sibling;
}

function cmdValidate(opts) {
  const config = needConfig(opts);
  console.log(`Valid: ${config.business.name} (${config.business.type})`);
  console.log(`  services: ${config.services.map((s) => s.id).join(', ')}`);
  console.log(`  intake: ${config.intakeFields.join(', ') || '(none)'}`);
  console.log(`  estimates: ${config.estimate.enabled ? 'enabled' : 'disabled'}`);
  console.log(`  reminders: confirm ${config.reminders.confirmHoursBefore}h before${config.reminders.recallDays ? `, recall every ${config.reminders.recallDays} days` : ', no recall cycle'}`);
  return 0;
}

function cmdGenerate(opts) {
  if (!opts.config) usageError('--config <config.json> is required');
  if (!opts.out) usageError('--out <app-dir> is required');
  const { config, outDir, dashboard } = generate(opts.config, opts.out);
  console.log(`Generated ${config.business.name} (${config.business.type})`);
  console.log(`  out:       ${outDir}`);
  console.log(`  dashboard: template/${dashboard}/`);
  console.log(`  run:       node ${path.join(opts.out, 'server.js')} --port 3000`);
  return 0;
}

function cmdSlots(opts) {
  const config = needConfig(opts);
  if (!opts.date) usageError('--date YYYY-MM-DD is required');
  if (!opts.service) usageError('--service <id> is required');
  const store = new Store(defaultDataDir(opts, config), slug(config.business.name));
  const result = listSlots(config, opts.date, opts.service, store.bookings);
  if (result.error) {
    console.error(`Error: ${result.error}`);
    return 1;
  }
  if (result.closed) {
    console.log(`${config.business.name} is closed on ${opts.date}.`);
    return 0;
  }
  console.log(`Open slots for ${opts.service} on ${opts.date}:`);
  console.log(result.slots.length > 0 ? `  ${result.slots.join(', ')}` : '  (none left)');
  return 0;
}

function cmdEstimate(opts) {
  const config = needConfig(opts);
  if (!opts.symptom) usageError('--symptom "..." is required');
  let dataset = null;
  if (config.estimate && config.estimate.enabled && config.estimate.dataset) {
    const candidates = [path.resolve(config.estimate.dataset), path.join(__dirname, '..', config.estimate.dataset)];
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) dataset = loadDataset(found);
  }
  const result = estimate(config, dataset, opts.symptom, opts.service);
  if (result.error) {
    console.error(`Error: ${result.error} — ${result.message}`);
    return 1;
  }
  if (!result.matched) {
    console.log(result.message);
    return 0;
  }
  console.log(`${result.serviceName}: $${result.priceMin}–$${result.priceMax}, about ${result.timeMinMin}–${result.timeMaxMin} min`);
  console.log(`Basis: ${result.basis}`);
  console.log(`Source: ${result.source}`);
  console.log(result.disclaimer);
  return 0;
}

function cmdBookings(opts) {
  const config = needConfig(opts);
  const store = new Store(defaultDataDir(opts, config), slug(config.business.name));
  const rows = store.listBookings(opts.date);
  if (rows.length === 0) {
    console.log(opts.date ? `No bookings on ${opts.date}.` : 'No bookings yet.');
    return 0;
  }
  console.log(`Bookings for ${config.business.name}${opts.date ? ` on ${opts.date}` : ''} (${rows.length}):`);
  for (const b of rows) {
    const service = config.services.find((s) => s.id === b.serviceId);
    console.log(`  ${b.date} ${b.startTime}  ${service ? service.name : b.serviceId}  ${b.customerName} (${b.phone})  [${b.status}]  ${b.id}`);
  }
  return 0;
}

function cmdServe(opts) {
  const config = needConfig(opts);
  const port = Number(opts.port) || Number(process.env.PORT) || 3000;
  // No --data-dir: let the server use its own default (./data next to cwd),
  // exactly like `node template/server.js`.
  start(config, { port, dataDir: opts['data-dir'] ? path.resolve(opts['data-dir']) : undefined });
  return 0;
}

function main(argv) {
  const opts = parseArgs(argv);
  const command = opts._command;
  if (!command) usageError('a command is required');
  try {
    switch (command) {
      case 'validate': return cmdValidate(opts);
      case 'generate': return cmdGenerate(opts);
      case 'slots': return cmdSlots(opts);
      case 'estimate': return cmdEstimate(opts);
      case 'bookings': return cmdBookings(opts);
      case 'serve': return cmdServe(opts);
      default: usageError(`unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main };
