"""settleops.taxonomy — classify each break: severity + default runbook.

The diagnosis is deterministic rules over the break's own evidence
(dates, deltas, counts). The optional LLM (llm.py) may *annotate* a hint
afterwards; it never changes severity, runbook, or remedy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .matcher import Break, T_PLUS_DAYS

RULES = {
    "TIMING_GAP":       dict(runbook="RBT-01", sev="SEV-3"),
    "AMOUNT_DRIFT":     dict(runbook="RBT-02", sev="SEV-3"),
    "MISSING_ENTRY":    dict(runbook="RBT-03", sev="SEV-2"),
    "DUPLICATE_CHARGE": dict(runbook="RBT-04", sev="SEV-2"),
    "FEE_MISMATCH":     dict(runbook="RBT-05", sev="SEV-3"),
    "CURRENCY_MISMATCH": dict(runbook="RBT-06", sev="SEV-1"),
}

HUMAN_DESK_THRESHOLD_PAISE = 5_000_000   # ₹50,000 — anything at/above always pages


@dataclass
class Diagnosis:
    break_class: str
    severity: str
    runbook: str
    evidence: str          # plain-language evidence, derived from the records
    over_threshold: bool   # True → forced human page regardless of runbook


def _d(s: str) -> date:
    return date.fromisoformat(s)


def diagnose(b: Break) -> Diagnosis:
    rule = RULES[b.break_class]
    sev = rule["sev"]
    over = b.amount_paise >= HUMAN_DESK_THRESHOLD_PAISE

    s = b.settles[0] if b.settles else None

    if b.break_class == "TIMING_GAP":
        if b.books and s:
            lag = (_d(s.settled_date) - _d(b.books.entry_date)).days
            evidence = (f"books dated {b.books.entry_date}, rail settled "
                        f"{s.settled_date} (T+{lag}, window T+{T_PLUS_DAYS})")
        else:
            evidence = "timing evidence incomplete (records missing)"
    elif b.break_class == "AMOUNT_DRIFT":
        if b.books and s:
            delta = s.net_amount_paise - (b.books.amount_paise - s.fee_paise)
            evidence = (f"books ₹{b.books.amount_paise/100:,.0f} gross, rail net "
                        f"₹{s.net_amount_paise/100:,.0f} — unexplained delta "
                        f"₹{delta/100:,.0f} ({delta} paise)")
        else:
            evidence = "amount evidence incomplete (records missing)"
    elif b.break_class == "MISSING_ENTRY":
        if b.books:
            evidence = (f"books recorded order {b.order_ref} "
                        f"(₹{b.books.amount_paise/100:,.0f} on {b.books.entry_date}); "
                        f"no settlement row exists on the rail side")
        else:
            evidence = (f"rail settled order {b.order_ref} "
                        f"(₹{b.amount_paise/100:,.0f}); no books entry exists")
    elif b.break_class == "DUPLICATE_CHARGE":
        utrs = ", ".join(x.utr for x in b.settles) or "(no utrs)"
        evidence = (f"rail settled {b.order_ref} twice ({utrs}); "
                    f"books recorded it once")
    elif b.break_class == "FEE_MISMATCH":
        if s:
            from .generator import expected_fee_paise
            exp = expected_fee_paise(s.gross_amount_paise)
            evidence = (f"rail charged fee ₹{s.fee_paise/100:,.2f}; published "
                        f"schedule says ₹{exp/100:,.2f} for this gross")
        else:
            evidence = "fee evidence incomplete (settlement missing)"
    else:  # CURRENCY_MISMATCH
        if b.books and s:
            evidence = (f"books recorded {b.books.currency}, rail settled "
                        f"{s.currency} for order {b.order_ref}")
        else:
            evidence = f"currency pair incomplete for order {b.order_ref}"
        sev = "SEV-1"

    # hard safety rule: big money always pages a human, any class
    if over and sev != "SEV-1":
        sev = "SEV-2"
        evidence += " — amount at/above ₹50,000, forced to the human desk"

    return Diagnosis(
        break_class=b.break_class, severity=sev, runbook=rule["runbook"],
        evidence=evidence, over_threshold=over,
    )
