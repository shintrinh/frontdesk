# Implementation Plan — FrontDesk Template

> Day 1 is done when every item below is checked and `node --test
> template/tests/` passes. Day 2/3 items stay unchecked until their day.

## Day 1 (2026-11-10) — Foundation

- [x] Repo skeleton: public repo `shintrinh/frontdesk`, MIT, `/.kiro` at root, never gitignored
  - _Requirements: 8.3_
- [x] Config schema v0 (`config/schema.json`) + two configs (`fixit-auto.json`, `brightsmile-dental.json`) following it exactly
  - _Requirements: 1.3_
- [x] Named datasets with real sources + honest limits (`datasets/*.sample.json`, `datasets/README.md`)
  - _Requirements: 4.1, 8.2_
- [x] Template core: config loader + validator (`template/lib/config.js`)
  - _Requirements: 1.2_
- [x] Booking engine: slot grid, conflict detection, intake validation (`template/lib/booking.js`)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_
- [x] Estimate engine: symptom → dataset range, verbatim + source + disclaimer (`template/lib/estimate.js`)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] Reminders: confirmations + 180-day recalls from real bookings (`template/lib/reminders.js`)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
- [x] Store: in-memory + JSON snapshot (`template/lib/store.js`)
  - _Requirements: 3.4_
- [x] Zero-dependency server + JSON API (`template/server.js`)
  - _Requirements: 7.1, 7.2_
- [x] Owner dashboard rendered from config (`template/public/`)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
- [x] Vertical-generator skeleton: config → runnable app + smoke test (`template/generate.js`)
  - _Requirements: 1.1, 1.4_
- [x] Tests: `node --test "template/tests/*.test.js"` green (smoke + generator)
- [x] Kiro workflow visible: spec (this file set) + steering + hooks in `.kiro/`
- [x] README: how config generates an app, how to run, datasets + sources, provenance note
- [x] Verification run: template + both generated apps booted, booking/intake/estimate/reminder flow exercised live (see `docs/verification-day1.md`)

## Day 2 (2026-11-11) — Two apps + Kiro depth

- [x] Generate both apps from config into `apps/fixit-auto/` and `apps/brightsmile-dental/` (full generation, not scaffold)
  - _Requirements: 1.1, 1.3_
- [x] App 1: dynamic estimate UI on the dashboard (symptom → range before booking)
  - _Requirements: 4.1_
- [x] App 2: insurance intake + 180-day recall UI on the dashboard
  - _Requirements: 3.3, 5.2_
- [x] Deploy both apps live (public URLs, no login)
  - _Requirements: 7.1_
  - _Done as deploy-ready: `render.yaml` Blueprint + `docs/DEPLOY.md`. No live
    deploy from this machine — no Render credentials here and Vercel is not
    connected. Live URLs need ~10 min in the Render dashboard (see DEPLOY.md)._
- [x] Empty template + worked example spec (judges can start from blank)
- [x] One property-based test, with a caught bug recorded if one is found
  - _Caught: bookings accepted on closed days (Sundays) — fixed in
    `template/lib/booking.js` + `template/server.js`, guarded by
    `template/tests/properties.test.js` (negative control run: fails without
    the fix, passes with it). See `docs/verification-day2.md`._
- [x] One custom agent or Power; one second surface (CLI / Crew / Web)
  - _Custom agent: `.kiro/agents/vertical-config-reviewer.md`. Second surface:
    the FrontDesk CLI (`template/cli.js` + `template/tests/cli.test.js`)._
- [x] Judges-run check: both apps boot with no login; fix blockers
  - _See `docs/verification-day2.md` §6 (clean-copy run)._

## Day 3 (2026-11-12) — Evidence + video + submit

- [ ] Pilot: 3 real people book through voice/SMS on the two apps; record time + success rate
  - _Requirements: 5.1_
- [ ] Video < 3 min: cold-open 3s, one villain, one real flow per app, live third-vertical (vet clinic) generation as the one-more-thing, end card + 1 CTA
  - _Video prep done early 2026-11-10: script v1 + 7 raw clips recorded (see `files/video/` in the goal workspace). Prep caught a video-blocking generator bug — generated apps hardcoded `require('../../template/server')`, so an app generated outside `apps/` crashed on boot (MODULE_NOT_FOUND). Fixed 2026-11-10 in `template/generate.js` (paths now computed relative to `--out` with `path.relative`); canonical `apps/` output is byte-identical to the committed apps; regression test boots a generated vet app from a temp dir. Full suite 32/32 in 3 timezones._
- [ ] Submit 2026-11-12 (Devpost): founder + LinkedIn + fenbig.com (Best Startup), 2 app folders, `/.kiro` at root, MIT license, public YouTube video
  - _Requirements: 8.3_
