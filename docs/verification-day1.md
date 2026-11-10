# Verification — Day 1 (2026-11-10)

All commands run from the repo root (`~/workspace/kiroween-frontdesk`),
Node v24.22.1. No step was faked: every result below is real output.

## 1. Tests — 14/14 pass

```bash
node --test "template/tests/*.test.js" "apps/fixit-auto/tests/*.test.js" "apps/brightsmile-dental/tests/*.test.js"
```

```
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

12 template tests (config validation, slot conflicts, estimate matching,
intake rules, reminder/recall computation, HTTP booking flow incl. 409) +
2 generated-app smoke tests (each generated app boots and answers
`/api/health` with its own business name).

Note: the first run of the generated smoke tests **failed** — the generator
emitted `require('../../template/...')` from `apps/<business>/tests/`, which
resolves one level too shallow. Fixed in `template/generate.js` (now
`../../../template/...`), apps regenerated, all 14 pass. This is the Day 1
bug the generator caught; the fix is in the pushed code.

## 2. Live run — template + both generated apps

```bash
node template/server.js --config config/fixit-auto.json --port 3101 &
node apps/fixit-auto/server.js --port 3102 &
node apps/brightsmile-dental/server.js --port 3103 &
```

Health (all three):

```json
{"ok":true,"business":"FixIt Auto","type":"auto-repair","version":"0.1.0-day1"}
{"ok":true,"business":"FixIt Auto","type":"auto-repair","version":"0.1.0-day1"}
{"ok":true,"business":"BrightSmile Dental","type":"dental-clinic","version":"0.1.0-day1"}
```

## 3. Booking flow (template, FixIt Auto)

Slots for 2026-11-10, oil-change:

```json
{"date":"2026-11-10","serviceId":"oil-change","slots":["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00"],"closed":false}
```

Booking created (201):

```json
{"booking":{"serviceId":"oil-change","date":"2026-11-10","startTime":"10:00","customerName":"Test Driver","phone":"+15550199","intake":{"vehicleYearMakeModel":"2019 Honda Civic","mileage":82000,"symptomDescription":"due for service"},"channel":"sms","status":"booked","id":"bk_317d478f","createdAt":"2026-11-10T05:02:33.500Z","reminderSent":false}}
```

- Double-booking the same slot → **409** (`SLOT_TAKEN`).
- Booking with a missing intake field → **400** (`INTAKE_INCOMPLETE`).

## 4. Estimate (symptom → RepairPal range)

`POST /api/estimate {"symptom":"grinding noise when I brake"}`:

```json
{"matched":true,"serviceId":"brake-pads","serviceName":"Brake Pad Replacement","symptom":"grinding noise when I brake","priceMin":335,"priceMax":394,"timeMinMin":60,"timeMaxMin":90,"basis":"RepairPal average cost, September 2026 (labor $122-$179, parts $213-$215)","dataset":"Auto repair estimate reference ranges (SAMPLE)","source":"RepairPal Fair Price Estimator, September 2026 ...","disclaimer":"Estimate only, not a quote. Actual cost depends on year/make/model, region, and the shop labor rate."}
```

- Unknown symptom → `matched:false`, recommends free inspection, no price invented.
- Same endpoint on the dental app → **400** (`ESTIMATES_DISABLED`).

## 5. Reminders + simulated send

`GET /api/reminders` listed the 10:00 booking as a confirmation due.
`POST /api/reminders/send` recorded a simulated SMS in the outbox:

```json
{"sent":{"id":"msg_0ad6eac9","sentAt":"2026-11-10T05:02:33.644Z","simulated":true,"to":"+15550199","channel":"sms","kind":"confirmation","body":"Hi Test Driver, this is FixIt Auto. Reminder: your Oil Change is on 2026-11-10 at 10:00. Reply YES to confirm or call (555) 010-0142.","bookingId":"bk_317d478f"}}
```

## 6. Dental recall (180 days)

A completed cleaning booking dated 2026-05-01 (Bob Ray, +15550102) was
created through the API; `GET /api/reminders` on the dental app returned:

```json
{"confirmations":[],"recalls":[{"phone":"+15550102","customerName":"Bob Ray","lastVisitDate":"2026-05-01","lastServiceId":"cleaning","daysSince":193,"recallDays":180,"due":true}]}
```

## 7. Dashboard

- `GET /` on the template and on the dental app → **200**, title
  `FrontDesk — Owner Dashboard`.
- Dashboard renders services, intake fields, and the estimate card from
  `/api/config` (verified by the two apps showing different businesses,
  services, and intake forms from the same page).

## 8. Cleanup

All three servers stopped. Runtime data files (`data/*.json`) created during
this run were deleted; they are gitignored and are not part of the repo.
