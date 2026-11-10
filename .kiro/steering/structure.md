---
inclusion: fileMatch
fileMatchPattern: "**/*"
---

# Structure — FrontDesk

```
frontdesk/
├── .kiro/
│   ├── specs/
│   │   ├── frontdesk-template/   # requirements.md, design.md, tasks.md
│   │   └── add-vertical/         # worked example: how to add a vertical
│   ├── steering/                 # product.md, tech.md, this file
│   ├── hooks/                    # *.json, v1 schema (IDE 1.0 / CLI V3)
│   └── agents/                   # vertical-config-reviewer.md
├── config/                       # schema.json + one JSON per business
│   ├── empty.json                # blank starting point for a new vertical
│   └── paws-vet.json             # worked example (vet clinic, 365-day recall)
├── datasets/                     # named, sourced sample datasets + README
├── template/                     # the reusable core
│   ├── lib/                      # config, booking, estimate, reminders, store
│   ├── public/                   # generic dashboard (fallback for new types)
│   ├── public-auto/              # estimate-first dashboard
│   ├── public-dental/            # recall-first dashboard
│   ├── tests/                    # node:test suites (smoke, generator, CLI, PBT)
│   ├── server.js                 # zero-dep entry point
│   ├── cli.js                    # second surface: validate/generate/slots/estimate/bookings/serve
│   └── generate.js               # vertical-generator: config -> app
├── apps/
│   ├── fixit-auto/               # generated from config/fixit-auto.json
│   └── brightsmile-dental/       # generated from config/brightsmile-dental.json
├── docs/                         # verification logs + DEPLOY.md
├── render.yaml                   # Render Blueprint (both apps, free tier)
└── README.md
```

## Where things go

- New business logic → `template/lib/`, with a test in `template/tests/`.
- New vertical → add `config/<business>.json` + run the generator. Do not
  copy `template/` into the app; the generated `server.js` is a thin wrapper
  that requires the template core.
- New dataset → `datasets/<name>.sample.json` with `source`, `accessed`,
  and an honest `scope` note, plus a paragraph in `datasets/README.md`.
- Verification evidence → `docs/verification-day<N>.md` (commands + real output).
