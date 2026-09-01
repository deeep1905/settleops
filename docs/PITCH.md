# PITCH — SettleOps in plain language

*This is the walkthrough in my own words — what I built, why, how to demo
it, and the questions I expect. Reading it top to bottom takes five
minutes; the demo itself takes three.*

## The one-liner

SettleOps treats every reconciliation break as an incident: it detects
the mismatch, diagnoses the root cause, runs a bounded remediation
runbook, pages a human when the automation shouldn't decide — and writes
a postmortem at the end. It's SRE discipline applied to finance close.

## Why I built this

The first time I watched a finance team close their books, I recognized
the shape from ops culture: two systems that should agree, a pile of
differences, a human triaging them by hand in a spreadsheet. Ops teams
solved exactly this problem years ago — monitoring, runbooks, paging,
postmortems. Finance still does it with eyeballs. That's the gap.

Reconciliation specifically: the payment rail settles what actually
happened, the books record what we think happened, and every difference
is either timing, a fee, a mistake, or money going somewhere it
shouldn't. Classifying that pile is exactly what an incident console
does.

## What it actually does (the loop)

1. **Ingest** — 66 books rows vs 66 settlement rows (synthetic, seeded,
   integer paise — no floats near money, ever).
2. **Match** — deterministic arithmetic, no AI: order refs pair up, fees
   are checked against the published schedule, net must equal gross
   minus fee, currencies must agree, settle lag must be within the
   T+1 SLA. 54 pairs reconcile. 12 become incidents.
3. **Diagnose** — each break is classified into one of six classes with
   severity and plain-language evidence.
4. **Remediate** — each class runs a runbook with hard stopping rules.
   Two timing gaps self-heal inside the T+3 window and auto-resolve.
   Everything money-adjacent stops at a proposal and pages a human.
5. **The human decides** — in the console you *are* the desk. Approve a
   proposed journal adjustment, or reject it and reopen the incident.
   The decision is logged as a human event on the incident's timeline.
6. **Postmortem** — the batch ends with the SRE artifact: numbers, the
   honest "could not resolve" list with reasons, and what to fix next.

## The three-minute demo

1. Open the deployed URL. The board shows the batch: **54 of 66 lines
   reconciled — the rest became incidents**, 81.8% match rate, KPI strip
   (12 incidents, 2 auto-resolved, 9 awaiting human, 5 paged, 1 SEV-1,
   0.77h MTTR).
2. Click the SEV-1 (currency mismatch) — show the timeline: detected →
   diagnosed → runbook started → **HUMAN_PAGED (S2: currency never
   auto-acts)**. No machine action anywhere.
3. Back to the board, click any PROPOSED incident (amount drift or fee
   mismatch) — show the proposed action, then click **Approve & close**.
   The status flips to RESOLVED and a `human` APPROVED event lands on
   the timeline. That's the audit trail being born in front of you.
4. Open **Postmortem** — scroll to "Could not resolve — and why": the
   engine lists exactly what it couldn't fix and why it refused to try.
5. Open **How it works** if there's time — the loop and the five
   stopping rules.
6. If asked for proof: `make test` (68 tests), `make report` (numbers
   regenerate bit-for-bit; CI fails on any hand-edit).

## Where the AI is (and is not)

The matcher is pure arithmetic — no LLM, because matching is not a
language problem. The LLM (optional, off without a key) writes one
sentence of root-cause hypothesis per unresolved break, labeled
"AI-suggested", never touching severity, runbook or remedy. The rules
fallback is deterministic. I put the AI where it helps a human read
faster, and kept it away from every decision that touches money.

## The stopping rules (the part I care about)

An automation that can spend is an automation that can go wrong at 3am.
Five rules, each with a dedicated test:

- S1: anything ≥ ₹50,000 pages a human — no exceptions, any class.
- S2: currency mismatches never get automated action (SEV-1 page).
- S3: max 5 auto-resolutions per batch — the rest escalate.
- S4: one automated action per incident; a rejected proposal is never
  re-proposed by the machine.
- S5: proposals only — the engine never writes to the books silently.

## Honest limits

Synthetic data (by design — seeded ground truth is what makes the
metrics provable). Razorpay-shaped test-mode data only, no real money.
On the deployed site, decisions live for the warm instance; the full
deterministic batch runs locally with `make run`. A production version
needs fuzzy matching and real persistence — this is the honest core
loop, not a claim of production-readiness.

## Questions I expect

**"Why is the match rate only 81.8%?"**
Because the seed plants exactly 12 breaks across all six classes. The
point isn't a high number — it's that the number is *provable*: the
generator registers what it planted, and the tests assert the matcher
finds exactly that. A reconciliation demo with a suspiciously perfect
match rate is hiding its exceptions, not handling them.

**"What happens with a false positive?"**
The matcher's evidence is attached to every break, the runbook's
proposal is human-approved before it matters, and a rejection reopens
the incident with the reason logged. The blast radius of a wrong
diagnosis is one incident card a human glances at.

**"Why not auto-fix everything it can?"**
Because bounded automation is the product. The five stopping rules are
the difference between an agent and a liability. The demo *shows* you
money it refused to touch without you.
