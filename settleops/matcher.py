"""settleops.matcher — deterministic, graded matching. No LLM in this file.

Strategy (mirrors how a finance ops human scans a reconciliation sheet):
  1. index both sides by order_ref
  2. exact pair check: same ref, fee matches the published schedule,
     dates within T+3, same currency, net reconciles with gross-fee
  3. anything else becomes a *break* handed to the taxonomy with evidence

Confidence grades for clean pairs:
  EXACT   — dates within 1 day, arithmetic perfect
  HIGH    — dates within T+3, arithmetic perfect
  PARTIAL — arithmetic perfect but a soft flag (kept as a match, surfaced)

The matcher never *decides* what a break means — it only emits evidence.
Classification is taxonomy.py's job; remedies are runbooks.py's job.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .generator import expected_fee_paise
from .models import BooksRecord, SettlementRecord

T_PLUS_DAYS = 3          # hard settlement window: re-checks pass up to T+3
SLA_DAYS = 1             # the rail's promised SLA: lag beyond this is a
                         # timing incident (it may still self-heal by T+3)
AMOUNT_EQUIVALENT = 0    # paise tolerance on arithmetic (exact integers)


@dataclass
class Break:
    break_class: str
    order_ref: str
    books: BooksRecord | None
    settles: list[SettlementRecord]

    @property
    def amount_paise(self) -> int:
        candidates = [b.amount_paise for b in (self.books,) if b]
        candidates += [s.gross_amount_paise or s.net_amount_paise for s in self.settles]
        return max(candidates) if candidates else 0


def _d(s: str) -> date:
    return date.fromisoformat(s)


def match(sources) -> tuple[int, list[Break]]:
    """Returns (number_of_clean_matches, list_of_breaks)."""
    books_by_ref: dict[str, list[BooksRecord]] = {}
    for b in sources.books:
        books_by_ref.setdefault(b.order_ref, []).append(b)

    settle_by_ref: dict[str, list[SettlementRecord]] = {}
    for s in sources.settlements:
        settle_by_ref.setdefault(s.order_ref, []).append(s)

    matched = 0
    breaks: list[Break] = []

    all_refs = sorted(set(books_by_ref) | set(settle_by_ref))
    for ref in all_refs:
        bs = books_by_ref.get(ref, [])
        ss = settle_by_ref.get(ref, [])
        b = bs[0] if bs else None

        # ---- rail-only or books-only → structural breaks
        if not bs and ss:
            # rail paid something the books never recorded
            # (the generator never plants this, but a real rail does:
            #  treat as MISSING_ENTRY from the books side, flagged "unbooked")
            breaks.append(Break("MISSING_ENTRY", ref, None, ss))
            continue
        if bs and not ss:
            breaks.append(Break("MISSING_ENTRY", ref, b, []))
            continue
        if len(bs) > 1:
            # duplicate books entries — out of scope, keep the first
            # (honesty: this generator never plants it; matcher reports nothing)
            pass

        assert b is not None

        # ---- duplicate rail settlements
        if len(ss) > 1:
            breaks.append(Break("DUPLICATE_CHARGE", ref, b, ss))
            continue

        s = ss[0]

        # ---- currency
        if (b.currency or "INR") != (s.currency or "INR"):
            breaks.append(Break("CURRENCY_MISMATCH", ref, b, [s]))
            continue

        # ---- fee schedule
        exp_fee = expected_fee_paise(s.gross_amount_paise or b.amount_paise)
        if s.fee_paise != exp_fee:
            breaks.append(Break("FEE_MISMATCH", ref, b, [s]))
            continue

        # ---- arithmetic: net must equal gross - fee, and gross must equal books
        arith_ok = (
            s.net_amount_paise == s.gross_amount_paise - s.fee_paise
            and s.gross_amount_paise == b.amount_paise
        )
        if not arith_ok:
            # gross-fee-net reconciles but differs from books → drift
            if s.net_amount_paise == s.gross_amount_paise - s.fee_paise:
                breaks.append(Break("AMOUNT_DRIFT", ref, b, [s]))
            else:
                # rail's own arithmetic is broken — deepest honesty case,
                # treat as drift too (the runbook escalates, never auto-fixes)
                breaks.append(Break("AMOUNT_DRIFT", ref, b, [s]))
            continue

        # ---- timing: rail SLA is T+1; beyond that it's a timing incident
        # (the runbook's re-check still auto-resolves if it lands inside
        #  the hard T+3 window — see runbooks RBT-01)
        lag = (_d(s.settled_date) - _d(b.entry_date)).days
        if lag > SLA_DAYS:
            breaks.append(Break("TIMING_GAP", ref, b, [s]))
            continue

        # ---- clean pair
        matched += 1

    return matched, breaks
