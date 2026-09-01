"""settleops.audit — the append-only incident timeline.

Every state change on every incident is an event with an actor and a
timestamp on the fixed batch clock. The whole batch can be replayed from
the event log alone (tests prove it). This is the audit trail the brief
asks for — event-sourced, in plain JSON, human-readable in docs/.
"""
from __future__ import annotations

import json
from pathlib import Path

from .models import TimelineEvent

LEGAL_ACTORS = {"engine", "runbook", "human", "llm-assist"}

# events that may legally start an incident's story
FIRST_EVENT = "BREAK_DETECTED"
# every incident must reach one of these terminal states (or wait for a human)
TERMINAL_OR_WAITING = {
    "AUTO_RESOLVED", "ESCALATED", "HUMAN_PAGED", "ACTION_PROPOSED",
    "APPROVED", "REJECTED",
}


class AuditLog:
    def __init__(self) -> None:
        self.events: list[TimelineEvent] = []

    def append(self, ev: TimelineEvent) -> None:
        if ev.actor not in LEGAL_ACTORS:
            raise ValueError(f"illegal actor: {ev.actor}")
        if self.events:
            last = self.events[-1]
            if ev.ts < last.ts:
                raise ValueError("event log must be append-ordered in time")
        self.events.append(ev)

    def for_incident(self, incident_id: str) -> list[TimelineEvent]:
        return [e for e in self.events if e.incident_id == incident_id]

    def to_dicts(self) -> list[dict]:
        return [e.__dict__ for e in self.events]

    def dump(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            for e in self.events:
                f.write(json.dumps(e.__dict__, sort_keys=True) + "\n")

    @classmethod
    def load(cls, path: str | Path) -> "AuditLog":
        log = cls()
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line.strip():
                d = json.loads(line)
                log.events.append(TimelineEvent(**d))
        return log

    def validate(self) -> list[str]:
        """Returns a list of violations (empty = clean). Used by tests+CI."""
        problems: list[str] = []
        seen_incidents: set[str] = set()
        for e in self.events:
            if e.incident_id and e.incident_id not in seen_incidents:
                if e.kind != FIRST_EVENT:
                    problems.append(
                        f"{e.incident_id}: first event is {e.kind}, expected {FIRST_EVENT}")
                seen_incidents.add(e.incident_id)
        for e in self.events:
            if e.actor not in LEGAL_ACTORS:
                problems.append(f"{e.ts}: illegal actor {e.actor}")
        return problems
