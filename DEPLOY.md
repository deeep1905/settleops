# DEPLOY — run it, put it on the internet, keep it awake

## 0. Why your preview link is not a public URL (read this first)

The link you see in this chat's preview panel is a **private window into the
build sandbox**, not a deployment. The platform proxies sandbox port 3000
through an authenticated tunnel tied to your session — only you, logged in
here, can reach it. It has no DNS name, no public IP, and the sandbox sleeps
and resets. That is why the world cannot open it.

A public URL needs the app running on compute with a public IP and a DNS
name — that is exactly what Render / Vercel / any host below gives you.
**Pushing to GitHub was never deployment**: GitHub stores the code, runs CI
on it, and renders the README. It does not run a FastAPI server.

So: two clicks separate you from a live URL. Everything below is already
wired — no code changes are needed on any host.

## 1. Run locally (60 seconds)

```bash
git clone https://github.com/deeep1905/settleops.git && cd settleops
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
make run        # engine → http://localhost:8000 (API docs at /docs)
make console    # console → http://localhost:5173
```

Zero environment variables. Deterministic seed on boot: same numbers on
every fresh start. `make test` runs the 100-test suite; `make report`
regenerates `results/` and `data/incident_log.jsonl` bit-for-bit.

Both at once: `make dev`.

## 2. The cheapest compute — the honest table

What the app actually needs: one small process (~120 MB RAM, a fraction of
a vCPU) serving FastAPI + static files, with SSE for chat. Tiny. Every
option below runs it comfortably; the differences are price, cold start,
and effort. Prices are approximate (early 2026) — check the host's page
before committing.

| Host | Free tier | Always-on cost | Cold start | SSE chat | Effort | Catch |
|---|---|---|---|---|---|---|
| **Vercel** (Hobby) | ✅ full | ₹0 | console: none (CDN) · API: ~1–2 s per request | ⚠️ 10 s function cap (hobby) — answers are short, so fine | 1 click | functions wake per request |
| **Render** (Free) | ✅ 750 h/month | ₹0 · Starter ~₹600/mo to never sleep | ~30–60 s after 15 min idle | ✅ unlimited | 1 click (blueprint in `render.yaml`) | sleeps when idle; card may be asked for verification |
| **Koyeb** (Free) | ✅ one web service | ₹0 · ~$5/mo after | sleeps on free tier | ✅ | small | free tier is capped at one service |
| **Hugging Face Spaces** (Docker SDK) | ✅ 2 vCPU · 16 GB | ₹0 · "always on" ~$5/mo | sleeps after ~48 h idle | ✅ | medium | URL is `<user>-settleops.hf.space` |
| **Cloud Run** (GCP) | ✅ 2 M req/mo scale-to-zero | ₹0 at demo traffic | ~2–8 s | ✅ (timeout configurable to 60 min) | medium (gcloud + this Dockerfile) | needs a GCP project + billing account |
| **Fly.io** | ❌ (new orgs) | ~$2–3/mo | none (VM kept on) | ✅ | medium | no free tier anymore |
| **Railway** (Hobby) | ❌ | ~$5/mo | none | ✅ | small | trial credit only |
| **Oracle Cloud Always Free** | ✅ forever: 4 ARM cores · 24 GB | ₹0 | none — it is a real VM | ✅ | high | signup wants a card; popular regions often "out of capacity" |
| **Hetzner CX22** | ❌ | ~₹350/mo | none | ✅ | medium (you run the Dockerfile) | cheapest paid always-on; no India region |
| ~~Glitch~~ | — | — | — | — | — | hosting retired in 2025 — avoid |

### The best option, and why

**For the buildathon demo link: Vercel (already wired).** It is ₹0, the
console is static on a CDN so **the page never sleeps** — a judge clicking
at 3 a.m. sees the site instantly, and the API wakes in ~1–2 s into an
honest "starting the engine…" state (which the console already handles
beautifully with pulsing boot numbers). No card, no cold-splash, the
shortest path from this repo to a URL: import → deploy.

**For a classic always-up server: Render (one click, this repo is ready).**
`render.yaml` + the `Dockerfile` build one process that serves the console
and the API on the same URL. Free tier runs 750 h/month — enough for 24/7 —
but sleeps after 15 idle minutes. If the judges click right after a long
idle gap, they wait ~30–60 s once. Upgrade to Starter (~₹600/mo) only if
that matters; for a one-week hackathon it rarely does. A free
UptimeRobot ping every 10 minutes against `/api/health` keeps it awake
anyway.

**For the cheapest always-on compute overall: Oracle Cloud Always Free** —
₹0 forever, no cold starts, 24 GB RAM (overkill by 200×). Choose it only
if you can finish the card verification and find a region with ARM
capacity. If Oracle fights you, a **Hetzner VPS (~₹350/mo)** is the
cheapest painless always-on box: `docker run -p 80:8000` and done.

