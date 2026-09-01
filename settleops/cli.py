"""cli — `python -m settleops` runs the engine headless and writes the
report + postmortem (what `make report` calls)."""
from __future__ import annotations

import json
from pathlib import Path

from .audit import AuditLog
from .pipeline import run_batch
from .postmortem import write_postmortem

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    report = run_batch(seed=42)
    ROOT.joinpath("results").mkdir(exist_ok=True)
    ROOT.joinpath("data").mkdir(exist_ok=True)

    ROOT.joinpath("results/batch_report.json").write_text(
        json.dumps({"status": "ok", **report.to_dict()}, indent=1), encoding="utf-8")

    md = write_postmortem(report)
    ROOT.joinpath("results/postmortem.md").write_text(md, encoding="utf-8")

    log = AuditLog()
    log.events = report.event_log
    log.dump(ROOT / "data" / "incident_log.jsonl")

    m = report.metrics()
    print(f"settleops :: batch {report.batch_id} — {m['match_rate']}% matched, "
          f"{m['incidents_total']} incidents, {m['auto_resolved']} auto-resolved, "
          f"{m['awaiting_human']} awaiting human")
    violations = log.validate()
    if violations:
        print("AUDIT VIOLATIONS:", violations)
        return 1
    print(f"event log clean — {len(report.event_log)} events "
          f"(data/incident_log.jsonl)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
