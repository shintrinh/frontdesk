'use strict';
/**
 * Estimate engine (auto repair vertical).
 * Matches the caller's symptom words against a named dataset and returns the
 * dataset's price/time range verbatim, with the source cited. It never invents
 * a price: no keyword match means "no estimate — book an inspection".
 */
const fs = require('fs');
const path = require('path');

function loadDataset(datasetPath) {
  const absolute = path.resolve(datasetPath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function estimate(config, dataset, symptom, serviceId) {
  if (!config.estimate || config.estimate.enabled !== true) {
    return { error: 'ESTIMATES_DISABLED', message: 'This business does not offer estimates.' };
  }
  if (!symptom || !String(symptom).trim()) {
    return { error: 'SYMPTOM_REQUIRED', message: 'Describe the symptom to get an estimate.' };
  }
  const words = String(symptom).toLowerCase();
  let candidates = dataset.entries || [];
  if (serviceId) candidates = candidates.filter((e) => e.serviceId === serviceId);
  let best = null;
  let bestScore = 0;
  for (const entry of candidates) {
    const score = (entry.symptomKeywords || []).filter((k) => words.includes(k.toLowerCase())).length;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (!best) {
    return {
      matched: false,
      message: 'No estimate for that symptom — book a free inspection and the shop will quote after seeing the vehicle.',
      recommendation: 'brake-inspection',
      symptom,
    };
  }
  const service = config.services.find((s) => s.id === best.serviceId);
  return {
    matched: true,
    serviceId: best.serviceId,
    serviceName: service ? service.name : best.serviceId,
    symptom,
    priceMin: best.priceMin,
    priceMax: best.priceMax,
    timeMinMin: best.timeMinMin,
    timeMaxMin: best.timeMaxMin,
    basis: best.basis,
    dataset: dataset.name,
    source: dataset.source,
    disclaimer: 'Estimate only, not a quote. Actual cost depends on year/make/model, region, and the shop labor rate.',
  };
}

module.exports = { loadDataset, estimate };
