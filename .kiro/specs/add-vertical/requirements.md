# Requirements — Add a Vertical (worked example: vet clinic)

> Worked example for the Day 3 video: a third vertical (vet clinic) is added
> live from a blank config. This spec is the checklist the video follows.

## Introduction

A new vertical is a new business config, nothing else. The template core
never changes between verticals: the differences live in one JSON file, and
the vertical-generator turns it into a runnable app.

## Glossary

- **Vertical:** one kind of local business (auto repair, dental, vet, salon).
- **Config:** one JSON file (`config/<business>.json`) that fully describes a
  front desk app. See `config/schema.json` for the contract.
- **Generator:** `template/generate.js` (or `frontdesk generate` on the CLI).

## Requirements

### Requirement 1: Start from the empty template

**User Story:** As a shop owner, I want a blank config to fill in, so I never
start from another shop's details.

#### Acceptance Criteria

1. WHEN a new vertical is started, THE Config-Generator SHALL copy
   `config/empty.json` to `config/<business>.json`.
2. WHEN the copy is validated with
   `node template/cli.js validate --config config/<business>.json`, THE
   FrontDesk-CLI SHALL print `Valid:` and list the placeholder service.

### Requirement 2: The config describes the real shop

**User Story:** As a shop owner, I want the app to match my real hours,
services, and intake, so customers book what I actually offer.

#### Acceptance Criteria

1. WHEN the config is filled in, THE Config-Reviewer SHALL confirm
   `business.hours.days` lists only days the shop is open.
2. WHEN a service is added, THE Config-Reviewer SHALL confirm it has a unique
   `id`, a human name, and a `durationMin` that matches the real job.
3. WHEN the vertical takes prices, THE Config-Reviewer SHALL confirm every
   price range has a named dataset behind it; WHEN it cannot cite one, THE
   Config-Reviewer SHALL require `estimate.enabled: false`.
4. WHEN the vertical has a recall cycle, THE Config-Reviewer SHALL confirm
   `reminders.recallDays` is set (dental: 180, vet: 365); WHEN it has none,
   THE Config-Reviewer SHALL confirm `recallDays` is `null`.

### Requirement 3: Review before generation

**User Story:** As a shop owner, I want a second pair of eyes on the config,
so a typo in my hours does not become a broken app.

#### Acceptance Criteria

1. WHEN the config is complete, THE Vertical-Config-Reviewer agent
   (`.kiro/agents/vertical-config-reviewer.md`) SHALL be run on it.
2. WHEN the agent reports `VERDICT: FAIL`, THE Generator SHALL NOT be run
   until every finding is fixed.

### Requirement 4: Generate, test, run

**User Story:** As a shop owner, I want a working app minutes after the
config is done, so I can try it the same day.

#### Acceptance Criteria

1. WHEN the config passes review, THE Generator SHALL produce
   `apps/<business>/` with `config.json`, `server.js`, `package.json`,
   `README.md`, `public/` (the per-vertical dashboard), and
   `tests/smoke.test.js`.
2. WHEN the app is generated, THE Generator SHALL print the command to run it.
3. WHEN `node --test apps/<business>/tests/` runs, THE Test-Runner SHALL
   report zero failures.
4. WHEN the app is started with `node apps/<business>/server.js --port 3000`,
   THE App SHALL answer `/api/health` with the new business name and serve
   its dashboard at `/` with no login.

### Requirement 5: The worked example (vet clinic)

**User Story:** As a judge, I want to see a third vertical appear from a
config, so I believe the template generalizes.

#### Acceptance Criteria

1. WHEN the vet clinic config (`config/paws-vet.json`) is generated, THE
   Generator SHALL produce `apps/paws-vet/` with the generic dashboard
   (vet has no dedicated screen yet) and four services (wellness exam,
   vaccinations, dental cleaning, sick visit).
2. WHEN the vet app is started, THE App SHALL list 365-day recalls in
   `/api/reminders` (annual wellness cycle).
