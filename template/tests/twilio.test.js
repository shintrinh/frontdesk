'use strict';
/* Twilio SMS helper tests. No real API calls: the helper is only
 * exercised for number normalization and the simulated fallback.
 * Run: node --test template/tests/  (from the repo root) */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { normalizePhone, twilioConfigured, sendSms } = require('../lib/twilio');
const { Store } = require('../lib/store');

function tmpDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontdesk-twilio-test-'));
}

function withoutTwilioEnv() {
  const saved = {};
  for (const key of ['TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_NUMBER']) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return () => {
    for (const key of ['TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_NUMBER']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

test('normalizePhone converts local and international forms to E.164', () => {
  assert.equal(normalizePhone('+84 984 362 262'), '+84984362262');
  assert.equal(normalizePhone('0984362262'), '+84984362262');
  assert.equal(normalizePhone('(555) 010-0147'), '+15550100147');
  assert.equal(normalizePhone('84984362262'), '+84984362262');
  assert.equal(normalizePhone('15550100147'), '+15550100147');
});

test('twilioConfigured is false when any credential is missing', () => {
  const restore = withoutTwilioEnv();
  try {
    assert.equal(twilioConfigured(), false);
    process.env.TWILIO_SID = 'ACx';
    process.env.TWILIO_TOKEN = 'tok';
    assert.equal(twilioConfigured(), false);
    process.env.TWILIO_NUMBER = '+18483153048';
    assert.equal(twilioConfigured(), true);
  } finally {
    restore();
  }
});

test('sendSms reports not-configured without calling the API', async () => {
  const restore = withoutTwilioEnv();
  try {
    const result = await sendSms({ to: '+84984362262', body: 'test' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'TWILIO_NOT_CONFIGURED');
  } finally {
    restore();
  }
});

test('sendMessage falls back to simulated when Twilio is not configured', async () => {
  const restore = withoutTwilioEnv();
  try {
    const store = new Store(tmpDataDir(), 'twilio-fallback-test');
    const sent = await store.sendMessage({ to: '+84984362262', channel: 'sms', kind: 'confirmation', body: 'Hi', bookingId: 'bk_1' });
    assert.match(sent.id, /^msg_/);
    assert.equal(sent.simulated, true);
    assert.equal(sent.twilioSid, undefined);
    assert.equal(store.outbox.length, 1);
  } finally {
    restore();
  }
});
