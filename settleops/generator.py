"""settleops.generator — synthetic two-source data with seeded ground truth.

Every break planted here is *registered*: the generator returns not just the
two files but the exact list of planted breaks. Tests (and the postmortem)
can therefore prove the matcher found exactly what was planted — no more,
no less. Metrics are honest by construction, not by assertion.

The rail mimics Razorpay's settlement report shape (order_ref, utr,
settled_date, gross/net/fee) in test mode; amounts are integer paise.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta

from .models import BooksRecord, SettlementRecord

# published fee schedule: 2% of gross, min ₹2 (200 paise), max ₹500 (50000 paise)
FEE_PCT = 0.02
FEE_MIN_PAISE = 200
FEE_MAX_PAISE = 50_000


def expected_fee_paise(gross_paise: int) -> int:
    fee = int(round(gross_paise * FEE_PCT))
    return max(FEE_MIN_PAISE, min(FEE_MAX_PAISE, fee))


BATCH_OPEN = "2026-08-30T09:15:00"          # fixed clock for determinism
BOOKS_START = date(2026, 8, 12)             # 18-day batch window
SETTLE_SLA_DAYS = 1                         # must match matcher.SLA_DAYS


@dataclass
class Planted:
    break_class: str
    order_ref: str
    detail: str


@dataclass
class SourceData:
    books: list[BooksRecord]
    settlements: list[SettlementRecord]
    planted: list[Planted]
    seed: int

    @property
    def planted_counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for p in self.planted:
            out[p.break_class] = out.get(p.break_class, 0) + 1
        return out


def generate(seed: int = 42, clean_pairs: int = 54) -> SourceData:
    """Generate the two sources. Default shape: 54 clean pairs + 12 planted
    breaks = 66 books records, 68 settlement records (2 duplicates)."""
    rng = random.Random(seed)

    books: list[BooksRecord] = []
    settles: list[SettlementRecord] = []
    planted: list[Planted] = []

    def oid(i: int) -> str:
        return f"ord_{seed % 100:02d}{i:04d}"

    # --- clean pairs ---------------------------------------------------
    for i in range(1, clean_pairs + 1):
        gross = rng.randrange(20_000, 30_000_000, 100)  # ₹200 – ₹3,00,000
        fee = expected_fee_paise(gross)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 18))
        ref = oid(i)
        books.append(BooksRecord(
            id=f"B{i:03d}", order_ref=ref, entry_date=d.isoformat(),
            amount_paise=gross,
        ))
        settles.append(SettlementRecord(
            id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
            settled_date=(d + timedelta(days=rng.randrange(0, SETTLE_SLA_DAYS + 1))).isoformat(),
            gross_amount_paise=gross, fee_paise=fee, net_amount_paise=gross - fee,
        ))

    def next_index() -> int:
        return clean_pairs + len(planted) + 1

    # --- planted breaks -------------------------------------------------
    # TIMING_GAP ×3: rail settles beyond the T+1 SLA but two of them inside
    # the hard T+3 window (auto-resolve at re-check); one at T+6 (escalates).
    for k, lag in enumerate((2, 3, 6)):
        i = next_index()
        gross = rng.randrange(50_000, 5_000_000, 100)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
        ref = oid(i)
        books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                                 entry_date=d.isoformat(), amount_paise=gross))
        settles.append(SettlementRecord(
            id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
            settled_date=(d + timedelta(days=lag)).isoformat(),
            gross_amount_paise=gross, fee_paise=expected_fee_paise(gross),
            net_amount_paise=gross - expected_fee_paise(gross),
        ))
        planted.append(Planted("TIMING_GAP", ref, f"rail T+{lag} vs books {d}"))

    # AMOUNT_DRIFT ×2: net differs from books gross by a small unexplained delta
    for k in range(2):
        i = next_index()
        gross = rng.randrange(100_000, 4_000_000, 100)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
        ref = oid(i)
        books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                                 entry_date=d.isoformat(), amount_paise=gross))
        fee = expected_fee_paise(gross)
        # drift: rail net = books gross - fee + delta (delta unexplained)
        delta = rng.randrange(50, 9_000, 50) if k == 0 else -rng.randrange(50, 9_000, 50)
        settles.append(SettlementRecord(
            id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
            settled_date=(d + timedelta(days=1)).isoformat(),
            gross_amount_paise=gross, fee_paise=fee,
            net_amount_paise=gross - fee + delta,
        ))
        planted.append(Planted("AMOUNT_DRIFT", ref, f"delta {delta} paise"))

    # MISSING_ENTRY ×2: books has it, rail never settled
    for k in range(2):
        i = next_index()
        gross = rng.randrange(30_000, 8_000_000, 100)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
        ref = oid(i)
        books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                                 entry_date=d.isoformat(), amount_paise=gross))
        # NOTE: no settlement row at all
        planted.append(Planted("MISSING_ENTRY", ref, "no settlement row"))

    # DUPLICATE_CHARGE ×2: rail settled the same order twice
    for k in range(2):
        i = next_index()
        gross = rng.randrange(40_000, 6_000_000, 100)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
        ref = oid(i)
        fee = expected_fee_paise(gross)
        books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                                 entry_date=d.isoformat(), amount_paise=gross))
        settles.append(SettlementRecord(
            id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
            settled_date=(d + timedelta(days=1)).isoformat(),
            gross_amount_paise=gross, fee_paise=fee, net_amount_paise=gross - fee,
        ))
        settles.append(SettlementRecord(
            id=f"S{i:03d}D", utr=f"UTR{seed:03d}{i:05d}D", order_ref=ref,
            settled_date=(d + timedelta(days=2)).isoformat(),
            gross_amount_paise=gross, fee_paise=fee, net_amount_paise=gross - fee,
        ))
        planted.append(Planted("DUPLICATE_CHARGE", ref, "rail settled twice"))

    # FEE_MISMATCH ×2: rail fee differs from the published schedule
    for k in range(2):
        i = next_index()
        gross = rng.randrange(200_000, 9_000_000, 100)
        d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
        ref = oid(i)
        bad_fee = expected_fee_paise(gross) + (1500 if k == 0 else -700)
        books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                                 entry_date=d.isoformat(), amount_paise=gross))
        settles.append(SettlementRecord(
            id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
            settled_date=(d + timedelta(days=1)).isoformat(),
            gross_amount_paise=gross, fee_paise=bad_fee,
            net_amount_paise=gross - bad_fee,
        ))
        planted.append(Planted("FEE_MISMATCH", ref, f"fee {bad_fee} vs expected "
                             f"{expected_fee_paise(gross)}"))

    # CURRENCY_MISMATCH ×1: settlement came back in a different currency
    i = next_index()
    gross = rng.randrange(300_000, 2_000_000, 100)
    d = BOOKS_START + timedelta(days=rng.randrange(0, 15))
    ref = oid(i)
    books.append(BooksRecord(id=f"B{i:03d}", order_ref=ref,
                             entry_date=d.isoformat(), amount_paise=gross))
    settles.append(SettlementRecord(
        id=f"S{i:03d}", utr=f"UTR{seed:03d}{i:05d}", order_ref=ref,
        settled_date=(d + timedelta(days=1)).isoformat(),
        gross_amount_paise=gross, fee_paise=expected_fee_paise(gross),
        net_amount_paise=gross - expected_fee_paise(gross),
        currency="USD",
    ))
    planted.append(Planted("CURRENCY_MISMATCH", ref, "settle currency USD"))

    return SourceData(books=books, settlements=settles, planted=planted, seed=seed)
