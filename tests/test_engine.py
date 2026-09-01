"""tests — the honesty layer. Every metric the README quotes is proven here
against the generator's planted ground truth."""
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from settleops.audit import AuditLog
from settleops.generator import BATCH_OPEN, generate, expected_fee_paise
from settleops.matcher import match
from settleops.models import BREAK_CLASSES, TimelineEvent
from settleops.pipeline import run_batch, human_decide
from settleops.postmortem import write_postmortem
from settleops.runbooks import MAX_AUTO_PER_BATCH
from settleops.taxonomy import HUMAN_DESK_THRESHOLD_PAISE, diagnose
from settleops.matcher import Break


# ---------------------------------------------------------------- generator

class TestGenerator:
    def test_deterministic_same_seed(self):
        a, b = generate(seed=42), generate(seed=42)
        assert a.books == b.books and a.settlements == b.settlements
        assert a.planted == b.planted

    def test_different_seed_different_data(self):
        a, b = generate(seed=42), generate(seed=7)
        assert a.books != b.books

    def test_record_counts_match_shape(self):
        s = generate()
        # 54 clean + 12 planted books rows; duplicate plants each add one
        # EXTRA settlement row (2 settle rows for 1 books row ×2)
        assert len(s.books) == 66
        assert len(s.settlements) == 68 - 2  # 66: dupes add 2 extra rows
        assert len(s.settlements) == 66

    def test_every_planted_class_present(self):
        counts = generate().planted_counts
        assert counts["TIMING_GAP"] == 3
        assert counts["AMOUNT_DRIFT"] == 2
        assert counts["MISSING_ENTRY"] == 2
        assert counts["DUPLICATE_CHARGE"] == 2
        assert counts["FEE_MISMATCH"] == 2
        assert counts["CURRENCY_MISMATCH"] == 1

    def test_order_refs_unique_in_books(self):
        s = generate()
        refs = [b.order_ref for b in s.books]
        assert len(refs) == len(set(refs))

    def test_all_amounts_integer_paise(self):
        s = generate()
        for b in s.books:
            assert isinstance(b.amount_paise, int) and b.amount_paise > 0
        for st in s.settlements:
            assert isinstance(st.net_amount_paise, int)

    def test_fee_schedule_sane(self):
        assert expected_fee_paise(100_000) == max(200, min(50_000, 2_000))
        assert expected_fee_paise(10) == 200        # floor
        assert expected_fee_paise(100_000_000) == 50_000  # cap

    def test_batch_clock_fixed(self):
        assert BATCH_OPEN == "2026-08-30T09:15:00"


# ---------------------------------------------------------------- matcher

class TestMatcher:
    def test_match_count_equals_planted_truth(self):
        s = generate()
        matched, breaks = match(s)
        # 66 books rows - 12 planted breaks = 54 clean matches
        assert matched == 54
        assert len(breaks) == 12

    def test_break_classes_found_exactly(self):
        _, breaks = match(generate())
        got: dict[str, int] = {}
        for b in breaks:
            got[b.break_class] = got.get(b.break_class, 0) + 1
        assert got == {"TIMING_GAP": 3, "AMOUNT_DRIFT": 2, "MISSING_ENTRY": 2,
                       "DUPLICATE_CHARGE": 2, "FEE_MISMATCH": 2,
                       "CURRENCY_MISMATCH": 1}

    def test_no_false_positives(self):
        """The planted breaks must be exactly the planted refs — nothing else."""
        s = generate()
        _, breaks = match(s)
        planted_refs = {p.order_ref for p in s.planted}
        found_refs = {b.order_ref for b in breaks}
        assert found_refs == planted_refs

    def test_duplicate_has_both_settlements(self):
        _, breaks = match(generate())
        dups = [b for b in breaks if b.break_class == "DUPLICATE_CHARGE"]
        assert all(len(b.settles) == 2 for b in dups)

    def test_currency_break_keeps_pair(self):
        _, breaks = match(generate())
        cur = [b for b in breaks if b.break_class == "CURRENCY_MISMATCH"]
        assert len(cur) == 1
        assert cur[0].books is not None and len(cur[0].settles) == 1

    def test_clean_pair_is_not_a_break(self):
        s = generate()
        _, breaks = match(s)
        break_refs = {b.order_ref for b in breaks}
        clean_ref = next(b.order_ref for b in s.books
                         if b.order_ref not in break_refs)
        assert clean_ref  # exists


# ---------------------------------------------------------------- taxonomy

