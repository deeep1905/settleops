"""settleops.models — the core dataclasses.

Two sources that should agree:
  BooksRecord      — the merchant's own ledger (what we *think* happened)
  SettlementRecord — the payment rail's settlement file (what *actually* paid)

Money is integer paise everywhere. No floats, ever.
Timestamps are ISO strings; the batch runs on a fixed clock derived from the
seed, so every metric is reproducible bit-for-bit.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


# ---------------------------------------------------------------- records

@dataclass(frozen=True)
class BooksRecord:
    id: str                 # "B001"
    order_ref: str          # merchant order id, e.g. "ord_9f12"
    entry_date: str         # ISO date the books entry was made
    amount_paise: int       # gross amount recorded in books
    currency: str = "INR"
    account: str = "sales-receivable"


@dataclass(frozen=True)
class SettlementRecord:
    id: str                 # "S001"
    utr: str                # rail settlement reference
    order_ref: str
    settled_date: str       # ISO date the rail settled
    net_amount_paise: int   # net credited (gross minus fee)
    fee_paise: int = 0
    currency: str = "INR"
    gross_amount_paise: int = 0  # gross before fee


# ---------------------------------------------------------------- matching

@dataclass(frozen=True)
class MatchedPair:
    books: BooksRecord
    settle: SettlementRecord
    confidence: str          # EXACT | HIGH | PARTIAL
    note: str = ""


# ---------------------------------------------------------------- incidents

BREAK_CLASSES = (
    "TIMING_GAP",        # rail settles later than the books date (window T+3)
    "AMOUNT_DRIFT",      # small unexplained difference between the pair
    "MISSING_ENTRY",     # books has it, the rail never settled it
    "DUPLICATE_CHARGE",  # rail settled the same order twice, books once
    "FEE_MISMATCH",      # rail fee differs from the published fee schedule
    "CURRENCY_MISMATCH", # pair amounts are in different currencies
)

SEV_ORDER = {"SEV-1": 1, "SEV-2": 2, "SEV-3": 3}


@dataclass
class Incident:
    id: str                       # "INC-0001"
    break_class: str              # one of BREAK_CLASSES
    severity: str                 # SEV-1 | SEV-2 | SEV-3
    books_id: Optional[str]
    settle_id: Optional[str]
    order_ref: str
    amount_paise: int             # the money at stake (max of the sides)
    currency: str
    status: str = "OPEN"          # OPEN|SCHEDULED|PROPOSED|PAGED|RESOLVED|TICKET
    runbook: str = ""             # "RBT-02"
    proposed_action: Optional[str] = None   # machine-proposed, never auto-applied
    action_state: str = "NONE"    # NONE | PENDING_APPROVAL | APPROVED | REJECTED
    cause_hint: str = ""          # diagnosis text ("AI-suggested:" when LLM)
    cause_source: str = "rules"   # rules | llm
    detected_at: str = ""         # ISO (fixed batch clock)
    resolved_at: Optional[str] = None
    resolve_reason: str = ""
    events: list["TimelineEvent"] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class TimelineEvent:
    ts: str
    kind: str          # BATCH_OPENED | MATCHED | BREAK_DETECTED | DIAGNOSED |
                       # RUNBOOK_STARTED | ACTION_PROPOSED | HUMAN_PAGED |
                       # AUTO_RESOLVED | ESCALATED | APPROVED | REJECTED |
                       # RECHECK_PASSED | RECHECK_FAILED | POSTMORTEM_WRITTEN
    actor: str         # engine | runbook | human | llm-assist
    incident_id: Optional[str]
    detail: str


# ---------------------------------------------------------------- batch

@dataclass
class BatchReport:
    batch_id: str
    seed: int
    opened_at: str
    books_count: int
    settle_count: int
    matched: int
    incidents: list[Incident] = field(default_factory=list)
    event_log: list[TimelineEvent] = field(default_factory=list)

    @property
    def match_rate(self) -> float:
        denom = max(1, self.books_count)
        return round(100.0 * self.matched / denom, 1)

    def to_dict(self) -> dict:
        return {
            "batch_id": self.batch_id,
            "seed": self.seed,
            "opened_at": self.opened_at,
            "counts": {
                "books": self.books_count,
                "settlements": self.settle_count,
                "matched": self.matched,
                "incidents": len(self.incidents),
            },
            "match_rate": self.match_rate,
            "metrics": self.metrics(),
            "incidents": [i.to_dict() for i in self.incidents],
        }

    def metrics(self) -> dict:
        inc = self.incidents
        auto = [i for i in inc if i.status == "RESOLVED" and i.resolve_reason.startswith("auto")]
        paged = [i for i in inc if i.status == "PAGED"]
        proposed = [i for i in inc if i.status == "PROPOSED"]
        open_ = [i for i in inc if i.status in ("OPEN", "SCHEDULED", "TICKET")]
        mttr_hours = None
        if auto:
            det = [_seconds(self.opened_at, i.detected_at) for i in auto]
            res = [_seconds(self.opened_at, i.resolved_at or self.opened_at) for i in auto]
            mttr_hours = round((sum(res) - sum(det)) / len(auto) / 3600.0, 2)
        return {
            "match_rate": self.match_rate,
            "incidents_total": len(inc),
            "auto_resolved": len(auto),
            "awaiting_human": len(proposed) + len(paged),
            "open_or_scheduled": len(open_),
            "paged": len(paged),
            "sev1": sum(1 for i in inc if i.severity == "SEV-1"),
            "sev2": sum(1 for i in inc if i.severity == "SEV-2"),
            "sev3": sum(1 for i in inc if i.severity == "SEV-3"),
            "mttr_hours_auto": mttr_hours,
        }


def _seconds(base: str, ts: str) -> float:
    if not ts:
        return 0.0
    from datetime import datetime
    try:
        b = datetime.fromisoformat(base)
        t = datetime.fromisoformat(ts)
        return (t - b).total_seconds()
    except ValueError:
        return 0.0
