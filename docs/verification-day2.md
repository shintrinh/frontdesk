# Verification — Day 2 (2026-11-10, built early: Day 1 finished ahead of schedule)

All commands run from the repo root (`~/workspace/kiroween-frontdesk`),
Node v24.22.1, unless noted. No step was faked: every result below is real
output.

## 1. Tests — 31/31 pass, in three server timezones

```bash
node --test "template/tests/*.test.js" "apps/fixit-auto/tests/*.test.js" "apps/brightsmile-dental/tests/*.test.js"
```

| Server timezone | Tests | Pass | Fail |
|---|---|---|---|
| America/Los_Angeles | 31 | 31 | 0 |
| UTC | 31 | 31 | 0 |
| Asia/Tokyo | 31 | 31 | 0 |

Breakdown: 10 template smoke (incl. the closed-day regression test) +
6 generator (incl. per-vertical dashboard + empty/vet configs + Kiro
artifacts) + 6 CLI + 2 property-based + 3 FixIt Auto app + 4 BrightSmile
Dental app. Day 1 baseline was 14/14; Day 2 added 17 tests, all green.

## 2. The bug the PBT caught — bookings on closed days

Before the fix, the API accepted a booking on a Sunday even though
`/api/slots` reported the shop closed:

```bash
$ curl -s "http://localhost:3101/api/slots?date=2026-11-15&serviceId=oil-change"
{"date":"2026-11-15","serviceId":"oil-change","slots":[],"closed":true}

$ curl -s -X POST http://localhost:3101/api/bookings -d '{... "date":"2026-11-15" ...}'
# → 201 Created (WRONG: the shop is closed on Sundays)
```

Root cause: `slotIsFree()` in `template/lib/booking.js` checked hours and
overlaps but never checked whether the date's weekday is in
`business.hours.days`, and the `POST /api/bookings` handler never checked
either. `listSlots()` already returned `closed: true`, so the dashboard
showed no slots — but the API still took the booking.

Fix (`template/lib/booking.js`, `template/server.js`):

- `slotIsFree()` returns `false` on a closed day (via a new TZ-safe
  `weekdayOf()` helper using UTC math, and `isOpenDay()`).
- `POST /api/bookings` returns `400 { error: 'CLOSED' }` for a closed day.
- `listSlots()` now uses the same `weekdayOf()` instead of
  `new Date(date + 'T12:00:00').getDay()`.

After the fix:

```bash
$ curl -s -X POST http://localhost:3101/api/bookings -d '{... "date":"2026-11-15" ...}'
# → 400 {"error":"CLOSED","message":"The shop is closed on 2026-11-15"}
$ curl -s -X POST http://localhost:3101/api/bookings -d '{... "date":"2026-11-16" ...}'
# → 201 Created (Monday works)
```

Negative control (proves the property guards the bug): the fix was reverted
in a scratch copy at `/tmp/frontdesk-negctl` and the property suite was run
there — `property: no accepted booking is ever on a closed day...` **failed**
(1 fail), while the estimate property passed. With the fix restored, all 31
pass. The scratch copy was deleted afterwards.

## 3. Per-vertical dashboards

The generator now emits a per-vertical dashboard into each app's `public/`:

| App | Dashboard source | First thing a judge sees |
|---|---|---|
| FixIt Auto | `template/public-auto/` | "Repair estimate — before you book" with symptom → range → "Book this service" |
| BrightSmile Dental | `template/public-dental/` | "Patients due for recall" panel (180-day recalls) |
| Any other type (vet, …) | `template/public/` | Generic dashboard rendered from the config |

Verified live from the clean copy (see §6): `GET /` on the auto app
contains `Repair estimate — before you book`; on the dental app it contains
`Patients due for recall`.

## 4. CLI (second surface)

