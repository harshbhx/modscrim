# Build log

The running record the PRD (§12.4) and SRS (§13.3, §15.1) ask for: decisions, day-0 results, Codex sessions and a short note per working session. Newest entries go at the top of each section.

## Decisions

| Date | Decision | Why | Source |
|---|---|---|---|
| | Day-0 outcome (PRD §12.1 decision table) | | Day-0 results below |
| | React version (18 or 19) | | SRS §9.1 leaves it open |
| | `GRADING_QUOTA_UNIT` and `GRADING_BATCH_SIZE` | | Day-0 step 5 |

## Day-0 kill test (SRS §13.3)

| Step | Measure | Result | Notes |
|---|---|---|---|
| 1-4 | Fresh-wave blocked before and after (local), points of improvement | | Gate: at least +20 points |
| 4 | Real-chat matches of proposed terms | | Must be 0 |
| 5 | Quota unit: request or line | | Sets `GRADING_QUOTA_UNIT` |
| 5 | Max lines per Check AutoMod Status request | | Sets `GRADING_BATCH_SIZE` |
| 5 | 429 headers and body; response shape; time per request | | |
| 5 | Twitch vs local agreement on 20 lines | | Gate: at least 90% |
| 6 | Two-word term `nitrodrop invalid` vs `nitrodrop.invalid`, `nitrodrop[.]invalid`, `nitrodrop dot invalid`, `invalid nitrodrop` | | Confirms or breaks A-01 |
| 7 | Alarm emit jitter p95 at 1.5 s | | Gate: under 250 ms |
| 8 | Rule finder CPU time, 20,000-line log | | NFR-04 |
| 9 | Webhook: chat typed to console count | | Target: within 5 s |

**Decision:** _(fill in from the PRD §12.1 table)_

## Codex sessions

Required for the Devpost submission. Get each ID with `/status` in Codex.

| Date | Area (core, worker, web) | Session ID | Tickets |
|---|---|---|---|
| | | | |

## Session notes

Template: date and time · tickets touched · what changed · test evidence (command and result) · next step.
