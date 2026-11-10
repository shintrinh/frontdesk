# Dataset decision (Day 1)

FrontDesk's Innovation claim rests on a **named dataset the agent actually executes
on** — not on invented numbers. Decision, recorded 2026-11-10:

## Auto repair — RepairPal Fair Price Estimator (September 2026)

- **File:** `auto-repair-estimates.sample.json`
- **What it is:** national average cost ranges (parts + labor) for five common jobs,
  keyed to the symptom words a caller actually says ("grinding" → brakes,
  "clicking, won't start" → starter). The estimate engine matches the caller's
  symptom against `symptomKeywords` and returns the range verbatim, with the
  source cited in the response.
- **Source:** RepairPal Fair Price Estimator, September 2026, as summarized by
  Zarla (November 2026). Pads + rotors row from the CostFlock 2026 compilation
  of RepairPal / ConsumerAffairs / Tekmetric. Links are in the JSON file.
- **Honest limits:** these are **national averages, not a quote** — cost depends
  on year/make/model, region, and the shop's labor rate. The full repair-manual
  dataset (Mitchell / ALLDATA book labor times + OEM parts catalogs) is
  proprietary and is **not** included. A real shop swaps this file for its own
  price book; the engine does not care where the ranges come from.

## Dental — ADA CDT procedure codes (CDT 2026)

- **File:** `ada-procedure-codes.sample.json`
- **What it is:** the most commonly billed general-dentistry codes (D0120, D0150,
  D0274, D1110, D1120, D2391, D2740, D4341, D4910, D0210, D0330) with category,
  plain-language name, and typical fee range. The dental app links every service
  to its CDT code, so intake and treatment planning speak the code set insurers
  actually use.
- **Source:** American Dental Association, Current Dental Terminology (CDT) 2026.
  Code numbers verified 2026-11-10 against public CDT 2026 references. Fee
  ranges: ADA Survey of Dental Fees 2024/2025 via CareRoute and
  DentalCleaningCost (April–May 2026). Links are in the JSON file.
- **Honest limits:** CDT codes and descriptors are copyright © American Dental
  Association. Fee ranges vary by region and payer and are **not a quote**.
  Verify against the current-year CDT manual or practice-management software
  before submitting any claim. Durations in the file are template scheduling
  defaults, not clinical guidance.

## What is NOT here

- No scraped or fabricated price book is presented as a shop's real prices.
- No patient data. Demo bookings in verification runs are created through the
  public API and labeled as samples.
- Day 2 may add a third dataset (vet clinic) the same way: a named, sourced
  sample file, never invented rows presented as real.
