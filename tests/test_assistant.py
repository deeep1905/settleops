"""Tally tests — the companion's contract:
commands cost zero tokens, the regex brain answers without a key,
the groq brain falls back to regex on any failure, and the context
stays frugal (rules T1-T5 in settleops/assistant.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

from settleops.assistant import (COMMANDS, PAGES, _trim, digest,
                                 system_prompt, tally_reply, tally_status)
from settleops.pipeline import run_batch

BATCH = run_batch(seed=42)


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch):
    """Tests run the desk the way a fresh clone does: no keys anywhere."""
    for k in ("GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY",
              "TALLY_API_KEY", "TALLY_BASE_URL", "TALLY_MODEL"):
        monkeypatch.delenv(k, raising=False)


def ask(q: str, page: str = "home", history=None) -> dict:
    msgs = history or [{"role": "user", "content": q}]
    return tally_reply(BATCH, msgs, page)


# ------------------------------------------------------------------ T1 commands

class TestCommands:
    def test_status_is_live(self):
        r = ask("/status")
        assert r["mode"] == "command"
        assert "R42" in r["reply"] and "81.8" in r["reply"]

    def test_breaks_lists_classes(self):
        r = ask("/breaks")
        assert "timing gap" in r["reply"]
        assert "₹41,759" in r["reply"]          # the biggest break, live

    def test_awaiting_quotes_the_queue(self):
        r = ask("/awaiting")
        assert str(BATCH.metrics()["awaiting_human"]) in r["reply"]

    def test_budget_counts_the_cap(self):
        assert "/5" in ask("/budget")["reply"]

    def test_help_lists_every_command(self):
        r = ask("/help")["reply"]
        for c in COMMANDS:
            assert c in r

    def test_reset_acks(self):
        assert "clean slate" in ask("/reset")["reply"]

    def test_unknown_command_is_honest(self):
        assert "unknown command" in ask("/frobnicate")["reply"]

    def test_commands_never_touch_the_network(self):
        # even with a key present, /status must not spend a token
        import settleops.assistant as a
        orig = a._llm_chat
        a._llm_chat = lambda *m, **k: pytest.fail("commands must not call the llm")
        try:
            import os
            os.environ["GROQ_API_KEY"] = "test-key"
            assert ask("/status")["mode"] == "command"
            os.environ.pop("GROQ_API_KEY")
        finally:
            a._llm_chat = orig


# ------------------------------------------------------------------ regex brain

class TestRegexBrain:
    def test_greeting(self):
        assert "tally" in ask("hey")["reply"].lower()

    def test_biggest_break_is_live(self):
        r = ask("what's the biggest break?")
        assert "₹41,759" in r["reply"] and r["mode"] == "regex"

    def test_stopping_rules(self):
        r = ask("what are the stopping rules?")
        assert "S1" in r["reply"] and "₹50,000" in r["reply"]

    def test_money_never_moves(self):
        r = ask("can you move money for me?")
        assert "never move money" in r["reply"]

    def test_where_the_ai_is(self):
        r = ask("where is the AI in this?")
        assert "hypothesis" in r["reply"]

    def test_specific_beats_generic(self):
        # "tell me about the stopping rules" must not hit the generic
        # "tell me about" (what-is) intent
        assert "S1" in ask("tell me about the stopping rules")["reply"]

    def test_fallback_points_at_help(self):
        assert "/help" in ask("frobnicate the quux")["reply"]


# ------------------------------------------------------------------ T4 pages

class TestPageAware:
    def test_pages_cover_every_view(self):
        assert set(PAGES) == {"home", "board", "incident", "postmortem", "how"}

    def test_summarize_resolves_to_the_view_being_read(self):
        board = ask("summarize this page for me", page="board")["reply"]
        how = ask("summarize this page for me", page="how")["reply"]
        assert "queue" in board.lower()
        assert "loop" in how.lower()
        assert board != how

    def test_navigation_hands_over_an_action(self):
        r = ask("take me to the board")
        assert r["action"] == {"label": "open the board", "view": "board"}
        r2 = ask("show me the postmortem")
        assert r2["action"]["view"] == "postmortem"

    def test_unknown_page_falls_home(self):
        assert ask("hi", page="nonsense")["reply"]


# ------------------------------------------------------------------ T2/T3 llm brain

class TestLLMBrain:
    def test_no_key_is_regex_and_never_calls_out(self):
        import settleops.assistant as a
        orig = a._llm_chat
        a._llm_chat = lambda *m, **k: pytest.fail("no key, no call")
        try:
            r = ask("what is settleops?")
            assert r["mode"] == "regex" and r["model"] is None
        finally:
            a._llm_chat = orig

    def test_with_key_the_live_brain_answers(self, monkeypatch):
        import os
        import settleops.assistant as a
        monkeypatch.setenv("GROQ_API_KEY", "test-key")
        seen = {}

        def fake_llm(messages, system):
            seen["messages"], seen["system"] = messages, system
            return "live brain says hi"

        monkeypatch.setattr(a, "_llm_chat", fake_llm)
        r = ask("what is this?", page="board")
        assert r["mode"] == "llm"
        assert r["model"] == "groq/compound-mini"
        assert r["reply"] == "live brain says hi"
        # T3: frugal — system names the page, history is trimmed, no greeting
        assert "board" in seen["system"] and "R42" in seen["system"]
        assert len(seen["messages"]) <= 6

    def test_llm_failure_falls_back_to_regex(self, monkeypatch):
        import os
        import settleops.assistant as a
        monkeypatch.setenv("GROQ_API_KEY", "test-key")
        monkeypatch.setattr(a, "_llm_chat",
                            lambda *m, **k: (_ for _ in ()).throw(RuntimeError("429")))
        r = ask("what's the biggest break?")
        assert r["mode"] == "regex" and "₹41,759" in r["reply"]

    def test_trim_caps_history_and_content(self):
        msgs = ([{"role": "user", "content": "old " + "x" * 600}] +
                [{"role": "user", "content": f"q{i}"} for i in range(9)])
        t = _trim(msgs)
        assert len(t) == 6
        assert all(len(m["content"]) <= 400 for m in t)
        assert t[0]["content"] == "q3"        # the last 6 of 10 survive

    def test_system_prompt_stays_frugal(self):
        s = system_prompt("board", digest(BATCH))
        assert len(s.split()) < 160          # tokens the free plan can afford


class TestStatus:
    def test_offline_status(self):
        s = tally_status()
        assert s == {"llm": False, "provider": "regex", "model": None,
                     "commands": list(COMMANDS)}

    def test_groq_status(self, monkeypatch):
        import os
        monkeypatch.setenv("GROQ_API_KEY", "k")
        s = tally_status()
        assert s["llm"] and s["provider"] == "groq"
        assert s["model"] == "groq/compound-mini"


# ------------------------------------------------------------------ endpoints

client = TestClient(__import__("settleops.api", fromlist=["app"]).app)


class TestChatEndpoint:
    def test_command_over_http(self):
        r = client.post("/api/chat",
                        json={"messages": [{"role": "user", "content": "/status"}],
                              "page": "board"})
        d = r.json()
        assert r.status_code == 200 and d["ok"]
        assert d["mode"] == "command" and "R42" in d["reply"]

    def test_freeform_over_http(self):
        r = client.post("/api/chat",
                        json={"messages": [{"role": "user", "content": "what broke?"}],
                              "page": "home"})
        d = r.json()
        assert d["ok"] and d["reply"]

    def test_status_endpoint(self):
        d = client.get("/api/chat/status").json()
        assert d["ok"] and d["llm"] is False and d["model"] is None
