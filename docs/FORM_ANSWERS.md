# FORM ANSWERS — Razorpay AI Buildathon submission

*Each answer maps claim → evidence. Nothing here is asserted; everything
regenerates by command.*

**Track:** 04 — AI Finance Controller
**Repo:** this repository · **Deploy:** see DEPLOY.md (Vercel, always-on)
**Demo video:** 3:00 walkthrough recorded from the deployed console
(script: docs/PITCH.md, "The three-minute demo").

---

**1. What did you build?**

SettleOps — an incident console for finance close. It ingests two
sources that should agree (a books ledger and a Razorpay-style settlement
report), matches them deterministically (81.8% match rate on the demo
batch: 54/66), turns every break into an incident with class, severity
and evidence, runs bounded remediation runbooks (RBT-01…06) under five
hard stopping rules, pages a human for every money-adjacent action, and
closes each batch with an SRE-style postmortem. The audit trail is an
append-only event log — every state change has an actor and a timestamp,
and the batch is replayable end to end.

*Evidence: the deployed console; `make report` → results/batch_report.json
+ results/postmortem.md; `python -m settleops` regenerates both.*

**2. Which problem does it solve?**

Reconciliation is done by hand: a human eyeballs the rail's settlement
file against the books and chases differences in a spreadsheet. It is
slow, unbounded (any difference can become hours of work), and unaudited
(decisions live in someone's head and spreadsheet). SettleOps applies
incident-response discipline: detect → diagnose → bounded runbook → page
a human → postmortem. The automation never silently touches money.

*Evidence: README "Why I built this" + docs/PITCH.md; the runbook table
with stopping rules S1–S5, each with a dedicated test.*

**3. How does AI carry the product?**

Deliberately bounded. The core loop (matching, classification, runbooks,
stopping rules) is deterministic code — matching is arithmetic, not
language. The LLM (optional; Groq/Gemini free tiers) writes one sentence
of root-cause hypothesis per unresolved break, always prefixed
"AI-suggested:", overridable, with a deterministic rules fallback. It is
never in the matching path, never in the remediation path, and never
changes severity or runbook. Any LLM error falls back to rules — the
pipeline cannot fail because of the model.

*Evidence: settleops/llm.py (labeled, bounded, fallback); tests
test_llm rules-fallback + "never in remediation path" checks; without a
key the whole demo runs on the rules brain.*

**4. Evidence of it working — the numbers.**

- 66 books rows vs 66 settlement rows, seed 42, fixed batch clock.
- Match rate 81.8% — provable: the generator *plants* exactly 12 breaks
  and the test suite asserts the matcher finds exactly those (no false
  positives, no misses).
- 12 incidents across 6 classes; 2 auto-resolved (timing gaps inside the
  T+3 window, inside the S3 budget); 9 awaiting human; 5 paged; 1 SEV-1.
- MTTR (auto) 0.77h on the fixed clock. 54 audit events, append-ordered,
  replayable (data/incident_log.jsonl).

*Evidence: `make test` (68 tests, incl. planted-truth proofs);
`make report`; CI re-runs the report and fails on any hand-edited number
(regeneration-only discipline).*

**5. The 50+ record batch?**

66 books records + 66 settlement records per batch, with 12 planted
breaks of six classes — above the brief's 50-record bar, with ground
truth registered by construction. `make report` reports the match rate
and the exception list; the postmortem's "Could not resolve — and why"
section is the honest exception list with reasons.

**6. One failure handled gracefully?**

The currency mismatch: SEV-1, the runbook refuses *any* automated
action (stopping rule S2), pages the human desk, and the incident
timeline shows exactly that refusal with its reason. Second example: a
timing gap at T+6 — outside the window — is detected, the re-check
fails, and it escalates to a ticket instead of forcing a resolution.

*Evidence: incident INC-0007 (currency) on the deployed board; tests
test_currency_never_auto_acted, test_timing_outside_window_escalates.*

**7. What's simulated?**

Everything financial is synthetic by design: the settlement report is
Razorpay-shaped test-mode data, amounts are integer paise, no real money
moves. The LLM brain is optional and off by default. The console and
every number in it are the real product.

**8. Run it yourself?**

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
make test && make run && make console
```
or open the deployed URL (DEPLOY.md §2 — Vercel, no sleep, no card).
