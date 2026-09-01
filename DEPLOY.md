# DEPLOY — run it, put it on the internet, keep it awake

## 1. Run locally (60 seconds)

```bash
git clone https://github.com/Deep1905/settleops.git && cd settleops
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
make run        # engine → http://localhost:8000 (API docs at /docs)
make console    # console → http://localhost:5173
```

Zero environment variables. Deterministic seed on boot: same numbers on
every fresh start. `make test` runs the 68-test suite; `make report`
regenerates `results/` and `data/incident_log.jsonl` bit-for-bit.

Both at once: `make dev`.

## 2. Put it on the internet — Vercel (10 minutes, free, never sleeps)

**Why Vercel and not Render/Railway:** free tiers on Render and Railway
spin down after ~15 idle minutes, and a cold wake takes 30–60 seconds —
anyone clicking your link at 3 a.m. sees a dead page. Vercel's hobby
tier has no spin-down: static assets are always served instantly, and
the Python function wakes per request (~1–2 s cold start, with an honest
"starting the engine…" state in the console). No credit card needed.

1. Push the repo (done — `github.com/Deep1905/settleops`).
2. Open https://vercel.com/new/clone?repository-url=https://github.com/Deep1905/settleops
   (or vercel.com → Add New → Project → import the repo).
3. Framework preset: **Other** (zero-config picks it up). The build is
   driven by `vercel.json`:
   - `buildCommand`: `cd web && npm install && npm run build`
   - `outputDirectory`: `web/dist`
   - `api/index.py` is deployed as the serverless function (rewrites
     send `/api/*` to it)
4. Environment variables (all optional):

   | Variable | Value | Effect |
   |---|---|---|
   | `GROQ_API_KEY` | `gsk_…` (free tier) | LLM diagnosis hints on (labeled, bounded) |
   | `GEMINI_API_KEY` | `AIza…` (free tier) | same |
   | `OPENAI_API_KEY` | paid | same |

   No key → the deterministic rules brain; the demo is identical apart
   from the hint label.
5. Deploy. Verify: `https://<project>.vercel.app/api/health` returns
   `{"ok": true, ...}` and the console shows batch R42 at 81.8%.

## 3. Demo semantics on serverless (honest notes)

- Each function instance boots the same deterministic batch (seed 42), so
  the numbers a judge sees always match `results/` in the repo.
- Approve/reject decisions persist for the life of the warm instance;
  every decision is still recorded in the event log. A cold start resets
  to the deterministic batch — which is the documented behavior, not a
  bug to hide.
- The event log endpoint (`/api/log`) self-validates and returns any
  violations (should be `[]`).

## 4. If something looks off

| Symptom | Check |
|---|---|
| console shows "engine unreachable" | `/api/health` in the browser; redeploy if the function failed to build (check Vercel logs — usually a missing dependency in requirements.txt) |
| API 500 on cold start | Vercel logs; confirm `settleops/` package and `requirements.txt` are both committed at the repo root |
| numbers differ from README | someone hand-edited `results/` — `make report` locally and commit; CI would have failed anyway |
| LLM hints missing | no key set — that's the default; labels say "rules" |

## 5. Security notes

- No secrets are committed. `.env` is gitignored; keys go only into
  Vercel's environment variables UI.
- The repo contains only synthetic data. Nothing real, nothing live.
- Rotate any token you used for pushing after the buildathon ends.
