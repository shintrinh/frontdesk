'use strict';
/**
 * Real SMS via the Twilio REST API, using only Node's built-in fetch
 * (no new npm dependency).
 *
 * Credentials come from the environment, never from code:
 *   TWILIO_SID     — Twilio Account SID (AC...)
 *   TWILIO_TOKEN   — Twilio Auth Token
 *   TWILIO_NUMBER  — the Twilio phone number messages are sent From,
 *                    in E.164 (e.g. +18483153048)
 *
 * When any of the three is missing, twilioConfigured() is false and the
 * stores fall back to the simulated outbox — the demo still works with
 * no Twilio account at all.
 *
 * Twilio trial accounts can only send to verified numbers; an
 * unverified To is rejected by Twilio and reported as an error, never
 * thrown — the booking still succeeds and the failure is recorded on
 * the outbox entry so the shop owner can see it.
 */
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_NUMBER,
  );
}

/**
 * Normalize a phone number to E.164.
 *   '+84 984 362 262'  -> '+84984362262' (already E.164, keep it)
 *   '0984362262'       -> '+84984362262' (VN mobile, drop the leading 0)
 *   '(555) 010-0147'   -> '+15550100147' (US 10-digit, assume +1)
 *   '84984362262'      -> '+84984362262' (VN country code, no +)
 *   '15550100147'      -> '+15550100147' (US country code, no +)
 */
function normalizePhone(to) {
  const raw = String(to || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    return `+84${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/**
 * Send one SMS. Never throws: on any failure it returns
 * { ok: false, error } so the caller can record it on the outbox entry.
 */
async function sendSms({ to, body }) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from = process.env.TWILIO_NUMBER;
  if (!sid || !token || !from) {
    return { ok: false, error: 'TWILIO_NOT_CONFIGURED' };
  }
  const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: normalizePhone(to), From: from, Body: body }),
    });
  } catch (err) {
    return { ok: false, error: `TWILIO_NETWORK_ERROR: ${err.message}` };
  }
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    // Non-JSON response: fall through with the HTTP status as the error.
  }
  if (!res.ok) {
    const detail = data.message || data.code || `HTTP_${res.status}`;
    return { ok: false, error: `TWILIO_${res.status}: ${detail}` };
  }
  return { ok: true, sid: data.sid, status: data.status };
}

module.exports = { twilioConfigured, normalizePhone, sendSms };
