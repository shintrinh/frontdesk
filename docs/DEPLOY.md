# Deploy — FrontDesk apps live

> Status (Day 2, 2026-11-10): **deploy-ready, not yet deployed.** No deploy
> credentials exist in this build environment (no Render account connected
> here, Vercel is not connected), so nobody can push a live deploy from this
> machine. Everything needed to deploy is in the repo; the steps below take
> about 10 minutes in the Render dashboard.

## Option A — Render Blueprint (recommended, both apps at once)

1. Open the Render dashboard and sign in (the account that hosts
   `agentmart.fenbig.com` already works).
2. **New → Blueprint**, connect the repo `shintrinh/frontdesk`, branch `main`.
3. Render reads `render.yaml` at the repo root and shows two services:
   `frontdesk-fixit-auto` and `frontdesk-brightsmile-dental` (free plan).
4. Click **Apply**. Each service builds (nothing to build — zero
   dependencies) and starts `node server.js`.
5. Verify each URL:
   - `https://frontdesk-fixit-auto.onrender.com/api/health` →
     `{"ok":true,"business":"FixIt Auto",...}`
   - `https://frontdesk-brightsmile-dental.onrender.com/api/health` →
     `{"ok":true,"business":"BrightSmile Dental",...}`
   - Open each URL in a browser: the per-vertical dashboard loads with no
     login.

## Option B — Two manual Web Services (same result, more clicks)

1. **New → Web Service**, connect `shintrinh/frontdesk`.
2. FixIt Auto: Root Directory `apps/fixit-auto`, Runtime `Node`,
   Build Command `echo "zero dependencies — nothing to build"`,
   Start Command `node server.js`, Instance Type `Free`.
3. Repeat for BrightSmile Dental with Root Directory
   `apps/brightsmile-dental`.
4. Verify with the same `/api/health` checks as Option A.

## What the deploy needs

| Thing | Why | Where it comes from |
|---|---|---|
| A Render account | Only Render can create the services | Alen's existing Render account (the one hosting AgentMart) |
| GitHub access to `shintrinh/frontdesk` | Render pulls the code | The repo is public, so any Render account can connect it |
| Nothing else | No API keys, no database, no env vars | The apps store demo data in a JSON file on disk |

## Known limits of the free tier

- **Sleep:** free Web Services sleep after ~15 minutes idle. First load
  after a wake takes ~30–60 seconds. Judges should open the URL once, wait,
  and reload if the first attempt is slow. (Same behavior as AgentMart on
  Render free.)
- **Ephemeral disk:** bookings made on the live service disappear when the
  service restarts or redeploys — the demo resets to a clean slate. That is
  fine for judging (every judge gets a fresh shop), and the seed data is the
  config itself.
- **No real SMS/voice:** sends are simulated and recorded in the outbox
  (`/api/outbox`). A real deployment wires Twilio at the `sendMessage`
  point in `template/lib/store.js`.

## Local run (no deploy needed)

```bash
node apps/fixit-auto/server.js --port 3001
node apps/brightsmile-dental/server.js --port 3002
# Dashboards: http://localhost:3001/ and http://localhost:3002/
```

## After the URLs exist

Put the two live URLs in the Devpost submission (they are the "URL of the
running app" for each app folder) and in `README.md`. The submission form
accepts one URL per project; list the second URL in the project description
until Day 3, when the video shows both.
