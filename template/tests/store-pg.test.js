'use strict';
/* Postgres store tests. No live database needed: the pg Pool is faked.
 * The fake records every query and keeps rows in memory, so these tests
 * prove the store's SQL + write-through logic, and that a second store
 * started against the same (fake) database loads the rows back — the
 * restart-survival property the JSON-file store lacks on ephemeral hosts.
 * Run: node --test template/tests/  (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { PgStore } = require('../lib/store-pg');
const { loadConfig } = require('../lib/config');
const { createServer } = require('../server');

const ROOT = path.join(__dirname, '..', '..');
const AUTO_CONFIG = path.join(ROOT, 'config', 'fixit-auto.json');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-test-'));
}

function nextWeekday() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** In-memory stand-in for the pg Pool: records queries, keeps rows. */
class FakePool {
  constructor() {
    this.queries = [];
    this.rows = { bookings: [], outbox: [] };
    this.ended = false;
  }

  async query(text, params = []) {
    this.queries.push({ text, params });
    if (text.startsWith('CREATE TABLE')) return { rows: [] };
    if (text.startsWith('SELECT data FROM frontdesk_bookings')) {
      const rows = this.rows.bookings
        .filter((r) => r.slug === params[0])
        .map((r) => ({ data: r.data }));
      return { rows };
    }
    if (text.startsWith('SELECT data FROM frontdesk_outbox')) {
      const rows = this.rows.outbox
        .filter((r) => r.slug === params[0])
        .map((r) => ({ data: r.data }));
      return { rows };
    }
    if (text.startsWith('INSERT INTO frontdesk_bookings')) {
      this.rows.bookings.push({ slug: params[0], id: params[1], data: JSON.parse(params[2]) });
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO frontdesk_outbox')) {
      this.rows.outbox.push({ slug: params[0], id: params[1], data: JSON.parse(params[2]) });
      return { rows: [] };
    }
    if (text.startsWith('UPDATE frontdesk_bookings')) {
      const row = this.rows.bookings.find((r) => r.slug === params[1] && r.id === params[2]);
      if (row) row.data = JSON.parse(params[0]);
      return { rows: [] };
    }
    throw new Error(`FakePool: unexpected query: ${text}`);
  }

  async end() {
    this.ended = true;
  }
}

test('PgStore requires a connection string and a slug', () => {
  assert.throws(() => new PgStore({ slug: 'x', Pool: FakePool }), /connectionString/);
  assert.throws(() => new PgStore({ connectionString: 'postgres://fake/fake', Pool: FakePool }), /slug/);
});

test('init creates both tables and loads only this slug rows', async () => {
  const pool = new FakePool();
  pool.rows.bookings.push(
    { slug: 'fixit-auto', id: 'bk_1', data: { id: 'bk_1', date: '2026-11-20', startTime: '09:00', status: 'booked' } },
    { slug: 'other-shop', id: 'bk_2', data: { id: 'bk_2', date: '2026-11-20', startTime: '10:00', status: 'booked' } },
  );
  const store = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  store.pool = pool;
  await store.init();
  assert.equal(store.bookings.length, 1);
  assert.equal(store.bookings[0].id, 'bk_1');
  assert.ok(pool.queries.some((q) => q.text.includes('CREATE TABLE IF NOT EXISTS frontdesk_bookings')));
  assert.ok(pool.queries.some((q) => q.text.includes('CREATE TABLE IF NOT EXISTS frontdesk_outbox')));
});

test('addBooking writes through to Postgres and lists back', async () => {
  const pool = new FakePool();
  const store = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  store.pool = pool;
  await store.init();
  const date = nextWeekday();
  const booking = await store.addBooking({
    serviceId: 'oil-change', date, startTime: '09:00',
    customerName: 'Test Driver', phone: '+15550001111', channel: 'sms',
  });
  assert.match(booking.id, /^bk_/);
  assert.equal(booking.status, 'booked');
  assert.equal(booking.reminderSent, false);
  assert.ok(booking.createdAt);
  assert.equal(pool.rows.bookings.length, 1);
  assert.equal(pool.rows.bookings[0].data.customerName, 'Test Driver');
  assert.deepEqual(store.listBookings(date).map((b) => b.id), [booking.id]);
  assert.equal(store.getBooking(booking.id).phone, '+15550001111');
  assert.equal(store.getBooking('bk_nope'), null);
});

