'use strict';
/**
 * In-memory store with JSON-file persistence.
 * Data lives in <dataDir>/<slug>.json (dataDir defaults to ./data next to the
 * working directory). The file is a snapshot, not a database: the template
 * keeps all state in memory while running and rewrites the snapshot on every
 * mutation. Delete the file to reset the demo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { twilioConfigured, sendSms } = require('./twilio');

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

class Store {
  constructor(dataDir, slug) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, `${slug}.json`);
    this.bookings = [];
    this.outbox = [];
    // Configs submitted from the FrontDesk kit (config builder page).
    // These are configs for OTHER businesses (future clients), not this
    // app's own config — the kit POSTs them here so the owner never has
    // to download and send a file.
    this.kitConfigs = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.bookings = Array.isArray(data.bookings) ? data.bookings : [];
        this.outbox = Array.isArray(data.outbox) ? data.outbox : [];
        this.kitConfigs = Array.isArray(data.kitConfigs) ? data.kitConfigs : [];
      }
    } catch (err) {
      // Corrupt snapshot: start empty rather than crash the demo.
      this.bookings = [];
      this.outbox = [];
      this.kitConfigs = [];
    }
  }

  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ bookings: this.bookings, outbox: this.outbox, kitConfigs: this.kitConfigs }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  addBooking(booking) {
    booking.id = newId('bk');
    booking.createdAt = new Date().toISOString();
    booking.status = booking.status || 'booked';
    booking.reminderSent = false;
    this.bookings.push(booking);
    this.save();
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

  cancelBooking(id) {
    const booking = this.getBooking(id);
    if (!booking) return null;
    booking.status = 'cancelled';
    this.save();
    return booking;
  }

  markReminderSent(id) {
    const booking = this.getBooking(id);
    if (!booking) return null;
    booking.reminderSent = true;
    this.save();
    return booking;
  }

  async sendMessage(message) {
    const entry = { id: newId('msg'), sentAt: new Date().toISOString(), simulated: true, ...message };
    if (twilioConfigured()) {
      // Real SMS via Twilio. A Twilio failure never blocks the booking:
      // the message is still recorded, marked not-simulated, with the
      // Twilio error attached so the shop owner can see what happened.
      const result = await sendSms({ to: message.to, body: message.body });
      entry.simulated = false;
      if (result.ok) entry.twilioSid = result.sid;
      else entry.twilioError = result.error;
    }
    this.outbox.push(entry);
    this.save();
    return entry;
  }

  addKitConfig(config) {
    const entry = {
      id: newId('kit'),
      receivedAt: new Date().toISOString(),
      business: config.business ? config.business.name : null,
      type: config.business ? config.business.type : null,
      config,
    };
    this.kitConfigs.push(entry);
    this.save();
    return entry;
  }

  listKitConfigs() {
    // Newest first. receivedAt is an ISO timestamp, so two configs sent
    // in the same millisecond tie — break the tie by insertion order
    // (later entries first) so the order is deterministic.
    return this.kitConfigs
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => b.entry.receivedAt.localeCompare(a.entry.receivedAt) || b.i - a.i)
      .map(({ entry }) => entry);
  }
}

module.exports = { Store, newId };
