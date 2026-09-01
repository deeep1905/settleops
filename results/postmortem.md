# Postmortem — batch R42 (seed 42)

*Opened 2026-08-30T09:15:00 · 66 books rows · 66 settlement rows · 12 incidents.*

## The numbers

| metric | value |
|---|---|
| match rate | **81.8%** (54/66) |
| incidents | 12 |
| auto-resolved (bounded) | 2 |
| awaiting human decision | 9 |
| paged (human desk) | 5 |
| SEV-1 / SEV-2 / SEV-3 | 1 / 4 / 7 |
| mean time to resolve (auto) | 0.77 h |

## What the engine did

54 of 66 books lines matched the rail exactly (81.8%). The remaining 12 became incidents, each classified by the break taxonomy and handed to its runbook. 2 were resolved inside the automation budget (timing gaps that closed within the T+3 window); 9 carry a proposed action or a page and are waiting on a human decision. No adjustment was written to the books without an approval event — see the timeline.

## Break classes found

| class | runbook | count | outcome |
|---|---|---|---|
| AMOUNT_DRIFT | RBT-02 | 2 | PROPOSED |
| CURRENCY_MISMATCH | RBT-06 | 1 | PAGED |
| DUPLICATE_CHARGE | RBT-04 | 2 | PAGED |
| FEE_MISMATCH | RBT-05 | 2 | PROPOSED |
| MISSING_ENTRY | RBT-03 | 2 | PAGED |
| TIMING_GAP | RBT-01 | 3 | RESOLVED, TICKET |

## Could not resolve — and why (honest list)

| incident | class | sev | amount | why unresolved |
|---|---|---|---|---|
| INC-0003 | TIMING_GAP | SEV-3 | ₹8,430 | escalated: window/budget stopping rule |
| INC-0004 | AMOUNT_DRIFT | SEV-3 | ₹15,725 | adjustment drafted, awaiting human approval |
| INC-0005 | AMOUNT_DRIFT | SEV-3 | ₹2,378 | adjustment drafted, awaiting human approval |
| INC-0006 | MISSING_ENTRY | SEV-2 | ₹30,461 | money-adjacent action — needs the human desk |
| INC-0007 | MISSING_ENTRY | SEV-2 | ₹29,164 | money-adjacent action — needs the human desk |
| INC-0008 | DUPLICATE_CHARGE | SEV-2 | ₹5,052 | money-adjacent action — needs the human desk |
| INC-0009 | DUPLICATE_CHARGE | SEV-2 | ₹41,759 | money-adjacent action — needs the human desk |
| INC-0010 | FEE_MISMATCH | SEV-3 | ₹32,007 | adjustment drafted, awaiting human approval |
| INC-0011 | FEE_MISMATCH | SEV-3 | ₹6,117 | adjustment drafted, awaiting human approval |
| INC-0012 | CURRENCY_MISMATCH | SEV-1 | ₹13,827 | money-adjacent action — needs the human desk |

## What we would change next

- Feed the T+6 timing gap back to the payout-schedule owner (recurring class, not a one-off).
- Pre-validate fee schedule versions at ingest so fee mismatches surface before close, not after.
- Add a rails-side duplicate-dedup key so retries never double-settle.
- The currency mismatch is a config error: the FX route should be alerted on, not just reconciled around.

## Stopping rules that fired

| rule | what it prevented |
|---|---|
| S1 ≥ ₹50,000 pages a human | silent large-value auto-actions |
| S2 currency mismatch never auto-acts | wrong-FX write-backs |
| S3 max 5 auto-resolutions/batch | runaway automation |
| S4 no consecutive automated actions | unreviewed chains |
| S5 proposals only, never silent writes | unapproved journal edits |

*Regenerate this file with `make report`. Event log: 54 events, replayable from `data/incident_log.jsonl`.*