One-line verdict: **Vercel for the link you paste in the submission, Render
as the one-click backup, Oracle/Hetzner when this becomes a product.**

## 3. Deploy to Render (one click, free)

The repo carries a Render blueprint (`render.yaml`) + a multi-stage
`Dockerfile` (console build → engine image, ~150 MB):

1. Push the repo (done).
2. Open <https://dashboard.render.com/select-repo?type=blueprint>
   (or Dashboard → New → Blueprint), pick `deeep1905/settleops`.
3. Approve the plan: one web service, free tier, Docker runtime. Deploy.
   First build ~3–4 minutes (npm ci + vite build + pip install).
4. You get `https://settleops-xxxx.onrender.com`. Verify:
   `/api/health` → `{"ok": true, ...}` and the console shows batch R42
   at 81.8%.
5. Optional: Environment → add `GROQ_API_KEY` (see §6), redeploy.

Notes: `autoDeploy` is on — every push to `main` redeploys. The same
`Dockerfile` also works on Koyeb, HF Spaces, Fly and Cloud Run if you
prefer those; only the platform's own port env (`PORT`, `K_PORT`…) differs,
and the entry already reads `$PORT`.

## 4. Deploy to Vercel (already wired, free, static never sleeps)

**Why Vercel:** free hobby tier with no spin-down — static assets are
always served instantly, and the Python function wakes per request
(~1–2 s cold start, with an honest "starting the engine…" state in the
console). No credit card needed. The one caveat: hobby functions cap at
10 s, so an unusually long streamed chat answer could truncate — Tally's
answers are short, and the one-shot `/api/chat` fallback still answers.

1. Push the repo (done — `github.com/deeep1905/settleops`).
2. Open https://vercel.com/new/clone?repository-url=https://github.com/deeep1905/settleops
   (or vercel.com → Add New → Project → import the repo).
3. Framework preset: **Other** (zero-config picks it up). The build is
   driven by `vercel.json`:
   - `buildCommand`: `cd web && npm install && npm run build`
   - `api/index.py` is the entrypoint: it exposes the FastAPI `app`
     and mounts `web/dist` with `StaticFiles`, which Vercel promotes
     to the CDN at build time — the API routes register first, so
     `/api/*` always answers from the engine and everything else
     serves the console. No rewrites: the app must see the original
     URL (a rewrite to `/api` is what once made every route 404).
4. Environment variables — all optional (see §6).
5. Deploy. Verify: `https://<project>.vercel.app/api/health` returns
   `{"ok": true, ...}` and the console shows batch R42 at 81.8%.

## 5. Demo semantics on serverless / sleeping hosts (honest notes)

- Every instance boots the same deterministic batch (seed 42), so the
  numbers a judge sees always match `results/` in the repo.
- Approve/reject decisions persist for the life of the warm instance;
  every decision is still recorded in the event log. A cold start resets
  to the deterministic batch — which is the documented behavior, not a
  bug to hide.
- The event log endpoint (`/api/log`) self-validates and returns any
  violations (should be `[]`).
- Render free sleeping? UptimeRobot (free) → new monitor →
  `https://<app>.onrender.com/api/health` every 10 min. That's it.

## 6. The LLM brain (optional, free)

Any one key turns the labeled AI hints on; no key → the deterministic
rules brain, and the demo is identical apart from the hint label.

| Variable | Where to get it | Cost |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys (`gsk_…`) | free tier |
| `GEMINI_API_KEY` | aistudio.google.com → API key (`AIza…`) | free tier |
| `OPENAI_API_KEY` | platform.openai.com | paid |

Set it in the host's environment variables UI (Render: Settings → Env
Vars; Vercel: Project → Settings → Environment Variables), redeploy, and
`/api/health` will report `"brain": "groq"`.

## 7. If something looks off

| Symptom | Check |
|---|---|
| console shows "engine unreachable" | `/api/health` in the browser; redeploy if the build failed (check host logs — usually a missing dependency) |
| API 500 on cold start | host logs; confirm `settleops/` package and `requirements.txt` are both committed at the repo root |
| Render deploys but URL times out | first cold wake after idle — wait 60 s, or set up the keep-awake ping (§5) |
| numbers differ from README | someone hand-edited `results/` — `make report` locally and commit; CI would have failed anyway |
| LLM hints missing | no key set — that's the default; labels say "rules" |

## 8. Security notes

- No secrets are committed. `.env` is gitignored; keys go only into the
  host's environment variables UI.
- The repo contains only synthetic data. Nothing real, nothing live.
- Rotate any token you used for pushing after the buildathon ends.
