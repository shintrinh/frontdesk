'use strict';
/**
 * Booking engine: slot grid from business hours, conflict detection.
 * Times are local wall-clock strings (HH:MM) on a date (YYYY-MM-DD).
 * A slot is free when no non-cancelled booking overlaps it.
 */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Weekday of a YYYY-MM-DD date, computed in UTC so the result never depends
// on the server's local timezone. 0 = Sunday, 6 = Saturday (getDay convention).
function weekdayOf(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function isOpenDay(config, date) {
  return config.business.hours.days.includes(weekdayOf(date));
}

function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function listSlots(config, date, serviceId, bookings) {
  const service = config.services.find((s) => s.id === serviceId);
  if (!service) return { error: `unknown service: ${serviceId}` };
  if (!isOpenDay(config, date)) return { slots: [], closed: true };

  const open = toMinutes(config.business.hours.open);
  const close = toMinutes(config.business.hours.close);
  const duration = service.durationMin;
  const taken = bookings
    .filter((b) => b.date === date && b.status !== 'cancelled')
    .map((b) => {
      const s = config.services.find((x) => x.id === b.serviceId);
      return [toMinutes(b.startTime), toMinutes(b.startTime) + (s ? s.durationMin : 60)];
    });

  const slots = [];
  for (let start = open; start + duration <= close; start += 30) {
    const end = start + duration;
    if (taken.some(([ts, te]) => overlaps(start, end, ts, te))) continue;
    slots.push(toHHMM(start));
  }
  return { slots, closed: false };
}

function slotIsFree(config, date, serviceId, startTime, bookings) {
  const service = config.services.find((s) => s.id === serviceId);
  if (!service) return false;
  // A closed day has no free slot, whatever the clock says.
  if (!isOpenDay(config, date)) return false;
  const start = toMinutes(startTime);
  const end = start + service.durationMin;
  if (start < toMinutes(config.business.hours.open) || end > toMinutes(config.business.hours.close)) return false;
  return !bookings
    .filter((b) => b.date === date && b.status !== 'cancelled')
    .some((b) => {
      const s = config.services.find((x) => x.id === b.serviceId);
      const bs = toMinutes(b.startTime);
      return overlaps(start, end, bs, bs + (s ? s.durationMin : 60));
    });
}

function validateIntake(config, intake) {
  const required = config.intakeFields.filter((f) => !(config.intakeOptional || []).includes(f));
  const missing = required.filter((f) => intake[f] === undefined || intake[f] === null || String(intake[f]).trim() === '');
  if (missing.length > 0) return `missing intake fields: ${missing.join(', ')}`;
  // Dental: a new patient must also give insurance + health history.
  if (config.business.type === 'dental-clinic' && intake.isNewPatient === true) {
    const extra = ['insuranceProvider', 'healthHistory'].filter((f) => !intake[f] || String(intake[f]).trim() === '');
    if (extra.length > 0) return `new patient intake requires: ${extra.join(', ')}`;
  }
  return null;
}

module.exports = { listSlots, slotIsFree, validateIntake, toMinutes, toHHMM, weekdayOf, isOpenDay };
