<p align="center">
  <img src="docs/logo.svg" width="112" alt="SettleOps — three rows agree, one doesn't; the amber diamond is the break" />
</p>

<h1 align="center">SettleOps</h1>

<p align="center"><strong>the incident console for your books</strong></p>

<p align="center">
  <a href="https://github.com/deeep1905/settleops/actions/workflows/ci.yml"><img src="https://github.com/deeep1905/settleops/actions/workflows/ci.yml/badge.svg" alt="ci" /></a>
  <img src="https://img.shields.io/badge/tests-97%20passing-brightgreen" alt="tests: 97 passing" />
  <img src="https://img.shields.io/badge/match%20rate-81.8%25-4f46e5" alt="match rate: 81.8%" />
  <img src="https://img.shields.io/badge/regeneration-bit--for--byte-0e1116" alt="regeneration: bit-for-bit" />
  <img src="https://img.shields.io/badge/python-3.11%2B-3776ab" alt="python 3.11+" />
  <img src="https://img.shields.io/badge/license-MIT-3a3a3a" alt="MIT" />
</p>

Reconciliation is the SRE problem nobody gave an SRE. Finance teams close
books by hand: they eyeball a settlement file against their ledger, chase
the differences in a spreadsheet, and hope nothing slips. Ops teams solved
this shape of problem years ago — detect, diagnose, run a bounded
runbook, page a human when the automation shouldn't decide, write a
postmortem. **SettleOps runs that loop on a payment reconciliation batch.**

