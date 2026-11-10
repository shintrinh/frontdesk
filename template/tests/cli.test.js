'use strict';
/* CLI tests: run template/cli.js as a subprocess and check its output.
 * Run: node --test template/tests/cli.test.js (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'template', 'cli.js');
const AUTO_CONFIG = path.join(ROOT, 'config', 'fixit-auto.json');
const DENTAL_CONFIG = path.join(ROOT, 'config', 'brightsmile-dental.json');

function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd: ROOT }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

function nextWeekday() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function nextSunday() {
  const d = new Date();
  const add = ((7 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

test('cli validate accepts both configs', async () => {
  for (const cfg of [AUTO_CONFIG, DENTAL_CONFIG]) {
    const r = await runCli(['validate', '--config', cfg]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Valid: /);
  }
});

test('cli validate rejects a broken config', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-cli-'));
  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ business: { name: 'X' } }));
  const r = await runCli(['validate', '--config', bad]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Invalid config/);
});

test('cli slots lists open slots, and reports a closed day', async () => {
  const open = await runCli(['slots', '--config', AUTO_CONFIG, '--date', nextWeekday(), '--service', 'oil-change']);
  assert.equal(open.code, 0, open.stderr);
  assert.match(open.stdout, /Open slots/);
  assert.match(open.stdout, /09:00/);

  const closed = await runCli(['slots', '--config', AUTO_CONFIG, '--date', nextSunday(), '--service', 'oil-change']);
  assert.equal(closed.code, 0, closed.stderr);
  assert.match(closed.stdout, /closed on/);
});

test('cli estimate matches a symptom and refuses to invent a price', async () => {
  const hit = await runCli(['estimate', '--config', AUTO_CONFIG, '--symptom', 'grinding noise when I brake']);
  assert.equal(hit.code, 0, hit.stderr);
  assert.match(hit.stdout, /Brake Pad Replacement: \$335/);
  assert.match(hit.stdout, /RepairPal/);

  const miss = await runCli(['estimate', '--config', AUTO_CONFIG, '--symptom', 'weird purple smoke from the dashboard']);
  assert.equal(miss.code, 0, miss.stderr);
  assert.match(miss.stdout, /free inspection/);
  assert.doesNotMatch(miss.stdout, /\$\d/);
});

test('cli bookings lists bookings from the data dir', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-cli-'));
  const dataDir = path.join(tmp, 'data');
  // Seed one booking exactly the way the server stores it.
  const { Store } = require('../lib/store');
  const store = new Store(dataDir, 'fixit-auto');
  store.addBooking({
    serviceId: 'oil-change', date: nextWeekday(), startTime: '10:00',
    customerName: 'CLI Test Driver', phone: '+15550199',
    intake: { vehicleYearMakeModel: '2019 Honda Civic', mileage: 82000, symptomDescription: 'due' },
    channel: 'sms', status: 'booked',
  });
  const r = await runCli(['bookings', '--config', AUTO_CONFIG, '--data-dir', dataDir]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /CLI Test Driver/);
  assert.match(r.stdout, /Oil Change/);
});

test('cli generate scaffolds a runnable app', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-cli-'));
  const out = path.join(tmp, 'fixit-auto');
  const r = await runCli(['generate', '--config', AUTO_CONFIG, '--out', out]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Generated FixIt Auto/);
  assert.ok(fs.existsSync(path.join(out, 'public', 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'server.js')));
});
