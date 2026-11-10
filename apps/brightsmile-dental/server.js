'use strict';
/**
 * Generated app entry point. Thin wrapper: the whole front desk runs from
 * the shared template core, driven by this app's config.json, with this
 * app's per-vertical dashboard from public/.
 */
const path = require('path');
const { start, loadConfig } = require('../../template/server');

const config = loadConfig(path.join(__dirname, 'config.json'));
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.PORT) || 3000;
start(config, { port, dataDir: path.join(__dirname, 'data'), publicDir: path.join(__dirname, 'public') });
