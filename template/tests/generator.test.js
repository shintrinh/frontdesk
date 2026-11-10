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

test('generated app boots from an out-of-tree directory', async () => {
  // Regression: the generator used to hardcode require('../../template/server')
  // in the generated server.js, so an app generated outside apps/ crashed on
  // boot with MODULE_NOT_FOUND (caught by the Day 3 video prep, vet to /tmp).
  // Paths back to the template core are now computed relative to --out.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-gen-boot-'));
  const out = path.join(tmp, 'paws-vet');
  generate(path.join(ROOT, 'config', 'paws-vet.json'), out);
  const serverJs = fs.readFileSync(path.join(out, 'server.js'), 'utf8');
  assert.doesNotMatch(serverJs, /require\('\.\.\/\.\.\/template\/server'\)/);
  assert.match(serverJs, /require\('.*template\/server'\)/);
  const port = await new Promise((resolve) => {
    const s = require('net').createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const child = require('child_process').spawn(
    process.execPath, [path.join(out, 'server.js'), '--port', String(port)],
    { cwd: out },
  );
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`generated app did not start in time. Output so far:\n${output}`)), 15000);
      const check = () => {
        if (/Dashboard: http:\/\/localhost:/.test(output)) { clearTimeout(timer); resolve(); }
        else setTimeout(check, 200);
      };
      check();
    });
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.business, 'Paws & Claws Veterinary Clinic');
    const home = await fetch(`http://localhost:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Book an appointment/);
  } finally {
    child.kill('SIGTERM');
  }
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
