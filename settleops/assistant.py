"""settleops.assistant — Tally, the console's companion.

Tally is the small presence at the corner of the desk: page-aware,
honest about what it is, and cheap to keep around. Rules (tested in
tests/test_assistant.py):

  T1  slash commands (/status /breaks /awaiting /budget /pm /help)
      are answered by the engine itself from live batch data — zero
      tokens, zero network. Commands never spend the free plan.
  T2  free-form questions go to Groq (openai-compatible) when a key
      exists; any failure — no key, timeout, rate limit, bad model —
      falls back to the deterministic regex brain. The companion
      never breaks just because the provider did. Same philosophy
      as the matcher: the deterministic path is always there.
  T3  context stays frugal: a ~120-word live digest + the page the
      operator is on + the last 6 turns, answers capped at 260
      tokens. The free tier survives the demo.
  T4  page-aware: the regex brain biases to the view being read,
      and the LLM system prompt names the view too.
  T5  Tally reads and explains — it never moves money. The money
      gate is a human click, and Tally says so when asked.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request

from .models import BatchReport

# ------------------------------------------------------------------ pages

PAGES: dict[str, str] = {
    "home": "the overview — what SettleOps is, the live numbers, the proof layer",
    "board": "the board — the breaks with statuses, filters and decisions",
    "incident": "an incident — one break's evidence, runbook and decision",
    "postmortem": "the postmortem — how the batch closed, what could not resolve",
    "how": "how it works — the five-step loop, the stopping rules, the tests",
}

NAV_VIEWS = ("home", "board", "postmortem", "how")
NAV_LABELS = {
    "home": "the overview",
    "board": "the board",
    "postmortem": "the postmortem",
    "how": "how it works",
}


# ------------------------------------------------------------------ money

def _inr(paise: int) -> str:
    n = paise // 100
    s = str(n)
    if len(s) > 3:  # indian grouping: 1,00,000 not 100,000
        head, tail = s[:-3], s[-3:]
        parts: list[str] = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return f"₹{s}"


# ------------------------------------------------------------------ digest

def digest(batch: BatchReport) -> dict:
    """The live facts both brains are allowed to trust."""
    m = batch.metrics()
    inc = batch.incidents
    biggest = max(inc, key=lambda i: i.amount_paise)
    fx = next((i for i in inc if i.break_class == "CURRENCY_MISMATCH"), None)
    return {
        "batch": batch.batch_id,
        "rows": f"{batch.books_count} books ↔ {batch.settle_count} settlements",
        "match": batch.match_rate,
        "incidents": len(inc),
        "awaiting": m["awaiting_human"],
        "auto": m["auto_resolved"],
        "budget": f"{m['auto_resolved']}/5",
        "paged": m["paged"],
        "sev1": m["sev1"],
        "biggest": f"{_inr(biggest.amount_paise)} · {biggest.id} · {biggest.break_class.replace('_', ' ').lower()}",
        "fx": (f"{fx.id} ({fx.severity}) settled in {fx.currency} — paged, never auto-touched"
               if fx else "none in this batch"),
        "classes": ", ".join(sorted({i.break_class.replace("_", " ").lower() for i in inc})),
    }


# ------------------------------------------------------------------ commands

COMMANDS = ("/status", "/breaks", "/awaiting", "/budget", "/pm", "/help")


def _command(cmd: str, c: dict) -> str:
    if cmd == "/status":
        return (f"batch {c['batch']} · {c['rows']}\n"
                f"match rate {c['match']}% · {c['incidents']} incidents\n"
                f"{c['auto']} auto-resolved ({c['budget']} budget) · {c['awaiting']} waiting on a human\n"
                f"paged: {c['paged']} · biggest break: {c['biggest']}")
    if cmd == "/breaks":
        return ("the breaks, by class:\n"
                f"  · {c['classes']}\n"
                f"the heaviest is {c['biggest']}\n"
                f"{c['fx']}")
    if cmd == "/awaiting":
        return (f"{c['awaiting']} incidents are waiting on a human — mostly proposals "
                f"sitting at PENDING_APPROVAL. nothing lands in the books until "
                f"someone clicks. the board is the queue.")
    if cmd == "/budget":
        return (f"auto-resolve budget: {c['budget']} used this batch. the cap is "
                f"rule S3 — five per batch, reset each run, enforced by "
                f"test_auto_budget_respected. runaway automation stops itself.")
    if cmd == "/pm":
        return (f"the postmortem closes batch {c['batch']} at {c['match']}% matched: "
                f"{c['auto']} resolved themselves, {c['awaiting']} needed a human, "
                f"and the could-not-resolve list is written down rather than swept. "
                f"the full markdown is one view over.")
    return ("commands i answer without spending a token:\n"
            "  /status — the batch in one screen\n"
            "  /breaks — what broke, by class\n"
            "  /awaiting — what is waiting on you\n"
            "  /budget — auto-resolve budget used\n"
            "  /pm — the postmortem digest\n"
            "  /reset — clear this conversation\n"
            "  /help — this list\n"
            "or just ask in words — i keep up either way.")


# ------------------------------------------------------------------ intents

def _r(c: dict) -> str:
    return (f"the loop is five steps — ingest, match, diagnose, remediate, "
            f"postmortem. match is pure arithmetic (keys, fees, net vs gross, "
            f"currency, lag): no model in that path. diagnose sorts every break "
            f"into a six-class taxonomy. remediation is bounded runbooks and "
            f"proposals — never silent writes. the batch then closes with an "
            f"honest postmortem. the how-it-works view has the tests behind "
            f"each step.")


INTENTS: list[dict] = [
    {"id": "hello", "p": [r"^(hi|hey|hello|yo|namaste|hola|good (morning|evening|afternoon))\b"],
     "f": lambda c, p: ("hey — i'm tally. i read the console with you: i know "
                        f"which view is open, and every number i quote is live "
                        f"from batch {c['batch']}. try /status, or ask me "
                        f"anything about the loop.")},
    {"id": "who", "p": [r"who are you|what are you|introduce yourself|your name"],
     "f": lambda c, p: ("i'm tally — the desk's companion. two brains: a groq "
                        "model when a key is present, a deterministic regex "
                        "engine when it isn't. i explain the console, quote the "
                        "live batch, and point at views. i don't touch money — "
                        "that gate stays human.")},
    {"id": "what", "p": [r"what is settleops|what does settleops|what is this|what do you do|tell me about"],
     "f": lambda c, p: ("settleops runs the SRE loop on a payment batch: match "
                        f"the books ledger against the rail's settlement file "
                        f"deterministically, diagnose every break, remediate "
                        f"through bounded runbooks, page a human when the "
                        f"machine shouldn't decide, write the postmortem. right "
                        f"now that means batch {c['batch']} — {c['incidents']} "
                        f"incidents, {c['match']}% matched.")},
    {"id": "capa", "p": [r"what can you do|what do you know|^help\b|commands|slash|capabilit"],
     "f": lambda c, p: ("i answer from the live batch — statuses, breaks, the "
                        "loop, the rules, where the AI sits and doesn't. "
                        "commands (/status /breaks /awaiting /budget /pm "
                        "/help) cost zero tokens. a groq brain answers "
                        "free-form questions when a key is present; a regex "
                        "brain answers always. ask anything.")},
    {"id": "loop", "p": [r"the loop|how does it work|how it works|five steps|pipeline|stages|explain"],
     "f": lambda c, p: _r(c)},
    {"id": "rules", "p": [r"stopping rules|safety|guardrail|runaway|what if.*wrong|what if it breaks|can it spend|dangerous|bound|\bs[1-5]\b|hard gate|rule s"],
     "f": lambda c, p: ("five stopping rules, each with its own test: S1 — "
                        "anything ≥ ₹50,000 pages a human, no exceptions. S2 — "
                        "currency risk never auto-acts. S3 — max five "
                        "auto-resolves per batch. S4 — one automated action per "
                        "incident, ever. S5 — everything is a proposal: no "
                        "journal entry lands without an approval event. the "
                        "difference between an agent and a liability is written "
                        "down, and the suite enforces it.")},
    {"id": "biggest", "p": [r"biggest|largest|heaviest|worst|top break|max\b"],
     "f": lambda c, p: (f"the biggest break in {c['batch']} is {c['biggest']}. "
                        f"rule S1 pages a human at ₹50,000 — this one sits under "
                        f"the gate, so it runs as a proposal unless the class "
                        f"itself demands a page. the board has the full story.")},
    {"id": "awaiting", "p": [r"awaiting|waiting|my queue|for me|need me|what should i do"],
     "f": lambda c, p: (f"{c['awaiting']} incidents are waiting on you. the "
                        f"board is the queue — approve a proposal, reject one, "
                        f"or let the SEV-1 sit. every click lands on the "
                        f"timeline as a human event.")},
    {"id": "fx", "p": [r"fx|currency|sev-?1|paged|urgent|emergency"],
     "f": lambda c, p: (f"{c['fx']}. rule S2 is absolute — wrong-FX write-backs "
                        f"are unrecoverable, so currency never auto-acts at any "
                        f"amount. a human verifies, always.")},
    {"id": "match", "p": [r"match rate|matchrate|how many matched|accuracy"],
     "f": lambda c, p: (f"{c['match']}% of {c['rows']} matched clean — the "
                        f"number is what the data says, not what a demo wanted. "
                        f"the seed plants exactly {c['incidents']} breaks and "
                        f"the tests assert the matcher finds exactly those.")},
    {"id": "incidents", "p": [r"incidents?\b|breaks?\b|what broke|how many problems|list"],
     "f": lambda c, p: (f"{c['incidents']} incidents across {c['classes']}. "
                        f"{c['auto']} auto-resolved, {c['awaiting']} waiting on "
                        f"a human, {c['paged']} paged. the board has filters by "
                        f"class, severity and status.")},
    {"id": "pm", "p": [r"postmortem|aftermath|mttr|report|closure|summar"],
     "pages": ["postmortem"], "f": lambda c, p: (f"batch {c['batch']} closed at "
                        f"{c['match']}%: {c['auto']} auto-resolves, {c['awaiting']} "
                        f"human decisions, an MTTR the engine computes itself, "
                        f"and a could-not-resolve list that is written down "
                        f"rather than swept. the view over this chat has the "
                        f"full markdown.")},
    {"id": "ai", "p": [r"where.*\bai\b|\bllm\b|model|groq|brain|gpt|qwen|ai assist|which ai"],
     "f": lambda c, p: ("the AI has exactly one slot: a root-cause hypothesis "
                        "on each break, labeled AI-suggested, overridable, off "
                        "without a key — the rules brain is the fallback. i'm "
                        "the second slot: this chat. matching and remediation "
                        "stay deterministic; money decisions stay human.")},
    {"id": "budget", "p": [r"budget|auto.?resolve|how many auto|cap\b"],
     "f": lambda c, p: (f"{c['budget']} of the five auto-resolves are spent "
                        f"this batch. rule S3 resets the budget every run, so "
                        f"runaway automation stops itself before it becomes "
                        f"someone's 3 a.m.")},
    {"id": "tests", "p": [r"tests?\b|proof|trust|verify|audit|ci\b|reproducib|deterministic"],
     "f": lambda c, p: ("97 tests cover the matcher ground truth, the five "
                        "stopping rules, the API and the audit chain. the "
                        "report regenerates bit-for-bit from the data — CI "
                        "fails on any hand-edit. make test runs the whole "
                        "thing in seconds.")},
    {"id": "money", "p": [r"move (money|funds)|money|spend\b|write.*ledger|journal|can you (approve|act)"],
     "f": lambda c, p: ("i read and explain — i never move money. no journal "
                        "entry lands without an approval event from a human "
                        "click (rule S5). if a proposal deserves a yes, the "
                        "board is where that yes happens.")},
    {"id": "hackathon", "p": [r"hackathon|razorpay|buildathon|track|who built|team|submission"],
     "f": lambda c, p: ("settleops is the razorpay ai buildathon 2026, track 4 "
                        "entry — an ai finance controller that treats "
                        "reconciliation as an SRE problem. synthetic data, "
                        "integer paise, deterministic seed, and a repo that "
                        "regenerates every number you're looking at.")},
    {"id": "run", "p": [r"run.*batch|re-?run|new batch|another batch|regenerate"],
     "f": lambda c, p: (f"the run button in the header (or POST /api/batch/run) "
                        f"reruns the engine — default seed 42 keeps the numbers "
                        f"reproducible, a new seed plants new breaks. i quote "
                        f"whatever batch is live when you ask.")},
    {"id": "thanks", "p": [r"thanks|thank you|nice|cool|great|love it"],
     "f": lambda c, p: ("anytime. the desk is always open.")},

    # page context — "summarize this" resolves to the view being read
    {"id": "page-home", "pages": ["home"],
     "p": [r"summar|what am i (looking at|seeing)|this page|explain this view|what's here"],
     "f": lambda c, p: ("the overview: what settleops is, the loop in five "
                        f"cards, the stopping rules, the division of labor, "
                        f"and the proof layer — with batch {c['batch']} live "
                        f"in the hero at {c['match']}%. every number on it "
                        f"regenerates from the data, bit-for-bit.")},
    {"id": "page-board", "pages": ["board"],
     "p": [r"summar|what am i (looking at|seeing)|this page|explain this view|what's here"],
     "f": lambda c, p: (f"the board is the live queue: {c['incidents']} "
                        f"incidents, {c['awaiting']} waiting on you, {c['auto']} "
                        f"already self-resolved. the heaviest is {c['biggest']}. "
                        f"filters cut it by class, severity and status; open "
                        f"any row for the evidence and the approve/reject "
                        f"gate.")},
    {"id": "page-incident", "pages": ["incident"],
     "p": [r"summar|what am i (looking at|seeing)|this page|explain this view|what's here"],
     "f": lambda c, p: ("an incident's page: the two records side by side, "
                        "the class and severity, the runbook it belongs to, "
                        "the proposal — and the timeline where a decision "
                        "becomes a human event. approve or reject; both are "
                        "logged, neither is silent.")},
    {"id": "page-how", "pages": ["how"],
     "p": [r"summar|what am i (looking at|seeing)|this page|explain this view|what's here"],
     "f": lambda c, p: ("this view is the loop end to end — five steps with "
                        f"live evidence from the running batch, then the "
                        f"stopping rules as a schedule where every row links "
                        "to the exact test that enforces it. the proof is "
                        "one click deep, by design.")},
]

FALLBACK = ("i keep a small brain on purpose — that one's outside it. try "
            "/help for what i know cold, or ask about the loop, the rules, "
            "the batch, or what's waiting on you.")


def _nav(q: str) -> tuple[str, str] | None:
    """take me to X — tally hands over a real navigation action."""
    m = re.search(r"\b(open|show|go to|goto|take me to|jump to|view)\b(.{0,28})", q)
    if not m:
        return None
    tail = m.group(2)
    for view in NAV_VIEWS:
        if re.search(rf"\b{view}\b", tail) or (view == "postmortem" and "post" in tail):
            return view, f"open {NAV_LABELS[view]}"
    if "board" in q and re.search(r"\b(open|show|go|take|view)\b", q):
        return "board", "open the board"
    return None


def _match_len(p: str, q: str) -> int:
    m = re.search(p, q)
    return len(m.group(0)) if m else -1


def _regex_brain(q: str, page: str, c: dict) -> tuple[str, dict | None]:
    nav = _nav(q)
    if nav:
        view, label = nav
        line = {
            "home": "the overview it is — the story of the loop with live numbers.",
            "board": "the board is the queue — every break, every status, one desk.",
            "postmortem": "the postmortem view is how the batch closes the loop.",
            "how": "the how-it-works view has the loop, the rules and the tests.",
        }[view]
        return line, {"label": label, "view": view}

    # the longest matched phrase wins (specific beats generic); the view
    # being read adds a home-court advantage of 5
    best, score = None, 0
    for it in INTENTS:
        s = max((_match_len(p, q) for p in it["p"]), default=-1)
        if s < 0:
            continue
        if page in it.get("pages", []):
            s += 5
        if s > score:
            best, score = it, s
    if best:
        return best["f"](c, page), None
    return FALLBACK, None


# ------------------------------------------------------------------ llm brain

def _provider() -> tuple[str, str, str, str] | None:
    """(key, base_url, model, provider) — None when fully offline."""
    key = os.environ.get("TALLY_API_KEY", "").strip()
    if key:
        return (key,
                os.environ.get("TALLY_BASE_URL", "https://api.groq.com/openai/v1"),
                os.environ.get("TALLY_MODEL", "groq/compound-mini"),
                "groq")
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if key:
        return (key,
                os.environ.get("TALLY_BASE_URL", "https://api.groq.com/openai/v1"),
                os.environ.get("TALLY_MODEL", "groq/compound-mini"),
                "groq")
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return (key, "https://api.openai.com/v1", "gpt-4o-mini", "openai")
    return None


def system_prompt(page: str, c: dict) -> str:
    return (
        "You are Tally, the companion of SettleOps — a finance reconciliation "
        "incident console (Razorpay AI Buildathon 2026 demo). Personality: warm, "
        "precise, a little playful, SRE-calm. Answers are 2-4 short sentences, "
        "plain words, ids and amounts in backticks. You READ the live batch; "
        "you never move money or write ledgers — money decisions are human "
        "clicks. If asked something far from reconciliation or SettleOps, "
        "steer back gently. Live facts (trust these over memory): "
        f"batch {c['batch']}, {c['rows']}, match rate {c['match']}%, "
        f"{c['incidents']} incidents, {c['auto']} auto-resolved, "
        f"{c['awaiting']} awaiting a human, biggest break {c['biggest']}, "
        f"FX: {c['fx']}. The operator is reading {PAGES.get(page, PAGES['home'])} "
        "— bias the answer to it. Views you can point to: overview, board, "
        "postmortem, how-it-works."
    )


def _llm_chat(messages: list[dict], system: str) -> str:
    prov = _provider()
    if prov is None:
        raise RuntimeError("no provider key")
    key, base, model, _ = prov
    body = json.dumps({
        "model": model,
        "messages": ([{"role": "system", "content": system}] + messages),
        "max_tokens": 260,
        "temperature": 0.4,
    }).encode()
    req = urllib.request.Request(
        f"{base}/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as r:
        d = json.load(r)
    return d["choices"][0]["message"]["content"].strip()


def _trim(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages[-6:]:
        role = m.get("role")
        content = str(m.get("content", ""))[:400]
        if role in ("user", "assistant") and content.strip():
            out.append({"role": role, "content": content})
    return out


# ------------------------------------------------------------------ streaming

def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _word_groups(text: str, n: int = 2) -> list[str]:
    """a finished answer, cut into small word groups — the typewriter
    feed for the deterministic brains, so /status lands like a thought
    being typed, not a paragraph dumped on the desk"""
    toks = re.findall(r"\S+\s*", text)
    return ["".join(toks[i:i + n]) for i in range(0, len(toks), n)] or [""]


def _llm_stream(messages: list[dict], system: str):
    """the provider's tokens as they arrive — same shape as _llm_chat,
    but the pipe is open while the model thinks"""
    prov = _provider()
    if prov is None:
        raise RuntimeError("no provider key")
    key, base, model, _ = prov
    body = json.dumps({
        "model": model,
        "messages": ([{"role": "system", "content": system}] + messages),
        "max_tokens": 260,
        "temperature": 0.4,
        "stream": True,
    }).encode()
    req = urllib.request.Request(
        f"{base}/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Accept": "text/event-stream"})
    with urllib.request.urlopen(req, timeout=25) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                return
            try:
                d = json.loads(payload)
            except json.JSONDecodeError:
                continue
            try:
                tok = d["choices"][0]["delta"].get("content")
            except (KeyError, IndexError, TypeError):
                continue
            if tok:
                yield tok


def tally_stream(batch: BatchReport, messages: list[dict], page: str = "home"):
    """tally_reply, token by token. Yields SSE frames:
    {"type": "start", "mode", "model"} once, then {"type": "delta",
    "text"} per chunk, then {"type": "done", "mode", "model", "action"}.
    Same brain order as tally_reply — commands, then the live brain,
    then regex — and the same never-raises guarantee: a provider that
    drops before the first token falls back to regex mid-stream."""
    page = page if page in PAGES else "home"
    c = digest(batch)
    history = _trim(messages if isinstance(messages, list) else [])
    q = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")

    def typed(text: str, mode: str, model: str | None, action: dict | None):
        yield _sse({"type": "start", "mode": mode, "model": model})
        for grp in _word_groups(text):
            yield _sse({"type": "delta", "text": grp})
            time.sleep(0.03)
        yield _sse({"type": "done", "mode": mode, "model": model, "action": action})

    # T1 — commands, the engine's own
    if q.startswith("/"):
        cmd = q.split()[0].lower()
        if cmd == "/reset":
            yield from typed("clean slate — ask me anything.", "command", None, None)
        elif cmd in COMMANDS:
            yield from typed(_command(cmd, c), "command", None, None)
        else:
            yield from typed("unknown command — /help lists what i answer cold.",
                             "command", None, None)
        return

    # T2 — the live brain, streamed as it thinks
    prov = _provider()
    if prov and q.strip():
        yielded = 0
        try:
            yield _sse({"type": "start", "mode": "llm", "model": prov[2]})
            for tok in _llm_stream(history, system_prompt(page, c)):
                yield _sse({"type": "delta", "text": tok})
                yielded += 1
            yield _sse({"type": "done", "mode": "llm", "model": prov[2], "action": None})
            return
        except Exception:
            if yielded:
                # the line dropped mid-answer; end it honestly rather
                # than splice two brains into one reply
                yield _sse({"type": "done", "mode": "llm", "model": prov[2], "action": None})
                return
            # nothing said yet — the deterministic brain takes the desk

    # the always-there brain
    reply, action = _regex_brain(q.lower(), page, c)
    yield from typed(reply, "regex", None, action)


# ------------------------------------------------------------------ the door

def tally_reply(batch: BatchReport, messages: list[dict], page: str = "home") -> dict:
    """The single entry point. Never raises; never blocks the console."""
    page = page if page in PAGES else "home"
    c = digest(batch)
    history = _trim(messages if isinstance(messages, list) else [])
    q = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")

    # T1 — commands are the engine's own, zero tokens
    if q.startswith("/"):
        cmd = q.split()[0].lower()
        if cmd == "/reset":
            return {"reply": "clean slate — ask me anything.", "mode": "command",
                    "model": None, "action": None}
        if cmd in COMMANDS:
            return {"reply": _command(cmd, c), "mode": "command",
                    "model": None, "action": None}
        return {"reply": f"unknown command — /help lists what i answer cold.",
                "mode": "command", "model": None, "action": None}

    # T2 — the live brain when a key exists, regex otherwise
    prov = _provider()
    if prov and q.strip():
        try:
            reply = _llm_chat(history, system_prompt(page, c))
            return {"reply": reply, "mode": "llm", "model": prov[2],
                    "action": None}
        except Exception:
            reply, action = _regex_brain(q.lower(), page, c)
            return {"reply": reply, "mode": "regex", "model": None,
                    "action": action}

    reply, action = _regex_brain(q.lower(), page, c)
    return {"reply": reply, "mode": "regex", "model": None, "action": action}


def tally_status() -> dict:
    prov = _provider()
    return {
        "llm": prov is not None,
        "provider": prov[3] if prov else "regex",
        "model": prov[2] if prov else None,
        "commands": list(COMMANDS),
    }
