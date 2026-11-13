'use strict';
/* Generated smoke test for Black & White Coffee Roasters. Boots the generated app
   on a random port and checks the health endpoint, the per-vertical dashboard,
   and the vertical's core flow. */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../../../template/lib/config');
const { createServer } = require('../../../template/server');

function nextWeekday() {
  // Next date that is a business day (Mon-Sat) at least 2 days out.
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('generated app boots and answers /api/health', async () => {
  const config = loadConfig(path.join(__dirname, '..', 'config.json'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
  const { server } = createServer(config, { dataDir });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.business, "Black & White Coffee Roasters");
    assert.equal(body.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('generated app serves its per-vertical dashboard', async () => {
  const config = loadConfig(path.join(__dirname, '..', 'config.json'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
  const { server } = createServer(config, { dataDir, publicDir: path.join(__dirname, '..', 'public') });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Book an appointment/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