```bash
$ node template/cli.js validate --config config/fixit-auto.json
Valid: FixIt Auto (auto-repair)
  services: oil-change, brake-inspection, brake-pads, brake-pads-rotors, starter-replacement, alternator-replacement
  intake: vehicleYearMakeModel, mileage, symptomDescription
  estimates: enabled
  reminders: confirm 24h before, no recall cycle

$ node template/cli.js estimate --config config/fixit-auto.json --symptom "grinding noise when I brake"
Brake Pad Replacement: $335–$394, about 60–90 min
Basis: RepairPal average cost, September 2026 (labor $122-$179, parts $213-$215)
Source: RepairPal Fair Price Estimator, September 2026 ...

$ node template/cli.js bookings --config apps/fixit-auto/config.json
Bookings for FixIt Auto (1):
  2026-11-12 10:00  Oil Change  Judge Driver (+15550199)  [booked]  bk_...
```

All six CLI commands (`validate`, `generate`, `slots`, `estimate`,
`bookings`, `serve`) are covered by `template/tests/cli.test.js` (6 tests).

## 5. Empty template + vet worked example

```bash
$ node template/cli.js validate --config config/empty.json
Valid: Your Business (other)
$ node template/cli.js validate --config config/paws-vet.json
Valid: Paws & Claws Veterinary Clinic (vet-clinic)
  services: wellness-exam, vaccinations, dental-cleaning, sick-visit
  reminders: confirm 24h before, recall every 365 days

$ node template/cli.js generate --config config/paws-vet.json --out apps/paws-vet-check
Generated Paws & Claws Veterinary Clinic (vet-clinic)
  dashboard: template/public/
$ node --test "apps/paws-vet-check/tests/*.test.js"
# pass 2, fail 0
```

The scratch app was deleted afterwards — the vet app itself is generated
LIVE in the Day 3 video, not before. A completed wellness visit 400 days
ago appears in the vet app's `/api/reminders` as a recall with
`daysSince: 400, recallDays: 365, due: true` (verified via a live server).

## 6. Judges-run check (clean copy, no setup)

```bash
$ rm -rf /tmp/frontdesk-judges-run && cp -r ~/workspace/kiroween-frontdesk /tmp/frontdesk-judges-run
$ cd /tmp/frontdesk-judges-run
$ node --test "template/tests/*.test.js" "apps/fixit-auto/tests/*.test.js" "apps/brightsmile-dental/tests/*.test.js"
# tests 31, pass 31, fail 0
$ node apps/fixit-auto/server.js --port 3201 &
$ node apps/brightsmile-dental/server.js --port 3202 &
```

| Check | Result |
|---|---|
| `GET /api/health` (auto) | 200 `{"ok":true,"business":"FixIt Auto","type":"auto-repair"}` |
| `GET /api/health` (dental) | 200 `{"ok":true,"business":"BrightSmile Dental","type":"dental-clinic"}` |
| `GET /` (auto) | 200, contains `Repair estimate — before you book` |
| `GET /` (dental) | 200, contains `Patients due for recall` |
| Auto slots 2026-11-12 | 15 open slots for oil-change |
| Auto booking | 201 Created |
| Auto double-booking | 409 `SLOT_TAKEN` |
| Auto Sunday booking | 400 `CLOSED` |
| Dental new-patient w/o insurance | 400 `INTAKE_INCOMPLETE` |
| Dental recall (completed visit 200 days ago) | `recalls: [{customerName: "Bob Ray", daysSince: 200, recallDays: 180, due: true}]` |
| CLI from the clean copy | `validate` (vet) + `estimate` (auto) both work |

No login, no install step, no environment variables. Both servers stopped
and the clean copy deleted afterwards.

## 7. Deploy status — deploy-ready, not live

No deploy credentials exist in this build environment: `vercel status`
reports `not_connected`, and there is no Render account or API key here.
So no live URL was created from this machine.

Deploy-ready instead:

- `render.yaml` (Blueprint) defines both apps as free Render Web Services
  (`frontdesk-fixit-auto`, `frontdesk-brightsmile-dental`), root dirs
  `apps/fixit-auto` / `apps/brightsmile-dental`, start `node server.js`,
  health check `/api/health`.
- `docs/DEPLOY.md` has the exact 10-minute Render dashboard steps, the
  manual alternative, and the free-tier limits (sleep after ~15 min idle,
  ephemeral disk, simulated sends).

What is needed for the live URLs: a Render account (Alen's, the one hosting
AgentMart) and the Blueprint apply in the Render dashboard.

## 8. Cleanup

All test servers stopped. Runtime `data/` files created during verification
were deleted; they are gitignored and are not part of the repo.
