---
inclusion: always
---

# Tech — FrontDesk

## Stack

- **Node.js >= 20, zero dependencies, no build step.** The server uses only
  Node built-ins (`http`, `fs`, `path`, `crypto`). A judge runs an app with
  one command: `node server.js --port 3000`.
- **Tests:** `node:test` only (`node --test "template/tests/*.test.js"`). No test
  framework to install.
- **Storage:** in-memory Maps + a JSON snapshot in `./data/<slug>.json`,
  rewritten on every mutation. Delete the file to reset the demo. No database
  server, no credentials.

## Conventions

- Config is the only per-business input. If two verticals differ, the
  difference belongs in `config/<business>.json` or in a named dataset —
  never in a fork of the template core.
- Errors are machine-readable: `{ error: "SLOT_TAKEN", message: "..." }`
  with the right HTTP status (400 validation, 409 conflict, 404 missing).
- Times are local wall-clock strings (`HH:MM`) on a date (`YYYY-MM-DD`).
  Business days use the JavaScript `getDay()` convention (0 = Sunday).
- Every dataset row carries its source. An estimate returns the dataset
  range verbatim — the engine never invents a price.
- Run `node --check` on any JS file after editing it, and `node --test
  template/tests/` after finishing a spec task (see `.kiro/hooks/`).