Built for the **Razorpay AI Buildathon 2026 · Track 4 (AI Finance
Controller)** by [deeep1905](https://github.com/deeep1905) · synthetic
data, integer paise, test-mode only.

```
 ingest two sources → match deterministically → diagnose each break
   → remediate by runbook → page a human → write the postmortem
```

## What the demo batch shows

| metric | value | how you know it's honest |
|---|---|---|
| books / settlement rows | 66 / 66 | seeded generator, fixed clock |
| match rate | **81.8%** (54/66) | the generator *plants* exactly 12 breaks — tests assert the matcher finds exactly those, no more, no less |
| incidents | 12 | 6 classes: timing gap ×3, amount drift ×2, missing entry ×2, duplicate ×2, fee mismatch ×2, currency ×1 |
| auto-resolved | 2 | timing gaps that closed inside the T+3 window — bounded by stopping rule S3 (max 5) |
| awaiting human | 9 | every money-adjacent action is a proposal or a page, never a silent write |
| paged | 5 | ≥ ₹50,000, currency risk, unrecorded money, duplicates |
| MTTR (auto) | 0.77 h | fixed batch clock, deterministic |

Every number above regenerates bit-for-bit: `make report` (CI re-runs it
and fails on any diff). Numbers enter this repo only through
regeneration, never by hand.

## Quickstart

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
make test          # 97 tests — matcher ground truth, stopping rules, API, chat
make run           # engine on :8000
make console       # console on :5173  (or: open the deployed site)
```

No keys needed. The optional LLM assist (see below) is off by default —
the deterministic rules brain runs everything, replayable bit-for-bit.

## The loop, in one screen

1. **Ingest** — the books ledger (what the merchant thinks happened) vs
   the rail's settlement file (what actually paid). Razorpay-style shape:
   order_ref, UTR, settled_date, gross/net/fee. Integer paise only.
2. **Match** — deterministic, no LLM: order refs pair, fee must match the
   published schedule (2%, floor ₹2, cap ₹500), net must reconcile with
   gross − fee, currencies must agree, settle lag must sit inside the T+1
   SLA. Everything else becomes a break with evidence.
3. **Diagnose** — six-class taxonomy with severity and evidence derived
   from the records themselves.
4. **Remediate** — each class maps to a runbook (RBT-01…06) with five
   hard stopping rules:

| rule | what it prevents |
|---|---|
| S1 — ≥ ₹50,000 always pages a human | silent large-value auto-actions |
| S2 — currency mismatch never auto-acts | unrecoverable wrong-FX write-backs |
| S3 — max 5 auto-resolutions per batch | runaway automation |
| S4 — one automated action per incident, rejected proposals never re-proposed | unreviewed chains |
| S5 — proposals only, never silent writes | unapproved journal edits |

5. **Page a human** — in the console, you are the desk: approve or reject
   any proposed action on the incident page. Your decision is appended to
   the audit log as a `human` event.
6. **Postmortem** — match rate, resolution rate, MTTR, the honest
   could-not-resolve list with reasons, and what we'd change next.

## Where AI is (and is not)

The LLM is optional, bounded and labeled. With a key set
(`GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY`, Groq and Gemini
have free tiers), it writes one sentence of root-cause hypothesis per
unresolved break — always prefixed `AI-suggested:`, always overridable,
never in the matching path, never in the remediation path, never
changing severity or runbook. Without a key, a deterministic rules hint
is used and the label says `rules`. Any error falls back to rules; the
pipeline never fails because of the LLM.

## Tally — the companion you can pick up

Every view of the console carries a small presence: **Tally**, a round
page-aware chat companion (⌘K, or the ball in the corner). Pick her up
and put her anywhere on the desk — she drags, leans into the carry, and
remembers where you left her; her chat opens beside wherever she sits
and folds away when you walk off. Her face is alive and every
expression cross-fades rather than snaps: pupils that follow the
pointer, a blink on a slow clock, wide eyes while being carried, a
boing when an answer lands, and the amber break marker pulsing on her
antenna while she thinks. The same diamond is her status light — amber
when the deterministic brain answers, settled green when the live one
is on (a 0.6s cross-fade, never a badge). She knows which view you are
reading and answers in its context.

Two brains, same contract (`settleops/assistant.py`, rules T1-T5):

- **Slash commands** (`/status` `/breaks` `/awaiting` `/budget` `/pm`
  `/help`) are answered by the engine itself from live batch data —
  zero tokens, zero network.
- **Free-form questions** go to Groq when `GROQ_API_KEY` is set
  (default model `groq/compound-mini`, override with `TALLY_MODEL` /
  `TALLY_BASE_URL`). Context is kept frugal on purpose: a ~120-word
  live digest + the current page + the last 6 turns, answers capped at
  260 tokens — the free tier survives the demo.
- **Any failure** — no key, timeout, rate limit — falls back to a
  deterministic regex brain that answers from the same live digest.
  Every reply is tagged with the brain that produced it
  (`groq · <model>` / `regex · 0 tokens`), the same honesty as the
  diagnosis assist. Tally never moves money; it points at the gate.

Answers arrive the way thoughts do — **token by token**
(`POST /api/chat/stream`): a start frame names the brain, deltas land
as SSE, a done frame carries the mode and any navigation action. The
Groq path streams the model's real tokens; the deterministic brains
type themselves out in small word groups so `/status` lands like a
thought, not a dump. The one-shot `POST /api/chat` stays as the spare
tire — the client retries on it if the stream breaks.

## Layout

```
settleops/            the engine package
  generator.py        synthetic two-source data, ground truth by construction
  matcher.py          deterministic matching, graded evidence
  taxonomy.py         six break classes → severity + runbook
  runbooks.py         RBT-01…06 + the five stopping rules
  pipeline.py         the one loop + human_decide() (the only money gate)
  audit.py            append-only incident log (JSONL, replayable)
  llm.py              optional labeled diagnosis assist
  assistant.py        Tally — the chat companion (commands → groq → regex,
                     streamed token by token)
  postmortem.py       the SRE artifact
  api.py              FastAPI service (+ /api/chat, /api/chat/stream)
api/index.py          Vercel serverless entry
web/                  the console (React + Vite + Tailwind)
tests/                97 tests incl. planted-truth matcher proofs
results/              batch_report.json + postmortem.md (regeneration-only)
data/                 incident_log.jsonl (regeneration-only)
docs/                 logo.svg, PITCH.md, FORM_ANSWERS.md
DEPLOY.md             local + Vercel (and why not Render/Railway)
```

## Deploy

See **DEPLOY.md**. One command, free tier, and the URL does not sleep:
static assets are always-on, the Python function wakes per request
(~1-2s cold start, with an honest loading state in the console). Render
and Railway free tiers spin down after 15 idle minutes and take ~50s to
wake — a judge clicking your link sees a dead page. That is why Vercel.

## Limits (honest)

- Data is synthetic by design (the brief asks for 50+ records; we ship 66
  with planted ground truth). No real merchant data anywhere.
- The rail is a Razorpay-shaped settlement report in test-mode style; no
  live keys, no real money, no network calls without an LLM key.
- On serverless, human decisions persist for the life of the warm
  instance (the audit event is still recorded); locally, the whole batch
  is in-memory and deterministic per seed.
- The matcher handles the six planted classes plus the defensive branches;
  a production system needs fuzzy matching (names, partial refs) and a
  real persistence layer. What's here is the honest core loop.

## The mark

Three rows agree; one doesn't. The amber diamond is the break — the one
row that becomes an incident.

## License

MIT — see LICENSE.