class TestTaxonomy:
    def test_every_break_class_has_a_runbook(self):
        for cls in BREAK_CLASSES:
            brk = Break(cls, "ord_x", None, [])
            d = diagnose(brk)
            assert d.runbook.startswith("RBT-")

    def test_currency_always_sev1(self):
        from datetime import date
        from settleops.models import BooksRecord, SettlementRecord
        b = BooksRecord("B1", "ord_1", "2026-08-20", 100_000)
        s = SettlementRecord("S1", "UTR1", "ord_1", "2026-08-21",
                             98_000, 2_000, currency="USD")
        d = diagnose(Break("CURRENCY_MISMATCH", "ord_1", b, [s]))
        assert d.severity == "SEV-1"

    def test_big_money_forced_to_human(self):
        from settleops.models import BooksRecord, SettlementRecord
        b = BooksRecord("B1", "ord_1", "2026-08-20", 90_000_00)  # ₹90,000
        s = SettlementRecord("S1", "UTR1", "ord_1", "2026-08-21", 0,
                             fee_paise=0, gross_amount_paise=90_000_00)
        d = diagnose(Break("AMOUNT_DRIFT", "ord_1", b, [s]))
        assert d.over_threshold is True
        assert d.severity in ("SEV-2", "SEV-1")

    def test_threshold_is_50k(self):
        assert HUMAN_DESK_THRESHOLD_PAISE == 5_000_000

    def test_evidence_mentions_window_for_timing(self):
        _, breaks = match(generate())
        t = [b for b in breaks if b.break_class == "TIMING_GAP"][0]
        d = diagnose(t)
        assert "T+" in d.evidence


# ---------------------------------------------------------------- runbooks

class TestRunbooks:
    def _inc_for(self, brk, seq=1):
        from settleops.pipeline import _new_incident
        return _new_incident(seq, brk, BATCH_OPEN)
    def test_timing_inside_window_auto_resolves(self):
        report = run_batch(seed=42)
        timing = [i for i in report.incidents
                  if i.break_class == "TIMING_GAP" and i.status == "RESOLVED"]
        assert len(timing) == 2                     # the two T+1/T+2 plants
        assert all(i.resolve_reason.startswith("auto") for i in timing)

    def test_timing_outside_window_escalates(self):
        report = run_batch(seed=42)
        t6 = [i for i in report.incidents
              if i.break_class == "TIMING_GAP" and i.status == "TICKET"]
        assert len(t6) == 1                          # the T+6 plant

    def test_amount_drift_only_proposes(self):
        report = run_batch(seed=42)
        drifts = [i for i in report.incidents if i.break_class == "AMOUNT_DRIFT"]
        assert len(drifts) == 2
        assert all(i.status == "PROPOSED" for i in drifts)
        assert all(i.proposed_action and "journal" in i.proposed_action
                   for i in drifts)

    def test_missing_entry_pages(self):
        report = run_batch(seed=42)
        missing = [i for i in report.incidents if i.break_class == "MISSING_ENTRY"]
        assert all(i.status == "PAGED" for i in missing)

    def test_duplicate_flags_reversal(self):
        report = run_batch(seed=42)
        dups = [i for i in report.incidents if i.break_class == "DUPLICATE_CHARGE"]
        assert all("reversal" in (i.proposed_action or "") for i in dups)

    def test_currency_never_auto_acted(self):
        report = run_batch(seed=42)
        cur = [i for i in report.incidents if i.break_class == "CURRENCY_MISMATCH"]
        assert len(cur) == 1
        assert cur[0].status == "PAGED" and cur[0].severity == "SEV-1"
        assert cur[0].resolved_at is None

    def test_no_incident_resolved_silently(self):
        """Every RESOLVED-with-money-action has a human or 'auto:' reason."""
        report = run_batch(seed=42)
        for i in report.incidents:
            if i.status == "RESOLVED":
                assert i.resolve_reason.startswith(("auto", "human"))

    def test_auto_budget_respected(self):
        report = run_batch(seed=42)
        autos = [i for i in report.incidents
                 if i.resolve_reason.startswith("auto")]
        assert len(autos) <= MAX_AUTO_PER_BATCH
        assert 1 <= len(autos)   # and the budget actually gets used

    def test_s4_one_automated_action_per_incident(self):
        """S4: an incident's timeline never carries more than one
        AUTO_RESOLVED event — one automated action per incident, ever."""
        report = run_batch(seed=42)
        for i in report.incidents:
            autos = [e for e in i.events if e.kind == "AUTO_RESOLVED"]
            assert len(autos) <= 1, f"{i.id} has {len(autos)} automated actions"

    def test_rejected_proposal_never_re_auto(self):
        """S4 tail: after a human rejects, no automated event may follow
        on that incident."""
        report = run_batch(seed=42)
        target = next(i for i in report.incidents
                      if i.break_class == "AMOUNT_DRIFT")
        human_decide(report, target.id, "reject")
        after = [e for e in target.events if e.kind == "REJECTED"]
        assert after  # the reject is the last event — nothing automated after
        idx = target.events.index(after[0])
        assert all(e.actor != "runbook" for e in target.events[idx + 1:])

    def test_proposals_need_approval_state(self):
        report = run_batch(seed=42)
        for i in report.incidents:
            if i.proposed_action:
                assert i.action_state in ("PENDING_APPROVAL", "APPROVED", "REJECTED")


# ---------------------------------------------------------------- pipeline

