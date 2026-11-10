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
  // Day 2: the generator also emits the per-vertical dashboard.
  for (const file of ['public/index.html', 'public/dashboard.js', 'public/styles.css']) {
    assert.ok(fs.existsSync(path.join(out, file)), `missing generated file: ${file}`);
  }
  assert.match(fs.readFileSync(path.join(out, 'public', 'index.html'), 'utf8'), /Repair estimate/);
});

test('generator emits the dental recall-first dashboard', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-'));
  const out = path.join(tmp, 'brightsmile-dental');
  generate(path.join(ROOT, 'config', 'brightsmile-dental.json'), out);
  assert.match(fs.readFileSync(path.join(out, 'public', 'index.html'), 'utf8'), /Patients due for recall/);
  assert.match(fs.readFileSync(path.join(out, 'public', 'dashboard.js'), 'utf8'), /recalls/);
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

test('empty template and vet example configs validate and generate', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-'));
  for (const cfg of ['empty.json', 'paws-vet.json']) {
    const out = path.join(tmp, cfg.replace('.json', ''));
    const { config } = generate(path.join(ROOT, 'config', cfg), out);
    assert.ok(config.business.name.length > 0);
    for (const file of ['config.json', 'server.js', 'package.json', 'README.md',
      path.join('tests', 'smoke.test.js'), path.join('public', 'index.html'),
      path.join('public', 'dashboard.js'), path.join('public', 'styles.css')]) {
      assert.ok(fs.existsSync(path.join(out, file)), `missing generated file: ${file}`);
    }
  }
  const vet = JSON.parse(fs.readFileSync(path.join(tmp, 'paws-vet', 'config.json'), 'utf8'));
  assert.equal(vet.reminders.recallDays, 365);
});

test('kiro artifacts exist: custom agent + add-vertical spec', () => {
  const agent = fs.readFileSync(path.join(ROOT, '.kiro', 'agents', 'vertical-config-reviewer.md'), 'utf8');
  assert.match(agent, /^---\nname: vertical-config-reviewer\n/);
  assert.match(agent, /description: Reviews a new FrontDesk business config/);
  assert.match(agent, /VERDICT: PASS/);
  for (const f of ['requirements.md', 'design.md', 'tasks.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, '.kiro', 'specs', 'add-vertical', f)), `missing spec file: ${f}`);
  }
});
