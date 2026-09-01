"""settleops.pipeline — the one loop: ingest → match → diagnose → remediate
→ postmortem. Also exports run_batch() (used by the API, CLI and tests)
and a human decision entry point (approve/reject) that appends to the audit
log — the only way money-adjacent state ever changes.
"""
from __future__ import annotations

from datetime import datetime

from .audit import AuditLog
from .generator import BATCH_OPEN, generate
from .llm import llm_hint
from .matcher import match
from .models import BatchReport, Incident, TimelineEvent
from .runbooks import run_runbook
from .taxonomy import diagnose

INC_SEQ = 0


def run_batch(seed: int = 42) -> BatchReport:
    global INC_SEQ
    INC_SEQ = 0
    sources = generate(seed=seed)
    matched, breaks = match(sources)
    log = AuditLog()

    batch_open = BATCH_OPEN if seed == 42 else datetime.now().isoformat(timespec="seconds")
    report = BatchReport(
        batch_id=f"R{seed % 100:02d}", seed=seed, opened_at=batch_open,
        books_count=len(sources.books), settle_count=len(sources.settlements),
        matched=matched,
    )

    log.append(TimelineEvent(ts=batch_open, kind="BATCH_OPENED", actor="engine",
                             incident_id=None,
                             detail=f"batch {report.batch_id} opened — "
                                    f"{len(sources.books)} books rows vs "
                                    f"{len(sources.settlements)} settlement rows"))

    auto_budget = [0]
    cursor = [0]                 # causality clock: minutes since batch open

    for brk in breaks:
        INC_SEQ += 1
        cursor[0] += 1
        detected = _tick(batch_open, cursor[0])
        inc = _new_incident(INC_SEQ, brk, detected)
        log.append(TimelineEvent(
            ts=detected, kind="BREAK_DETECTED", actor="engine",
            incident_id=inc.id,
            detail=f"{brk.break_class} on {brk.order_ref} — "
                   f"₹{brk.amount_paise/100:,.0f} at stake"))
        diag = diagnose(brk)
        inc.severity, inc.runbook = diag.severity, diag.runbook
        hint, src = llm_hint(brk, diag.evidence)
        inc.cause_hint, inc.cause_source = hint, src
        log.append(TimelineEvent(
            ts=detected, kind="DIAGNOSED", actor="engine",
            incident_id=inc.id,
            detail=f"severity {diag.severity} · runbook {diag.runbook} · "
                   f"{diag.evidence}"))
        if src == "llm":
            log.append(TimelineEvent(
                ts=detected, kind="DIAGNOSED", actor="llm-assist",
                incident_id=inc.id, detail=hint))

        result, events = run_runbook(inc, brk, diag, batch_open,
                                     auto_budget, cursor)
        inc.status = result.status
        inc.proposed_action = result.proposed_action
        inc.action_state = result.action_state
        inc.resolve_reason = result.reason
        inc.resolved_at = result.resolved_at
        for e in events:
            log.append(e)
        inc.events = log.for_incident(inc.id)
        report.incidents.append(inc)

    report.event_log = log.events
    return report


def human_decide(report: BatchReport, incident_id: str, decision: str
                 ) -> Incident | None:
    """The human-in-the-loop entry point. decision: 'approve' | 'reject'.
    Appends APPROVED/REJECTED to the incident story; approve moves a
    PROPOSED/PAGED incident to RESOLVED (human-executed), reject to OPEN
    with a note. Returns the incident or None if unknown id."""
    inc = next((i for i in report.incidents if i.id == incident_id), None)
    if inc is None:
        return None
    now = datetime.now().isoformat(timespec="seconds")
    if decision == "approve":
        inc.action_state = "APPROVED"
        inc.status = "RESOLVED"
        inc.resolved_at = now
        inc.resolve_reason = "human: approved proposed action"
        inc.events = inc.events + [TimelineEvent(
            ts=now, kind="APPROVED", actor="human", incident_id=inc.id,
            detail=f"human approved: {inc.proposed_action or 'page acknowledged'}")]
    elif decision == "reject":
        inc.action_state = "REJECTED"
        inc.status = "OPEN"
        inc.resolve_reason = "human: rejected proposed action"
        inc.events = inc.events + [TimelineEvent(
            ts=now, kind="REJECTED", actor="human", incident_id=inc.id,
            detail="human rejected the proposal — incident reopened")]
    else:
        return None
    # keep the batch-level log in sync
    report.event_log = report.event_log + inc.events[-1:]
    return inc


def _new_incident(seq: int, brk, detected_at: str) -> Incident:
    return Incident(
        id=f"INC-{seq:04d}", break_class=brk.break_class,
        severity="SEV-3",  # provisional — taxonomy sets the real one
        books_id=brk.books.id if brk.books else None,
        settle_id=brk.settles[0].id if brk.settles else None,
        order_ref=brk.order_ref, amount_paise=brk.amount_paise,
        currency=(brk.books.currency if brk.books else
                  (brk.settles[0].currency if brk.settles else "INR")),
        detected_at=detected_at,
    )


def _tick(base: str, minutes: int) -> str:
    from datetime import timedelta
    return (datetime.fromisoformat(base) + timedelta(minutes=minutes)).isoformat()
