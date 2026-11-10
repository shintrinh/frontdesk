'use strict';
/* Template core smoke tests. Zero dependencies — node:test only.
 * Run: node --test template/tests/  (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadConfig, validate } = require('../lib/config');
const { listSlots, slotIsFree, validateIntake, isOpenDay } = require('../lib/booking');
const { loadDataset, estimate } = require('../lib/estimate');
const { confirmationsDue, recallsDue } = require('../lib/reminders');
const { createServer } = require('../server');

const ROOT = path.join(__dirname, '..', '..');
const AUTO_CONFIG = path.join(ROOT, 'config', 'fixit-auto.json');
const DENTAL_CONFIG = path.join(ROOT, 'config', 'brightsmile-dental.json');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
}

function nextWeekday() {
  // Next date that is a business day (Mon-Sat) at least 2 days out.
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function nextSunday() {
  // Next Sunday, computed in UTC so the date never depends on server TZ.
  const d = new Date();
  const add = ((7 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

test('booking on a closed day is rejected (PBT caught this on Day 2)', async () => {
  const config = loadConfig(AUTO_CONFIG);
  const sunday = nextSunday();
  assert.equal(isOpenDay(config, sunday), false);
  assert.equal(slotIsFree(config, sunday, 'oil-change', '10:00', []), false);
  assert.deepEqual(listSlots(config, sunday, 'oil-change', []).closed, true);
  const { server } = createServer(config, { dataDir: tmpDataDir() });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      serviceId: 'oil-change', date: sunday, startTime: '10:00',
      customerName: 'Sunday Test', phone: '+15550100',
      intake: { vehicleYearMakeModel: '2020 Toyota Camry', mileage: 50000, symptomDescription: 'test' },
      channel: 'sms',
    }) });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'CLOSED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('both configs validate against the schema', () => {
  assert.equal(validate(loadConfig(AUTO_CONFIG)), true);
  assert.equal(validate(loadConfig(DENTAL_CONFIG)), true);
});

test('invalid config is rejected', () => {
  assert.throws(() => validate({ business: { name: 'X' } }), /Invalid config/);
  assert.throws(() => validate({
    business: { name: 'X', type: 'cafe', timezone: 'America/New_York', hours: { open: '09:00', close: '17:00', days: [1] } },
    services: [], intakeFields: [], estimate: { enabled: false }, reminders: { confirmHoursBefore: 24 }, channels: ['sms'],
  }), /services must be a non-empty array/);
});

test('slot grid excludes a booked slot (conflict detection)', () => {
  const config = loadConfig(AUTO_CONFIG);
  const date = nextWeekday();
  const before = listSlots(config, date, 'oil-change', []);
  assert.ok(before.slots.length > 0, 'expected open slots');
  const first = before.slots[0];
  const bookings = [{ serviceId: 'oil-change', date, startTime: first, status: 'booked' }];
  assert.equal(slotIsFree(config, date, 'oil-change', first, bookings), false);
  const after = listSlots(config, date, 'oil-change', bookings);
  assert.ok(!after.slots.includes(first), 'booked slot must disappear from the grid');
});

test('estimate matches a brake symptom to the RepairPal range', () => {
  const config = loadConfig(AUTO_CONFIG);
  const dataset = loadDataset(path.join(ROOT, 'datasets', 'auto-repair-estimates.sample.json'));
  const result = estimate(config, dataset, 'grinding noise when I brake');
  assert.equal(result.matched, true);
  assert.equal(result.serviceId, 'brake-pads');
  assert.equal(result.priceMin, 335);
  assert.equal(result.priceMax, 394);
  assert.match(result.source, /RepairPal/);
});

test('estimate with no matching symptom recommends inspection, not a price', () => {
  const config = loadConfig(AUTO_CONFIG);
  const dataset = loadDataset(path.join(ROOT, 'datasets', 'auto-repair-estimates.sample.json'));
  const result = estimate(config, dataset, 'weird purple smoke from the dashboard');
  assert.equal(result.matched, false);
  assert.equal(result.recommendation, 'brake-inspection');
});

test('estimates are disabled for the dental config', () => {
  const config = loadConfig(DENTAL_CONFIG);
  const result = estimate(config, null, 'tooth hurts');
  assert.equal(result.error, 'ESTIMATES_DISABLED');
});

test('dental intake requires insurance + health history for new patients', () => {
  const config = loadConfig(DENTAL_CONFIG);
  const err = validateIntake(config, {
    fullName: 'Ana Lee', dateOfBirth: '1990-05-01', isNewPatient: true,
  });
  assert.match(err, /insuranceProvider/);
  const ok = validateIntake(config, {
    fullName: 'Ana Lee', dateOfBirth: '1990-05-01', insuranceProvider: 'Delta Dental',
    healthHistory: 'None', isNewPatient: true,
  });
  assert.equal(ok, null);
});

test('confirmations + recalls are computed from real bookings only', () => {
  const config = loadConfig(DENTAL_CONFIG);
  // 10:00 in the business timezone (America/New_York, EST in November).
  const now = new Date('2026-11-10T15:00:00Z');
  const bookings = [
    { serviceId: 'cleaning', date: '2026-11-11', startTime: '10:00', customerName: 'Ana Lee', phone: '+15550101', status: 'booked', reminderSent: false },
    { serviceId: 'cleaning', date: '2026-05-01', startTime: '10:00', customerName: 'Bob Ray', phone: '+15550102', status: 'completed', reminderSent: true },
  ];
  const confirmations = confirmationsDue(config, bookings, now);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].customerName, 'Ana Lee');
  const recalls = recallsDue(config, bookings, now);
  assert.equal(recalls.length, 1);
  assert.equal(recalls[0].customerName, 'Bob Ray');
  assert.ok(recalls[0].daysSince >= 180);
});

test('HTTP: booking flow end to end, double-booking returns 409', async () => {
  const config = loadConfig(AUTO_CONFIG);
  const { server } = createServer(config, { dataDir: tmpDataDir() });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  try {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.business, 'FixIt Auto');

    const date = nextWeekday();
    const slots = await (await fetch(`${base}/api/slots?date=${date}&serviceId=oil-change`)).json();
    assert.ok(slots.slots.length > 0);
    const startTime = slots.slots[0];
    const payload = {
      serviceId: 'oil-change', date, startTime,
      customerName: 'Test Driver', phone: '+15550199',
      intake: { vehicleYearMakeModel: '2019 Honda Civic', mileage: 82000, symptomDescription: 'due for service' },
      channel: 'sms',
    };
    const first = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(first.status, 201);
    const created = await first.json();
    assert.ok(created.booking.id.startsWith('bk_'));

    const second = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(second.status, 409);
    const conflict = await second.json();
    assert.equal(conflict.error, 'SLOT_TAKEN');

    const dash = await fetch(`${base}/`);
    assert.equal(dash.status, 200);
    assert.match(await dash.text(), /FrontDesk/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
