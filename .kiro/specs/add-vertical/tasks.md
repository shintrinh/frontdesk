# Implementation Plan — Add a Vertical (worked example: vet clinic)

> Day 2 deliverable: the empty template + this worked-example spec. The vet
> app itself is generated LIVE in the Day 3 demo video — do not generate
> `apps/paws-vet/` before the video.

## Tasks

- [x] Empty template: `config/empty.json` (validates clean, one placeholder service)
  - _Requirements: 1.1, 1.2_
- [x] Worked example config: `config/paws-vet.json` (vet clinic, 365-day recall)
  - _Requirements: 5.1, 5.2_
- [x] Spec: requirements, design, and this plan in `.kiro/specs/add-vertical/`
- [x] Review agent: `.kiro/agents/vertical-config-reviewer.md` (run it on the vet config before the video)
  - _Requirements: 3.1, 3.2_
- [x] Verify generation in a scratch dir (not `apps/`): `frontdesk generate --config config/paws-vet.json --out /tmp/paws-vet-check` + `node --test` there
  - _Requirements: 4.1, 4.2, 4.3_
- [ ] Day 3 (video): generate `apps/paws-vet/` live on camera from `config/paws-vet.json`, boot it, show `/api/health` and the dashboard
  - _Requirements: 4.4, 5.1, 5.2_

## Commands (copy-paste for the video)

```bash
cp config/empty.json config/paws-vet.json   # already done — show the file instead
node template/cli.js validate --config config/paws-vet.json
node template/cli.js generate --config config/paws-vet.json --out apps/paws-vet
node --test apps/paws-vet/tests/
node apps/paws-vet/server.js --port 3000
# Dashboard: http://localhost:3000/
```
