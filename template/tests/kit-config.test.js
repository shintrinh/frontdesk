'use strict';
/* Kit-config endpoint tests. The config builder (static site) POSTs a
 * finished config here so the shop owner never has to download and send
 * a file. Run: node --test template/tests/  (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../lib/config');
const { Store } = require('../lib/store');
const { createServer } = require('../server');

const ROOT = path.join(__dirname, '..', '..');
const AUTO_CONFIG = path.join(ROOT, 'config', 'fixit-auto.json');
const KIT_ORIGIN = 'https://frontdesk-kit.onrender.com';

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
}

// A realistic nail-salon config, exactly what the kit generates for the
// nail-salon preset (Classic Manicure + Spa Pedicure, notes intake).
function nailConfig() {
  return {
    language: 'en',
    business: {
      name: 'Luxe Nails & Spa',
      type: 'nail-salon',
      timezone: 'America/New_York',
      hours: { open: '09:00', close: '19:00', days: [1, 2, 3, 4, 5, 6] },
    },
    services: [
      { id: 'classic-manicure', name: 'Classic Manicure', durationMin: 45, priceEstimate: { min: 25, max: 40 } },
      { id: 'spa-pedicure', name: 'Spa Pedicure', durationMin: 60, priceEstimate: { min: 35, max: 55 } },
    ],
    intakeFields: ['notes'],
    intakeOptional: ['notes'],
    estimate: { enabled: false },
    reminders: { confirmHoursBefore: 24, recallDays: 21 },
    channels: ['sms'],
  };
}

async function startServer() {
  const config = loadConfig(AUTO_CONFIG);
  const { server } = createServer(config, { dataDir: tmpDataDir() });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  return { server, base };
}

test('POST /api/kit-config stores a valid config and GET lists it', async () => {
  const { server, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/kit-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: KIT_ORIGIN },
      body: JSON.stringify(nailConfig()),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.business, 'Luxe Nails & Spa');
    assert.equal(body.type, 'nail-salon');
    assert.ok(body.id && body.id.startsWith('kit_'));
    assert.ok(body.receivedAt);

    const list = await (await fetch(`${base}/api/kit-configs`)).json();
    assert.equal(list.kitConfigs.length, 1);
    assert.equal(list.kitConfigs[0].id, body.id);
    assert.equal(list.kitConfigs[0].config.business.name, 'Luxe Nails & Spa');
    assert.equal(list.kitConfigs[0].config.services.length, 2);
  } finally {
    server.close();
  }
});

test('POST /api/kit-config rejects an invalid config with 400', async () => {
  const { server, base } = await startServer();
  try {
    const bad = nailConfig();
    bad.business.type = 'not-a-type';
    const res = await fetch(`${base}/api/kit-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bad),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_CONFIG');
    assert.ok(body.message.includes('business.type'));

    const list = await (await fetch(`${base}/api/kit-configs`)).json();
    assert.equal(list.kitConfigs.length, 0);
  } finally {
    server.close();
  }
});

test('CORS: kit origin gets headers, other origins do not', async () => {
  const { server, base } = await startServer();
  try {
    const pre = await fetch(`${base}/api/kit-config`, {
      method: 'OPTIONS',
      headers: { Origin: KIT_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), KIT_ORIGIN);

    const preBad = await fetch(`${base}/api/kit-config`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preBad.status, 403);
    assert.equal(preBad.headers.get('access-control-allow-origin'), null);

    const post = await fetch(`${base}/api/kit-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: KIT_ORIGIN },
      body: JSON.stringify(nailConfig()),
    });
    assert.equal(post.status, 201);
    assert.equal(post.headers.get('access-control-allow-origin'), KIT_ORIGIN);
  } finally {
    server.close();
  }
});

test('JSON store: addKitConfig round-trips and lists newest first', async () => {
  const store = new Store(tmpDataDir(), 'test-shop');
  const first = store.addKitConfig(nailConfig());
  const secondCfg = nailConfig();
  secondCfg.business.name = 'Second Nails';
  const second = store.addKitConfig(secondCfg);
  assert.ok(first.id.startsWith('kit_'));
  assert.equal(store.listKitConfigs().length, 2);
  assert.equal(store.listKitConfigs()[0].id, second.id);
  assert.equal(store.listKitConfigs()[1].business, 'Luxe Nails & Spa');
  // Survives a reload from the snapshot file.
  const reloaded = new Store(store.dataDir, 'test-shop');
  assert.equal(reloaded.listKitConfigs().length, 2);
  assert.equal(reloaded.listKitConfigs()[0].config.business.name, 'Second Nails');
});
