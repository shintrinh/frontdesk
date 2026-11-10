# Requirements Document — FrontDesk Template

## Introduction

FrontDesk is a skeleton template for an "AI front desk" for US local businesses.
A missed call or text reaches the front desk; the front desk takes the booking,
collects intake, sends reminders, and shows the owner a dashboard. One JSON
config file fully describes a business; the template turns that config into a
working app. Two apps prove the template is versatile: FixIt Auto (auto repair,
dynamic repair estimates) and BrightSmile Dental (new-patient intake, 180-day
recall reminders).

The template is built with Kiro (spec-driven development): this spec, the
steering rules, and the hooks in `.kiro/` are part of the deliverable, not
scaffolding to delete.

## Glossary

- **Config**: one JSON file (`config/<business>.json`) that fully describes a
  front desk app: business, services, intake fields, estimates, reminders,
  channels. See `config/schema.json`.
- **Template core**: `template/` — the booking engine, intake, estimates,
  reminders, and dashboard. Zero dependencies, no build step.
- **Vertical**: one business type (auto repair, dental, vet clinic). A vertical
  differs from another only by config + its named dataset.
- **Vertical-generator**: `template/generate.js` — reads a config and scaffolds
  a runnable app directory.
- **Dataset**: a named, sourced JSON file under `datasets/` that the agent
  executes on (RepairPal price ranges, ADA CDT codes). Never invented numbers.
- **Estimate**: a price/time range returned for a symptom, quoted verbatim from
  the dataset with its source. An estimate is not a quote.

## Requirements

### Requirement 1: Config-driven app generation

**User Story:** As a shop owner, I want my front desk app to come from one
config file, so I can get a working app without writing code.

#### Acceptance Criteria

1. WHEN a valid config file is given to the vertical-generator, THEN the
   generator SHALL scaffold a runnable app directory containing config.json,
   server.js, package.json, README.md, and a smoke test.
2. WHEN the config fails validation, THEN the generator SHALL exit non-zero
   with a message naming the invalid field, and SHALL NOT create a partial app.
3. WHEN two configs differ only in services, intake fields, and reminders,
   THEN the two generated apps SHALL behave differently with no code change in
   the template core.
4. WHEN a generated app is started, THEN it SHALL serve its dashboard and API
   on one port with no login and no build step.

### Requirement 2: Booking engine

**User Story:** As a customer, I want to book a time that is actually free, so
I do not arrive to find the shop double-booked.

#### Acceptance Criteria

1. WHEN a date and service are requested, THEN the system SHALL return free
   start times on a 30-minute grid inside business hours, excluding slots that
   overlap an existing non-cancelled booking.
2. WHEN a date falls outside business days, THEN the system SHALL return an
   empty slot list marked closed.
3. WHEN a booking is created for a taken slot, THEN the system SHALL reject it
   with HTTP 409 and error code SLOT_TAKEN.
4. WHEN a booking is cancelled, THEN its slot SHALL become free again.

### Requirement 3: Intake

**User Story:** As a shop owner, I want the front desk to collect the fields my
vertical needs, so the appointment is usable without a callback.

#### Acceptance Criteria

1. WHEN a booking is created, THEN the system SHALL require every field listed
   in the config's intakeFields except those listed in intakeOptional.
2. WHEN a booking is missing a required intake field, THEN the system SHALL
   reject it with HTTP 400 and error code INTAKE_INCOMPLETE naming the field.
3. WHEN the business is a dental clinic and the patient is new, THEN the
   system SHALL additionally require insuranceProvider and healthHistory.
4. WHEN a booking is created, THEN the intake answers SHALL be stored with the
   booking and visible on the dashboard.

### Requirement 4: Repair estimates (auto vertical)

**User Story:** As a caller with a car problem, I want a price range before I
book, so I can decide whether to come in.

#### Acceptance Criteria

1. WHEN a symptom is submitted and the config enables estimates, THEN the
   system SHALL match symptom keywords against the named dataset and return
   its price range and time range verbatim, with the dataset source cited.
2. WHEN no dataset entry matches the symptom, THEN the system SHALL return
   matched=false and recommend a free inspection instead of inventing a price.
3. WHEN estimates are disabled in the config, THEN the endpoint SHALL return
   HTTP 400 with error code ESTIMATES_DISABLED.
4. WHEN an estimate is returned, THEN the response SHALL include the
   disclaimer that it is an estimate, not a quote.

### Requirement 5: Reminders and recalls

**User Story:** As a shop owner, I want confirmations and recalls computed from
real appointments, so no customer is forgotten and no fake reminder is sent.

#### Acceptance Criteria

1. WHEN a booked appointment starts within confirmHoursBefore, THEN it SHALL
   appear in the confirmations-due list until its reminder is sent.
2. WHEN a dental patient has no future booking and their last completed visit
   was at least recallDays ago, THEN they SHALL appear in the recalls-due list.
3. WHEN a vertical has recallDays null, THEN the recalls list SHALL be empty.
4. WHEN a reminder is sent, THEN the template SHALL record it in the outbox
   marked simulated, and SHALL NOT claim a real SMS or call was placed.

### Requirement 6: Owner dashboard

**User Story:** As a shop owner, I want one page that shows today's bookings,
due reminders, and sent messages, so I can run the front desk from my phone.

#### Acceptance Criteria

1. WHEN the dashboard is opened, THEN it SHALL render the business name,
   hours, and contact details from the loaded config.
2. WHEN the dashboard is opened, THEN it SHALL list today's appointments with
   customer, service, phone, and status.
3. WHEN the dashboard is opened, THEN it SHALL show confirmations and recalls
   due, each with a working send button.
4. WHEN the dashboard is opened, THEN it SHALL render its booking form fields
   from the config's intakeFields (not from hardcoded HTML).

### Requirement 7: No-login operation

**User Story:** As a judge, I want to open a generated app and use it
immediately, so I can verify it without credentials.

#### Acceptance Criteria

1. WHEN the app is started, THEN every page and API endpoint SHALL work
   without authentication.
2. WHEN the app is started, THEN it SHALL require no account, API key, or
   environment variable.

### Requirement 8: Provenance and honesty

**User Story:** As a judge, I want to trust that the code and data are what
they claim to be.

#### Acceptance Criteria

1. WHEN the repo is inspected, THEN every code file SHALL be new in the
   submission window (opened 2026-10-30); no file SHALL be copied from FenBig,
   AgentMart, or WEPOS.
2. WHEN a dataset is inspected, THEN it SHALL cite its real source and its
   honest limits; no fabricated row SHALL be presented as real data.
3. WHEN the repo is inspected, THEN `/.kiro` SHALL exist at the root and SHALL
   NOT be gitignored, and the repo SHALL carry an OSI license (MIT).