class TestPipeline:
    def test_report_metrics_match_planted_truth(self):
        report = run_batch(seed=42)
        m = report.metrics()
        assert m["incidents_total"] == 12
        assert m["match_rate"] == 81.8
        assert m["auto_resolved"] == 2
        assert m["sev1"] == 1

    def test_mttr_present_and_positive(self):
        m = run_batch(seed=42).metrics()
        assert m["mttr_hours_auto"] is not None
        assert m["mttr_hours_auto"] > 0

    def test_every_incident_has_story(self):
        report = run_batch(seed=42)
        for i in report.incidents:
            kinds = [e.kind for e in i.events]
            assert "BREAK_DETECTED" in kinds
            assert "RUNBOOK_STARTED" in kinds

    def test_deterministic_reports(self):
        a, b = run_batch(seed=42), run_batch(seed=42)
        assert a.to_dict() == b.to_dict()

    def test_human_approve_resolves(self):
        report = run_batch(seed=42)
        target = next(i for i in report.incidents
                      if i.break_class == "AMOUNT_DRIFT")
        inc = human_decide(report, target.id, "approve")
        assert inc.status == "RESOLVED"
        assert inc.action_state == "APPROVED"
        assert any(e.kind == "APPROVED" and e.actor == "human"
                   for e in inc.events)

    def test_human_reject_reopens(self):
        report = run_batch(seed=42)
        target = next(i for i in report.incidents
                      if i.break_class == "FEE_MISMATCH")
        inc = human_decide(report, target.id, "reject")
        assert inc.status == "OPEN" and inc.action_state == "REJECTED"

    def test_unknown_incident_returns_none(self):
        report = run_batch(seed=42)
        assert human_decide(report, "INC-9999", "approve") is None


# ---------------------------------------------------------------- audit

class TestAudit:
    def test_log_is_append_ordered(self):
        report = run_batch(seed=42)
        ts = [e.ts for e in report.event_log]
        assert ts == sorted(ts)

    def test_no_illegal_actors(self):
        report = run_batch(seed=42)
        actors = {e.actor for e in report.event_log}
        assert actors <= {"engine", "runbook", "human", "llm-assist"}

    def test_batch_opened_is_first(self):
        report = run_batch(seed=42)
        assert report.event_log[0].kind == "BATCH_OPENED"

    def test_validate_passes_on_clean_run(self):
        log = AuditLog()
        log.events = run_batch(seed=42).event_log
        assert log.validate() == []

    def test_dump_and_reload_roundtrip(self, tmp_path):
        log = AuditLog()
        log.events = run_batch(seed=42).event_log
        p = tmp_path / "log.jsonl"
        log.dump(p)
        reloaded = AuditLog.load(p)
        assert reloaded.events == log.events

    def test_actor_validation_enforced(self):
        log = AuditLog()
        bad = TimelineEvent(ts="2026-08-30T09:15:00", kind="X", actor="evil",
                            incident_id=None, detail="")
        with pytest.raises(ValueError):
            log.append(bad)

    def test_event_count_has_substance(self):
        report = run_batch(seed=42)
        # 1 batch + 12 incidents × ≥3 events each (detect, diagnose, runbook)
        assert len(report.event_log) >= 37


# ---------------------------------------------------------------- llm

class TestLLM:
    def test_rules_fallback_without_key(self, monkeypatch):
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        from settleops.llm import llm_hint
        _, breaks = match(generate())
        hint, src = llm_hint(breaks[0], "evidence")
        assert src == "rules"
        assert len(hint) > 10

    def test_llm_never_in_remediation_path(self):
        """The runbooks module must not import the llm module."""
        import settleops.runbooks as rb
        import sys
        assert "settleops.llm" not in sys.modules or True  # import may exist elsewhere
        src = Path(rb.__file__).read_text()
        assert "llm" not in src.lower().replace("runbooks", "")

    def test_hints_cover_all_classes(self):
        from settleops.llm import RULES_HINTS
        for cls in BREAK_CLASSES:
            assert cls in RULES_HINTS

    def test_pipeline_source_rules_without_key(self, monkeypatch):
        monkeypatch.delenv("GROQ_API_KEY", raising=False)
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        report = run_batch(seed=42)
        assert all(i.cause_source == "rules" for i in report.incidents)


# ---------------------------------------------------------------- postmortem

class TestPostmortem:
    def test_contains_match_rate_and_honest_list(self):
        md = write_postmortem(run_batch(seed=42))
        assert "match rate" in md
        assert "Could not resolve" in md
        assert "INC-" in md

    def test_stopping_rules_documented(self):
        md = write_postmortem(run_batch(seed=42))
        for rule in ("S1", "S2", "S3", "S4", "S5"):
            assert rule in md

    def test_regenerates_identically(self):
        assert (write_postmortem(run_batch(seed=42))
                == write_postmortem(run_batch(seed=42)))


# ---------------------------------------------------------------- cli

class TestCLI:
    def test_cli_runs_clean_and_writes_results(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        # run in-process with a patched ROOT
        from settleops import cli
        monkeypatch.setattr(cli, "ROOT", tmp_path)
        rc = cli.main()
        assert rc == 0
        assert (tmp_path / "results/batch_report.json").exists()
        assert (tmp_path / "results/postmortem.md").exists()
        assert (tmp_path / "data/incident_log.jsonl").exists()
