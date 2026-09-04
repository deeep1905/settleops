# VIDEO SCRIPT — SettleOps demo (3 minutes)

Speakable voiceover for the buildathon submission video. Each scene has
what's on screen, what to say, and a rough time mark. Total ≈ 2:55 at a
calm pace. Numbers are the deterministic batch (seed 42) — whatever you
record will match the deployed site exactly.

- Deployed URL: https://settleops.vercel.app
- Local backup: `make dev` → console :5173, engine :8000
- If the site cold-starts, that's honest too — say "the engine is
  waking up, watch the loading state" — it's ~1–2 seconds.

---

## Scene 1 — the hook (0:00–0:15) · Landing page

[ON SCREEN] landing page, logo, tagline "the incident console for your books"

> Every night, a payment rail settles thousands of payments — and a
> finance team checks those numbers against their books. By hand. In a
> spreadsheet. When two systems that should agree don't, that pile of
> differences is an outage — nobody is treating it like one.

## Scene 2 — what this is (0:15–0:35) · scroll landing / "how it works"

[ON SCREEN] the loop diagram: ingest → match → diagnose → remediate →
page → postmortem

> SettleOps runs an SRE loop on reconciliation. It ingests two sources —
> the books ledger and the rail's settlement file — matches them with
> pure arithmetic, diagnoses every break into one of six classes, runs a
> bounded runbook, pages a human when the machine shouldn't decide, and
> writes a postmortem at the end.

## Scene 3 — the board (0:35–1:05) · Console / batch board

[ON SCREEN] KPI strip: 81.8% match rate, 12 incidents, 2 auto-resolved,
9 awaiting human, 5 paged, 1 SEV-1, 0.77h MTTR. Incident table below.

> Here's the live batch — sixty-six rows against sixty-six. The match
> rate is eighty-one point eight percent, and that number is the point:
> the seed plants exactly twelve breaks, and the tests assert the
> matcher finds exactly those — no more, no less. A demo with a perfect
> match rate is hiding its exceptions. This one proves them.

## Scene 4 — the SEV-1 (1:05–1:35) · Incident detail, currency mismatch

[ON SCREEN] timeline: detected → diagnosed → runbook → HUMAN_PAGED (S2)

> This is the one severity-one: a settlement arrived in the wrong
> currency. Watch the timeline — detected, diagnosed, runbook started,
> then the machine stops. Rule S2 says a currency mismatch never gets an
> automated action, because wrong-FX write-backs are unrecoverable. So
> it paged a human. That refusal is the product.

## Scene 5 — the human decides (1:35–2:05) · a PROPOSED incident → approve

[ON SCREEN] proposed action card, cursor clicks "Approve & close",
status flips to RESOLVED, human APPROVED event lands on timeline

> Here's a proposed journal adjustment — an amount drift the runbook
> can fix, but never silently. I approve it, the incident closes, and a
> human event lands on the audit trail in front of you. Every
> money-adjacent action in this system is a proposal or a page — the
> engine never writes to the books on its own.

## Scene 6 — Tally, the companion (2:05–2:30) · the chat ball

[ON SCREEN] drag Tally, type /breaks (zero tokens), then a free-form
question — note the brain label on the answer

> There's also Tally — the desk's companion. Slash commands are
> answered by the engine itself, zero tokens. Free-form questions go to
> an LLM — and every answer is labeled with the brain that produced it.
> The AI writes hints; it never touches matching, money, or severity.
> If the key is missing or the model fails, she falls back to a
> deterministic brain and the label says so.

## Scene 7 — the postmortem (2:30–2:50) · Postmortem view

[ON SCREEN] scroll to "could not resolve — and why"

> The batch ends the way any real incident ends — with a postmortem.
> Including the honest list: what the engine could not resolve, and why
> it refused to try. Nine items are still awaiting a human, and the
> report says exactly why each one stopped.

## Scene 8 — close (2:50–3:00) · back to landing, or the test run

[ON SCREEN] terminal: `make test` → all pass · `make report` → no diff

> Under it all: a hundred tests, five stopping rules, and numbers that
> regenerate bit-for-bit — CI fails if anyone hand-edits them. SettleOps.
> Reconciliation, with an on-call culture.

---

## Recording notes

- Speak scene 3's numbers slowly — they're the proof, not filler.
- Don't say "AI-powered". Say "deterministic core, labeled AI assist".
- If the demo feels fast, cut scene 6 before you cut scene 4 or 5 —
  the SEV-1 and the approval are the video.
- Local run for the terminal close-up: `make test` (≈100 checks), then
  `make report` — the terminal prints "no diff".