test('cancel + reminder flags update the stored row, unknown ids return null', async () => {
  const pool = new FakePool();
  const store = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  store.pool = pool;
  await store.init();
  const date = nextWeekday();
  const booking = await store.addBooking({
    serviceId: 'oil-change', date, startTime: '09:00',
    customerName: 'Test Driver', phone: '+15550001111', channel: 'sms',
  });
  const reminded = await store.markReminderSent(booking.id);
  assert.equal(reminded.reminderSent, true);
  assert.equal(pool.rows.bookings[0].data.reminderSent, true);
  const cancelled = await store.cancelBooking(booking.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(pool.rows.bookings[0].data.status, 'cancelled');
  assert.equal(await store.cancelBooking('bk_nope'), null);
  assert.equal(await store.markReminderSent('bk_nope'), null);
});

test('sendMessage records to the outbox table', async () => {
  const pool = new FakePool();
  const store = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  store.pool = pool;
  await store.init();
  const sent = await store.sendMessage({ to: '+15550001111', channel: 'sms', kind: 'confirmation', body: 'Hi', bookingId: 'bk_1' });
  assert.match(sent.id, /^msg_/);
  assert.equal(sent.simulated, true);
  assert.equal(pool.rows.outbox.length, 1);
  assert.equal(store.outbox.length, 1);
});

test('rows survive a restart: a second store on the same pool loads them back', async () => {
  const pool = new FakePool();
  const first = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  first.pool = pool;
  await first.init();
  const date = nextWeekday();
  await first.addBooking({
    serviceId: 'oil-change', date, startTime: '09:00',
    customerName: 'Test Driver', phone: '+15550001111', channel: 'sms',
  });
  await first.close();
  const second = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  second.pool = pool;
  await second.init();
  assert.equal(second.bookings.length, 1);
  assert.equal(second.bookings[0].customerName, 'Test Driver');
  assert.equal(second.listBookings(date).length, 1);
});

test('resolveStore returns null when DATABASE_URL is unset', async () => {
  const { resolveStore } = require('../server');
  const prev = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await resolveStore({ business: { name: 'FixIt Auto' } }, {}), null);
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL = prev;
  }
});

test('resolveStore falls back to null when Postgres is unreachable (free DB expiry safety net)', async () => {
  const { resolveStore } = require('../server');
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://invalid-host:5432/fake';
  try {
    // No pg package installed locally and the host does not exist: either
    // way the init fails inside the try, and the app must fall back to the
    // JSON store instead of crashing on startup.
    assert.equal(await resolveStore({ business: { name: 'FixIt Auto' } }, {}), null);
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prev;
  }
});

test('createServer accepts an injected PgStore: booking via HTTP hits Postgres', async () => {
  const pool = new FakePool();
  const store = new PgStore({ connectionString: 'postgres://fake/fake', slug: 'fixit-auto', Pool: FakePool });
  store.pool = pool;
  await store.init();
  const config = loadConfig(AUTO_CONFIG);
  const { server } = createServer(config, { dataDir: tmpDataDir(), store });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const date = nextWeekday();
    const res = await fetch(`http://localhost:${port}/api/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'oil-change', date, startTime: '09:00', customerName: 'Http Driver', phone: '+15550002222' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.booking.id, /^bk_/);
    assert.equal(pool.rows.bookings.length, 1);
    assert.equal(pool.rows.bookings[0].data.customerName, 'Http Driver');
    const list = await fetch(`http://localhost:${port}/api/bookings?date=${date}`);
    assert.equal((await list.json()).bookings.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  }
});
