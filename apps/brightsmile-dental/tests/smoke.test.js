'use strict';
/* Generated smoke test for BrightSmile Dental. Boots the generated app
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
    assert.equal(body.business, "BrightSmile Dental");
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
    assert.match(await res.text(), /Patients due for recall/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

  test('dental app: new-patient booking without insurance gets the Delta Dental default', async () => {
    const config = loadConfig(path.join(__dirname, '..', 'config.json'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
    const { server } = createServer(config, { dataDir });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const base = `http://localhost:${port}`;
    try {
      const date = nextWeekday();
      const slots = await (await fetch(`${base}/api/slots?date=${date}&serviceId=new-patient-exam`)).json();
      assert.ok(slots.slots.length > 0);
      const ok = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        serviceId: 'new-patient-exam', date, startTime: slots.slots[0],
        customerName: 'Ana Lee', phone: '+15550101',
        intake: { fullName: 'Ana Lee', dateOfBirth: '1990-05-01', isNewPatient: true },
        channel: 'sms',
      }) });
      assert.equal(ok.status, 201);
      const created = await ok.json();
      assert.equal(created.booking.intake.insuranceProvider, 'Delta Dental');
      assert.equal(created.booking.intake.healthHistory, 'None');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('dental app: minimal booking (name + phone only) gets server defaults', async () => {
    const config = loadConfig(path.join(__dirname, '..', 'config.json'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
    const { server } = createServer(config, { dataDir });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const base = `http://localhost:${port}`;
    try {
      const res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        customerName: 'Min Patient', phone: '+15550104',
      }) });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.booking.serviceId, 'cleaning');
      assert.equal(body.booking.channel, 'sms');
      assert.equal(body.booking.intake.insuranceProvider, 'Delta Dental');
      assert.equal(body.booking.intake.isNewPatient, true);
      assert.ok(body.booking.date);
      assert.ok(body.booking.startTime);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('dental app: 180-day recall appears from a real past booking', async () => {
    const config = loadConfig(path.join(__dirname, '..', 'config.json'));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
    const { server } = createServer(config, { dataDir });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const base = `http://localhost:${port}`;
    try {
      // At least 180 days back, stepped off Sundays (the shop is closed then).
      const pastDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      while (pastDate.getUTCDay() === 0) pastDate.setUTCDate(pastDate.getUTCDate() - 1);
      const past = pastDate.toISOString().slice(0, 10);
      const created = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        serviceId: 'cleaning', date: past, startTime: '10:00',
        customerName: 'Bob Ray', phone: '+15550102',
        intake: { fullName: 'Bob Ray', dateOfBirth: '1980-01-01', insuranceProvider: 'Delta Dental', healthHistory: 'None', isNewPatient: false },
        channel: 'sms', status: 'completed',
      }) });
      assert.equal(created.status, 201);
      const rem = await (await fetch(`${base}/api/reminders`)).json();
      assert.equal(rem.recalls.length, 1);
      assert.equal(rem.recalls[0].customerName, 'Bob Ray');
      assert.ok(rem.recalls[0].daysSince >= 180);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
