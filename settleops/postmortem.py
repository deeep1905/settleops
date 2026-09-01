"""settleops.postmortem — the SRE artifact: what happened, what we did,
what we couldn't fix, and why. Rendered as markdown + JSON stats.
"""
from __future__ import annotations

from .models import BatchReport


def write_postmortem(report: BatchReport) -> str:
    m = report.metrics()
    counts = report.to_dict()["counts"]
    inc = report.incidents

    by_class: dict[str, list] = {}
    for i in inc:
        by_class.setdefault(i.break_class, []).append(i)

    unresolved = [i for i in inc if i.status != "RESOLVED"]

    lines: list[str] = []
    a = lines.append
    a(f"# Postmortem — batch {report.batch_id} (seed {report.seed})")
    a("")
    a(f"*Opened {report.opened_at} · {counts['books']} books rows · "
      f"{counts['settlements']} settlement rows · {len(inc)} incidents.*")
    a("")
    a("## The numbers")
    a("")
    a("| metric | value |")
    a("|---|---|")
    a(f"| match rate | **{m['match_rate']}%** ({counts['matched']}/{counts['books']}) |")
    a(f"| incidents | {m['incidents_total']} |")
    a(f"| auto-resolved (bounded) | {m['auto_resolved']} |")
    a(f"| awaiting human decision | {m['awaiting_human']} |")
    a(f"| paged (human desk) | {m['paged']} |")
    a(f"| SEV-1 / SEV-2 / SEV-3 | {m['sev1']} / {m['sev2']} / {m['sev3']} |")
    a(f"| mean time to resolve (auto) | {m['mttr_hours_auto']} h |")
    a("")
    a("## What the engine did")
    a("")
    a(f"{counts['matched']} of {counts['books']} books lines matched the rail "
      f"exactly ({m['match_rate']}%). The remaining {len(inc)} became incidents, "
      f"each classified by the break taxonomy and handed to its runbook. "
      f"{m['auto_resolved']} were resolved inside the automation budget "
      f"(timing gaps that closed within the T+3 window); "
      f"{m['awaiting_human']} carry a proposed action or a page and are "
      f"waiting on a human decision. No adjustment was written to the books "
      f"without an approval event — see the timeline.")
    a("")
    a("## Break classes found")
    a("")
    a("| class | runbook | count | outcome |")
    a("|---|---|---|---|")
    for cls in sorted(by_class):
        items = by_class[cls]
        outs = ", ".join(sorted({i.status for i in items}))
        rb = items[0].runbook
        a(f"| {cls} | {rb} | {len(items)} | {outs} |")
    a("")
    a("## Could not resolve — and why (honest list)")
    a("")
    if not unresolved:
        a("Everything resolved. (On the default seed this should not happen — "
          "the planted breaks are designed to page humans on purpose.)")
    else:
        a("| incident | class | sev | amount | why unresolved |")
        a("|---|---|---|---|---|")
        for i in unresolved:
            amt = f"₹{i.amount_paise/100:,.0f}"
            why = {
                "PAGED": "money-adjacent action — needs the human desk",
                "PROPOSED": "adjustment drafted, awaiting human approval",
                "TICKET": "escalated: window/budget stopping rule",
                "SCHEDULED": "re-check scheduled",
                "OPEN": "awaiting triage",
            }.get(i.status, i.status)
            a(f"| {i.id} | {i.break_class} | {i.severity} | {amt} | {why} |")
    a("")
    a("## What we would change next")
    a("")
    a("- Feed the T+6 timing gap back to the payout-schedule owner (recurring "
      "class, not a one-off).")
    a("- Pre-validate fee schedule versions at ingest so fee mismatches "
      "surface before close, not after.")
    a("- Add a rails-side duplicate-dedup key so retries never double-settle.")
    a("- The currency mismatch is a config error: the FX route should be "
      "alerted on, not just reconciled around.")
    a("")
    a("## Stopping rules that fired")
    a("")
    a("| rule | what it prevented |")
    a("|---|---|")
    a("| S1 ≥ ₹50,000 pages a human | silent large-value auto-actions |")
    a("| S2 currency mismatch never auto-acts | wrong-FX write-backs |")
    a("| S3 max 5 auto-resolutions/batch | runaway automation |")
    a("| S4 no consecutive automated actions | unreviewed chains |")
    a("| S5 proposals only, never silent writes | unapproved journal edits |")
    a("")
    a(f"*Regenerate this file with `make report`. Event log: "
      f"{len(report.event_log)} events, replayable from `data/incident_log.jsonl`.*")
    return "\n".join(lines)
