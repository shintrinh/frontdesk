'use strict';
/* Generator tests: config in -> runnable app out.
 * Run: node --test template/tests/  (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { generate } = require('../generate');

const ROOT = path.join(__dirname, '..', '..');

test('generator scaffolds a runnable app from the auto config', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-'));
  const out = path.join(tmp, 'fixit-auto');
  const { config } = generate(path.join(ROOT, 'config', 'fixit-auto.json'), out);
  assert.equal(config.business.name, 'FixIt Auto');
  for (const file of ['config.json', 'server.js', 'package.json', 'README.md', path.join('tests', 'smoke.test.js')]) {
    assert.ok(fs.existsSync(path.join(out, file)), `missing generated file: ${file}`);
  }
  const generatedConfig = JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8'));
  assert.equal(generatedConfig.services.length, 6);
  const readme = fs.readFileSync(path.join(out, 'README.md'), 'utf8');
  assert.match(readme, /FixIt Auto/);
});

test('generator scaffolds a runnable app from the dental config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-'));
  const out = path.join(tmp, 'brightsmile-dental');
  const { config } = generate(path.join(ROOT, 'config', 'brightsmile-dental.json'), out);
  assert.equal(config.business.name, 'BrightSmile Dental');
  assert.equal(config.reminders.recallDays, 180);
});

test('generator rejects an invalid config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-'));
  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ business: { name: 'X' } }));
  assert.throws(() => generate(bad, path.join(tmp, 'out')), /Invalid config/);
});
