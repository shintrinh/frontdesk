'use strict';
/**
 * Config loading + validation for FrontDesk.
 * A config is one JSON file that fully describes a front desk app.
 * Validation is hand-rolled against config/schema.json (no dependency).
 */
const fs = require('fs');
const path = require('path');

const ALLOWED_TYPES = ['auto-repair', 'dental-clinic', 'vet-clinic', 'salon', 'nail-salon', 'cafe', 'other'];
const ALLOWED_CHANNELS = ['voice', 'sms', 'email'];
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function fail(message) {
  throw new Error(`Invalid config: ${message}`);
}

function loadConfig(configPath) {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) fail(`file not found: ${absolute}`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (err) {
    fail(`not valid JSON: ${err.message}`);
  }
  validate(raw);
  raw._path = absolute;
  return raw;
}

function validate(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('root must be an object');
  if (cfg.language !== undefined && cfg.language !== 'en') fail('language must be "en"');

  const b = cfg.business;
  if (!b || typeof b !== 'object') fail('business is required');
  if (!b.name || typeof b.name !== 'string') fail('business.name is required');
  if (!ALLOWED_TYPES.includes(b.type)) fail(`business.type must be one of ${ALLOWED_TYPES.join(', ')}`);
  if (!b.timezone || typeof b.timezone !== 'string') fail('business.timezone is required');
  if (!b.hours || typeof b.hours !== 'object') fail('business.hours is required');
  if (!TIME_RE.test(b.hours.open || '')) fail('business.hours.open must be HH:MM');
  if (!TIME_RE.test(b.hours.close || '')) fail('business.hours.close must be HH:MM');
  if (!Array.isArray(b.hours.days) || b.hours.days.some((d) => d < 0 || d > 6)) {
    fail('business.hours.days must be an array of 0-6 (JS getDay convention)');
  }

  if (!Array.isArray(cfg.services) || cfg.services.length === 0) fail('services must be a non-empty array');
  const ids = new Set();
  for (const s of cfg.services) {
    if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) fail(`service id invalid: ${JSON.stringify(s.id)}`);
    if (ids.has(s.id)) fail(`duplicate service id: ${s.id}`);
    ids.add(s.id);
    if (!s.name || typeof s.name !== 'string') fail(`service ${s.id} needs a name`);
    if (!Number.isInteger(s.durationMin) || s.durationMin < 15) fail(`service ${s.id} durationMin must be >= 15`);
    if (s.priceEstimate !== null && s.priceEstimate !== undefined) {
      if (typeof s.priceEstimate.min !== 'number' || typeof s.priceEstimate.max !== 'number'
        || s.priceEstimate.min < 0 || s.priceEstimate.max < s.priceEstimate.min) {
        fail(`service ${s.id} priceEstimate must be null or {min,max} with 0 <= min <= max`);
      }
    }
  }

  if (!Array.isArray(cfg.intakeFields)) fail('intakeFields must be an array');
  const optional = new Set(cfg.intakeOptional || []);
  for (const f of optional) {
    if (!cfg.intakeFields.includes(f)) fail(`intakeOptional field "${f}" is not in intakeFields`);
  }

  if (!cfg.estimate || typeof cfg.estimate.enabled !== 'boolean') fail('estimate.enabled is required');
  if (!cfg.reminders || typeof cfg.reminders.confirmHoursBefore !== 'number') {
    fail('reminders.confirmHoursBefore is required');
  }
  if (!Array.isArray(cfg.channels) || cfg.channels.length === 0
    || cfg.channels.some((c) => !ALLOWED_CHANNELS.includes(c))) {
    fail(`channels must be a non-empty subset of ${ALLOWED_CHANNELS.join(', ')}`);
  }
  return true;
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { loadConfig, validate, slug };
