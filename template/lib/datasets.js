'use strict';
/**
 * Dataset loader: reads a named dataset JSON file from the repo root.
 * Datasets are the only place the template holds domain facts (repair price
 * ranges, ADA procedure codes). Each file cites its real source; see
 * datasets/README.md for the sourcing decision.
 */
const fs = require('fs');
const path = require('path');

function loadDatasetFile(relativePath) {
  const absolute = path.resolve(relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Dataset not found: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

module.exports = { loadDatasetFile };
