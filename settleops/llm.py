"""settleops.llm — optional, bounded, honestly-labeled diagnosis assist.

Rules (tested in tests/test_llm.py):
  L1  absent key → the rules hint is used, source stays "rules"
  L2  the LLM output is prefixed "AI-suggested:" and can never become a
      remedy, severity, or runbook — it only annotates cause_hint
  L3  any error (timeout, bad key, rate limit) falls back to rules;
      the pipeline never fails because of the LLM
  L4  the LLM is never in the remediation path (runbooks never call it)
"""
from __future__ import annotations

import os

from .matcher import Break

RULES_HINTS = {
    "TIMING_GAP": "Rail settlement lag — typically a payout-batch cutoff or "
                  "weekend/holiday shift, not a lost payment.",
    "AMOUNT_DRIFT": "Small unexplained delta — usually a partial refund, a "
                    "GST rounding difference, or an incomplete adjustment entry.",
    "MISSING_ENTRY": "One side never recorded the money — either the rail "
                     "payout was held or the books entry was skipped during close.",
    "DUPLICATE_CHARGE": "The rail settled the same order twice — retry storm "
                        "or duplicate webhook; one credit needs reversal.",
    "FEE_MISMATCH": "Applied fee differs from the published schedule — often "
                    "an MDR-tier change or a manually-overridden charge.",
    "CURRENCY_MISMATCH": "Settlement arrived in another currency — FX route "
                         "or rail config error; needs human verification.",
}


def rules_hint(b: Break) -> str:
    return RULES_HINTS.get(b.break_class, "unclassified break — needs eyes.")


def llm_hint(b: Break, evidence: str) -> tuple[str, str]:
    """Returns (cause_hint, cause_source). Never raises. Never blocks."""
    key = (os.environ.get("GROQ_API_KEY") or os.environ.get("GEMINI_API_KEY")
           or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        return rules_hint(b), "rules"

    prompt = (f"A payment reconciliation break was detected.\n"
              f"Class: {b.break_class}\nEvidence: {evidence}\n"
              f"Give the most likely root cause in one sentence. "
              f"No remedies, no amounts, just the cause.")

    try:
        if os.environ.get("GROQ_API_KEY"):
            return _groq(prompt), "llm"
        if os.environ.get("GEMINI_API_KEY"):
            return _gemini(prompt), "llm"
        return _openai(prompt), "llm"
    except Exception:
        return rules_hint(b), "rules"


def _groq(prompt: str) -> str:
    import urllib.request, json as _json
    body = _json.dumps({
        "model": "openai/gpt-oss-20b",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 128, "temperature": 0.2, "reasoning_effort": "low",
    }).encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        d = _json.load(r)
    return "AI-suggested: " + d["choices"][0]["message"]["content"].strip()


def _gemini(prompt: str) -> str:
    import urllib.request, json as _json
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           "gemini-2.0-flash:generateContent?key=" + os.environ["GEMINI_API_KEY"])
    body = _json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        d = _json.load(r)
    return "AI-suggested: " + d["candidates"][0]["content"]["parts"][0]["text"].strip()


def _openai(prompt: str) -> str:
    import urllib.request, json as _json
    body = _json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 80, "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        d = _json.load(r)
    return "AI-suggested: " + d["choices"][0]["message"]["content"].strip()
