'use strict';
/* Property-based tests (Day 2). Zero dependencies — a tiny deterministic
 * PRNG (mulberry32) + node:test. Every run uses fixed seeds, so failures
 * reproduce exactly; the seed is printed with each failure.
 *
 * Run: node --test template/tests/properties.test.js (from the repo root)
 *
 * Property 1 caught a real bug on Day 2: the booking API accepted bookings
 * on closed days (Sundays) even though /api/slots reported the shop closed.
 * Fixed in template/lib/booking.js (slotIsFree) + template/server.js
 * (POST /api/bookings returns 400 CLOSED); this file now guards it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../lib/config');
const { loadDataset, estimate } = require('../lib/estimate');
const { createServer } = require('../server');

const ROOT = path.join(__dirname, '..', '..');
const AUTO_CONFIG = path.join(ROOT, 'config', 'fixit-auto.json');
const DATASET = path.join(ROOT, 'datasets', 'auto-repair-estimates.sample.json');

// Deterministic PRNG so every run explores the same inputs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// YYYY-MM-DD for a base date + offset days, computed in UTC so the result
// never depends on the server's local timezone.
function datePlus(baseISO, offsetDays) {
  const [y, mo, d] = baseISO.split('-').map(Number);
  const t = Date.UTC(y, mo - 1, d) + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

const SERVICES = ['oil-change', 'brake-inspection', 'brake-pads', 'starter-replacement', 'alternator-replacement'];
const DURATIONS = { 'oil-change': 45, 'brake-inspection': 60, 'brake-pads': 60, 'starter-replacement': 120, 'alternator-replacement': 120 };
const GRID = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
const NAMES = ['Ana', 'Bob', 'Cara', 'Dan', 'Eve', 'Finn', 'Gail', 'Hank'];

test('property: no accepted booking is ever on a closed day, and no two accepted bookings overlap', async () => {
  const config = loadConfig(AUTO_CONFIG);
  for (const seed of [11, 22, 33]) {
    const rng = mulberry32(seed);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-pbt-'));
    const { server } = createServer(config, { dataDir });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const base = `http://localhost:${port}`;
    const accepted = [];
    const seenAttempts = new Map();
    try {
      for (let i = 0; i < 100; i += 1) {
        // Small pools on purpose: collisions must happen, or the property is vacuous.
        const serviceId = pick(rng, SERVICES);
        const date = datePlus('2026-11-10', Math.floor(rng() * 14)); // 14-day window, includes Sundays
        const startTime = pick(rng, GRID);
        const key = `${date}|${serviceId}|${startTime}`;
        const payload = {
          serviceId, date, startTime,
          customerName: pick(rng, NAMES), phone: `+1555${String(1000 + Math.floor(rng() * 9000))}`,
          intake: { vehicleYearMakeModel: '2019 Honda Civic', mileage: 82000, symptomDescription: 'pbt' },
          channel: 'sms',
        };
        const res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await res.json();
        if (seenAttempts.has(key)) {
          // A repeat of an already-accepted slot must always conflict.
          if (seenAttempts.get(key) === 201) {
            assert.equal(res.status, 409, `seed ${seed}: repeat of accepted ${key} must be 409, got ${res.status}`);
            assert.equal(body.error, 'SLOT_TAKEN');
          }
          continue;
        }
        seenAttempts.set(key, res.status);
        if (res.status === 201) {
          accepted.push({ ...payload, id: body.booking.id });
          // No accepted booking on a closed day.
          assert.ok(config.business.hours.days.includes(weekdayOf(date)),
            `seed ${seed}: booking accepted on closed day ${date} (weekday ${weekdayOf(date)})`);
        } else {
          // Anything else must be a clean rejection, never a crash.
          assert.ok([400, 409].includes(res.status), `seed ${seed}: unexpected status ${res.status} for ${key}`);
        }
      }
      // No two accepted bookings overlap on the same date.
      for (let a = 0; a < accepted.length; a += 1) {
        for (let b = a + 1; b < accepted.length; b += 1) {
          const x = accepted[a];
          const y = accepted[b];
          if (x.date !== y.date) continue;
          const overlap = overlaps(toMinutes(x.startTime), toMinutes(x.startTime) + DURATIONS[x.serviceId],
            toMinutes(y.startTime), toMinutes(y.startTime) + DURATIONS[y.serviceId]);
          assert.equal(overlap, false,
            `seed ${seed}: accepted bookings overlap: ${x.serviceId} ${x.date} ${x.startTime} vs ${y.serviceId} ${y.date} ${y.startTime}`);
        }
      }
      assert.ok(accepted.length > 0, `seed ${seed}: expected at least one accepted booking`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('property: an estimate returns a price only when a dataset keyword matches, and the range is always ordered', () => {
  const config = loadConfig(AUTO_CONFIG);
  const dataset = loadDataset(DATASET);
  const keywords = [...new Set(dataset.entries.flatMap((e) => e.symptomKeywords || []))];
  const distractors = ['purple', 'unicorn', 'wobble', 'squeaky toy', 'dashboard light is fine', 'smells like rain', 'radio static', 'cup holder stuck'];
  for (const seed of [7, 8, 9]) {
    const rng = mulberry32(seed);
    for (let i = 0; i < 50; i += 1) {
      const useKeyword = rng() < 0.5;
      const words = [];
      if (useKeyword) words.push(pick(rng, keywords));
      words.push(pick(rng, distractors));
      if (rng() < 0.5) words.push(pick(rng, distractors));
      const symptom = words.join(' ');
      const result = estimate(config, dataset, symptom);
      const expectedMatch = keywords.some((k) => symptom.toLowerCase().includes(k.toLowerCase()));
      assert.equal(result.matched, expectedMatch,
        `seed ${seed}: symptom ${JSON.stringify(symptom)} matched=${result.matched}, expected ${expectedMatch}`);
      if (result.matched) {
        assert.ok(typeof result.priceMin === 'number' && typeof result.priceMax === 'number', 'matched estimate must carry a price range');
        assert.ok(result.priceMin <= result.priceMax, `price range must be ordered: ${result.priceMin}–${result.priceMax}`);
        assert.ok(result.priceMin >= 0, 'price must not be negative');
        assert.ok(result.source && result.source.length > 0, 'matched estimate must cite its source');
      } else {
        assert.equal(result.priceMin, undefined, 'unmatched symptom must not carry a price');
        assert.equal(result.priceMax, undefined, 'unmatched symptom must not carry a price');
      }
    }
  }
});
