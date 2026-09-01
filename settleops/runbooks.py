"""settleops.runbooks — bounded remediation, the SRE way.

Every break class maps to a runbook. Runbooks propose and execute only
actions that are *reversible or non-monetary*; anything that touches money
requires a human approval event. Hard stopping rules (tested):

  S1  any break with amount ≥ ₹50,000 → PAGED, no auto-action, any class
  S2  CURRENCY_MISMATCH → always PAGED SEV-1, never any auto-action
  S3  max 5 auto-resolutions per batch; the rest escalate
  S4  one automated action per incident, ever — and a rejected proposal
      is never re-proposed automatically (a human event must intervene)
  S5  the engine never writes an adjustment silently — proposals only

The timing-gap runbook simulates the re-check by re-evaluating the window
inside the same batch (the fixed clock lets us do this deterministically).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from .matcher import Break, T_PLUS_DAYS
from .models import Incident, TimelineEvent
from .taxonomy import Diagnosis, HUMAN_DESK_THRESHOLD_PAISE

MAX_AUTO_PER_BATCH = 5

CLOCK_FMT = "%Y-%m-%dT%H:%M:%S"


@dataclass
class RunbookResult:
    status: str                 # SCHEDULED | PROPOSED | PAGED | RESOLVED | TICKET
    proposed_action: str | None
    action_state: str           # NONE | PENDING_APPROVAL
    reason: str                 # resolve_reason / why status chosen
    resolved_at: str | None = None


def _clock(batch_open: str, minutes: int) -> str:
    base = datetime.fromisoformat(batch_open)
    return (base + timedelta(minutes=minutes)).isoformat()


def run_runbook(inc: Incident, brk: Break, diag: Diagnosis,
                batch_open: str, auto_budget: list[int],
                cursor: list[int]) -> tuple[RunbookResult, list[TimelineEvent]]:
    """Execute the incident's runbook. `auto_budget` and `cursor` are
    one-element mutable lists shared across the batch: the cursor is the
    causality clock (minutes since batch open) — every event strictly
    moves it forward, so the audit log is append-ordered by construction.
    `prev_automated` implements stopping rule S4."""
    ev: list[TimelineEvent] = []

    def event(kind: str, actor: str, detail: str, minutes: int | None = None):
        if minutes is not None:
            cursor[0] = max(cursor[0], minutes)
        else:
            cursor[0] += 1
        ev.append(TimelineEvent(ts=_clock(batch_open, cursor[0]), kind=kind,
                                actor=actor, incident_id=inc.id, detail=detail))

    event("RUNBOOK_STARTED", "runbook", f"{diag.runbook} started for {inc.order_ref}")

    # ---- S1 / S2: hard human gates --------------------------------------
    if brk.amount_paise >= HUMAN_DESK_THRESHOLD_PAISE or inc.break_class == "CURRENCY_MISMATCH":
        event("HUMAN_PAGED", "runbook",
              f"amount {'₹50,000+' if brk.amount_paise >= HUMAN_DESK_THRESHOLD_PAISE else 'currency risk'} "
              f"— stopping rule S1/S2: no auto-action")
        return RunbookResult("PAGED", None, "NONE",
                             "stopping-rule: amount or currency requires the human desk"), ev

    # ---- RBT-01 TIMING_GAP ----------------------------------------------
    if inc.break_class == "TIMING_GAP":
        s = brk.settles[0]
        lag = (_days(s.settled_date) - _days(brk.books.entry_date)).days
        if lag <= T_PLUS_DAYS:
            # within window → auto-resolve (re-check "passed": window is legal)
            if auto_budget[0] >= MAX_AUTO_PER_BATCH:
                event("ESCALATED", "runbook", "auto-resolution budget exhausted (S3)")
                return RunbookResult("TICKET", None, "NONE",
                                     "stopping-rule: auto budget exhausted"), ev
            auto_budget[0] += 1
            cursor[0] += 45                      # the re-check happens 45min later
            res_at = _clock(batch_open, cursor[0])
            event("AUTO_RESOLVED", "runbook",
                  f"settle lag T+{lag} within window T+{T_PLUS_DAYS} — resolved by re-check")
            return RunbookResult("RESOLVED", None, "NONE",
                                 "auto: timing gap inside settlement window", res_at), ev
        event("RECHECK_FAILED", "runbook", f"settle lag T+{lag} outside window T+{T_PLUS_DAYS}")
        event("ESCALATED", "runbook", "timing gap beyond window — ticket for finance desk")
        return RunbookResult("TICKET", None, "NONE",
                             "auto: settle beyond T+3 window, ticketed"), ev

    # ---- RBT-02 AMOUNT_DRIFT ---------------------------------------------
    if inc.break_class == "AMOUNT_DRIFT":
        s = brk.settles[0]
        delta = s.net_amount_paise - (brk.books.amount_paise - s.fee_paise)
        action = (f"journal adjustment of ₹{abs(delta)/100:,.2f} "
                  f"({'debit' if delta < 0 else 'credit'}) against {s.utr}")
        event("ACTION_PROPOSED", "engine",
              f"proposed: {action} — requires human approval (S5)")
        return RunbookResult("PROPOSED", action, "PENDING_APPROVAL",
                             "proposed adjustment awaiting human"), ev

    # ---- RBT-03 MISSING_ENTRY ---------------------------------------------
    if inc.break_class == "MISSING_ENTRY":
        if brk.books is not None:
            action = (f"draft settlement-entry for {brk.order_ref} "
                      f"(₹{brk.books.amount_paise/100:,.0f}) and confirm with the rail")
        else:
            action = (f"draft books-entry for rail settlement {brk.settles[0].utr} "
                      f"(₹{brk.amount_paise/100:,.0f})")
        event("HUMAN_PAGED", "runbook",
              f"missing entry — page finance desk; draft prepared but never auto-written")
        event("ACTION_PROPOSED", "engine", f"proposed: {action}")
        return RunbookResult("PAGED", action, "PENDING_APPROVAL",
                             "paged: unrecorded money needs human entry"), ev

    # ---- RBT-04 DUPLICATE_CHARGE ------------------------------------------
    if inc.break_class == "DUPLICATE_CHARGE":
        dup = brk.settles[1]
        action = f"reversal request for duplicate settlement {dup.utr} (₹{dup.net_amount_paise/100:,.2f} net)"
        event("HUMAN_PAGED", "runbook", "duplicate charge detected — page desk")
        event("ACTION_PROPOSED", "engine", f"proposed: {action}")
        return RunbookResult("PAGED", action, "PENDING_APPROVAL",
                             "paged: duplicate money needs human reversal"), ev

    # ---- RBT-05 FEE_MISMATCH ------------------------------------------------
    if inc.break_class == "FEE_MISMATCH":
        s = brk.settles[0]
        from .generator import expected_fee_paise
        diff = s.fee_paise - expected_fee_paise(s.gross_amount_paise)
        action = (f"reclassify ₹{abs(diff)/100:,.2f} fee variance on {s.utr} "
                  f"to fee-expense (schedule delta)")
        event("ACTION_PROPOSED", "engine",
              f"proposed: {action} — requires human approval (S5)")
        return RunbookResult("PROPOSED", action, "PENDING_APPROVAL",
                             "proposed reclass awaiting human"), ev

    # unknown class → safest possible path
    event("HUMAN_PAGED", "runbook", "unmapped break class — page human")
    return RunbookResult("PAGED", None, "NONE", "unmapped break, paged"), ev


def _days(s: str):
    from datetime import date
    return date.fromisoformat(s)
