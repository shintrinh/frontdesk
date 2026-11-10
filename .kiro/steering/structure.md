---
inclusion: fileMatch
fileMatchPattern: "**/*"
---

# Structure — FrontDesk

```
frontdesk/
├── .kiro/
│   ├── specs/frontdesk-template/   # requirements.md, design.md, tasks.md
│   ├── steering/                   # product.md, tech.md, this file
│   └── hooks/                      # *.json, v1 schema (IDE 1.0 / CLI V3)
├── config/                         # schema.json + one JSON per business
├── datasets/                       # named, sourced sample datasets + README
├── template/                       # the reusable core
│   ├── lib/                        # config, booking, estimate, reminders, store
│   ├── public/                     # dashboard (renders from /api/config)
│   ├── tests/                      # node:test suites
│   ├── server.js                   # zero-dep entry point
│   └── generate.js                 # vertical-generator: config -> app
├── apps/
│   ├── fixit-auto/                 # generated from config/fixit-auto.json
│   └── brightsmile-dental/         # generated from config/brightsmile-dental.json
├── docs/                           # verification logs
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
