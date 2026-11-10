'use strict';
/* Generated smoke test for BrightSmile Dental. Boots the generated app
   on a random port and checks the health endpoint answers with this business. */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../../../template/lib/config');
const { createServer } = require('../../../template/server');

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
    assert.equal(body.business, "BrightSmile Dental");
    assert.equal(body.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
