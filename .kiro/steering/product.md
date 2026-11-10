---
inclusion: always
---

# Product — FrontDesk

## What this is

A skeleton template for an "AI front desk" for US local businesses. One JSON
config describes a business; the template turns it into a working app:
booking, intake, reminders, owner dashboard. Two apps prove versatility:
FixIt Auto (auto repair, dynamic estimates) and BrightSmile Dental
(new-patient intake, 180-day recall). Target: Kiroween 2026 Skeleton Crew
$5K + Best Startup $10K, presented as a FenBig product.

## Non-negotiable rules

- **100% new code in the submission window (opened 2026-10-30).** Never copy
  a file from FenBig, AgentMart, or WEPOS. Domain knowledge may be reused;
  code may not. Frameworks or starters must be disclosed in the README.
  (This template uses zero dependencies — Node built-ins only.)
- **Everything in English.** Code, comments, docs, UI, video.
- **Never gitignore `/.kiro`.** Specs, steering, and hooks are the evidence
  of deep Kiro use; judges inspect them.
- **No fabricated data presented as real.** Every dataset cites its real
  source and its honest limits (see `datasets/README.md`). Demo bookings are
  created through the public API and labeled as samples.
- **Sends are simulated in the template.** The outbox records simulated
  SMS/voice sends. Never claim a real message was placed until Twilio is
  wired at deploy time.
- **No login anywhere.** A judge must open an app and use it immediately.

## Voice

Short, direct, professional. Shop owners hate the word "AI" in customer
facing copy — the dashboard says "front desk", "reminder", "booking", not
"AI agent". Submissions and specs keep AI terminology and model IDs explicit,
because that is what judges score.
