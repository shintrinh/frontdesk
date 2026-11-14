'use strict';
/**
 * Postgres-backed store with the same interface as lib/store.js.
 *
 * Same in-memory arrays (.bookings / .outbox) so server.js reads stay
 * synchronous; mutations are async (write-through to Postgres, then update
 * memory). That is the whole point: on Render's free tier the JSON-file
 * snapshot is wiped on every restart, while rows in Postgres survive.
 *
 * The Pool class is injected (opts.Pool) so tests can pass a fake; by
 * default it is require('pg').Pool, loaded lazily inside the constructor,
 * so the JSON-file path never loads the pg package.
 *
 * Schema (created by init, one table per kind, rows scoped by slug so both
 * apps can share one database):
 *   frontdesk_bookings (slug TEXT, id TEXT PRIMARY KEY, data JSONB)
 *   frontdesk_outbox   (slug TEXT, id TEXT PRIMARY KEY, data JSONB)
 */
const { newId } = require('./store');

const BOOKINGS_TABLE = 'frontdesk_bookings';
const OUTBOX_TABLE = 'frontdesk_outbox';
const KIT_CONFIGS_TABLE = 'frontdesk_kit_configs';

class PgStore {
  constructor({ connectionString, slug, Pool }) {
    if (!connectionString) throw new Error('PgStore needs a connectionString (DATABASE_URL)');
    if (!slug) throw new Error('PgStore needs a slug');
    const PoolClass = Pool || require('pg').Pool;
    this.pool = new PoolClass({ connectionString, max: 5 });
    this.slug = slug;
    this.bookings = [];
    this.outbox = [];
    this.kitConfigs = [];
    this.location = `postgres:${slug}`;
  }

  async init() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${BOOKINGS_TABLE} (slug TEXT NOT NULL, id TEXT PRIMARY KEY, data JSONB NOT NULL)`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${OUTBOX_TABLE} (slug TEXT NOT NULL, id TEXT PRIMARY KEY, data JSONB NOT NULL)`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${KIT_CONFIGS_TABLE} (slug TEXT NOT NULL, id TEXT PRIMARY KEY, data JSONB NOT NULL)`,
    );
    const booked = await this.pool.query(
      `SELECT data FROM ${BOOKINGS_TABLE} WHERE slug = $1 ORDER BY data->>'date', data->>'startTime'`,
      [this.slug],
    );
    this.bookings = booked.rows.map((r) => r.data);
    const sent = await this.pool.query(
      `SELECT data FROM ${OUTBOX_TABLE} WHERE slug = $1 ORDER BY data->>'sentAt'`,
      [this.slug],
    );
    this.outbox = sent.rows.map((r) => r.data);
    const kits = await this.pool.query(
      `SELECT data FROM ${KIT_CONFIGS_TABLE} WHERE slug = $1 ORDER BY data->>'receivedAt' DESC`,
      [this.slug],
    );
    this.kitConfigs = kits.rows.map((r) => r.data);
    return this;
  }

  async addBooking(booking) {
    booking.id = newId('bk');
    booking.createdAt = new Date().toISOString();
    booking.status = booking.status || 'booked';
    booking.reminderSent = false;
    await this.pool.query(
      `INSERT INTO ${BOOKINGS_TABLE} (slug, id, data) VALUES ($1, $2, $3)`,
      [this.slug, booking.id, JSON.stringify(booking)],
    );
    this.bookings.push(booking);
    return booking;
  }

  getBooking(id) {
    return this.bookings.find((b) => b.id === id) || null;
  }

  listBookings(date) {
    const rows = date
      ? this.bookings.filter((b) => b.date === date)
      : this.bookings.slice();
    return rows.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  }

  async cancelBooking(id) {
    const booking = this.getBooking(id);
    if (!booking) return null;
    booking.status = 'cancelled';
    await this.pool.query(
      `UPDATE ${BOOKINGS_TABLE} SET data = $1 WHERE slug = $2 AND id = $3`,
      [JSON.stringify(booking), this.slug, id],
    );
    return booking;
  }

  async markReminderSent(id) {
    const booking = this.getBooking(id);
    if (!booking) return null;
    booking.reminderSent = true;
    await this.pool.query(
      `UPDATE ${BOOKINGS_TABLE} SET data = $1 WHERE slug = $2 AND id = $3`,
      [JSON.stringify(booking), this.slug, id],
    );
    return booking;
  }

  async sendMessage(message) {
    const entry = { id: newId('msg'), sentAt: new Date().toISOString(), simulated: true, ...message };
    await this.pool.query(
      `INSERT INTO ${OUTBOX_TABLE} (slug, id, data) VALUES ($1, $2, $3)`,
      [this.slug, entry.id, JSON.stringify(entry)],
    );
    this.outbox.push(entry);
    return entry;
  }

  async addKitConfig(config) {
    const entry = {
      id: newId('kit'),
      receivedAt: new Date().toISOString(),
      business: config.business ? config.business.name : null,
      type: config.business ? config.business.type : null,
      config,
    };
    await this.pool.query(
      `INSERT INTO ${KIT_CONFIGS_TABLE} (slug, id, data) VALUES ($1, $2, $3)`,
      [this.slug, entry.id, JSON.stringify(entry)],
    );
    this.kitConfigs.unshift(entry);
    return entry;
  }

  listKitConfigs() {
    return this.kitConfigs.slice().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { PgStore };
