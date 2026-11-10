'use strict';
/**
 * Reminders: appointment confirmations + recall cycle.
 * Confirmations: booked appointments starting within confirmHoursBefore.
 * Recalls: customers whose last completed visit was >= recallDays ago and who
 * have no future booking. Computed from real bookings only — nothing is
 * invented. Sends are SIMULATED in the template (recorded in the outbox);
 * a real Twilio send is wired per deployment, not in the template.
 */
/**
 * All booking times are wall-clock times in the business timezone
 * (config.business.timezone, e.g. America/New_York). Comparisons are done
 * in that wall-clock frame so results do not depend on the server's local
 * timezone. One known limit: wall-clock arithmetic treats every day as 24h,
 * so a confirmation window spanning a DST transition can be off by up to
 * one hour on that day.
 */
function wallMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm);
}

function nowWallMs(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return Date.UTC(+get('year'), +get('month') - 1, +get('day'), +get('hour') % 24, +get('minute'));
}

function businessTimeZone(config) {
  return (config.business && config.business.timezone) || 'UTC';
}

function startMs(booking, timeZone) {
  return wallMs(booking.date, booking.startTime);
}

function startDateTime(booking, timeZone) {
  return new Date(startMs(booking, timeZone));
}

function confirmationsDue(config, bookings, now = new Date()) {
  const timeZone = businessTimeZone(config);
  const nowMs = nowWallMs(now, timeZone);
  const windowMs = (config.reminders.confirmHoursBefore || 24) * 60 * 60 * 1000;
  return bookings
    .filter((b) => b.status === 'booked' && !b.reminderSent)
    .filter((b) => {
      const start = startMs(b, timeZone);
      return start > nowMs && start - nowMs <= windowMs;
    })
    .sort((a, b) => startMs(a, timeZone) - startMs(b, timeZone));
}

function recallsDue(config, bookings, now = new Date()) {
  const recallDays = config.reminders.recallDays;
  if (!recallDays) return [];
  const timeZone = businessTimeZone(config);
  const nowMs = nowWallMs(now, timeZone);
  const todayMs = Math.floor(nowMs / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24);
  const byPhone = new Map();
  for (const b of bookings) {
    if (!b.phone) continue;
    const list = byPhone.get(b.phone) || [];
    list.push(b);
    byPhone.set(b.phone, list);
  }
  const recalls = [];
  for (const [phone, list] of byPhone) {
    const future = list.some((b) => b.status === 'booked' && startMs(b, timeZone) > nowMs);
    if (future) continue;
    const completed = list
      .filter((b) => b.status === 'completed')
      .sort((a, b) => startMs(b, timeZone) - startMs(a, timeZone));
    if (completed.length === 0) continue;
    const last = completed[0];
    const lastDateMs = wallMs(last.date, '00:00');
    const daysSince = Math.floor((todayMs - lastDateMs) / (1000 * 60 * 60 * 24));
    if (daysSince >= recallDays) {
      recalls.push({
        phone,
        customerName: last.customerName,
        lastVisitDate: last.date,
        lastServiceId: last.serviceId,
        daysSince,
        recallDays,
        due: true,
      });
    }
  }
  return recalls.sort((a, b) => b.daysSince - a.daysSince);
}

function confirmationMessage(config, booking) {
  const service = config.services.find((s) => s.id === booking.serviceId);
  return `Hi ${booking.customerName}, this is ${config.business.name}. Reminder: your ${service ? service.name : 'appointment'} is on ${booking.date} at ${booking.startTime}. Reply YES to confirm or call ${config.business.phone}.`;
}

function recallMessage(config, recall) {
  return `Hi ${recall.customerName}, this is ${config.business.name}. It has been ${recall.daysSince} days since your last visit — time for your checkup. Reply to book or call ${config.business.phone}.`;
}

module.exports = { confirmationsDue, recallsDue, confirmationMessage, recallMessage };
