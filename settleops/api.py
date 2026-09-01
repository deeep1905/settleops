"""settleops.api — FastAPI service. Endpoints:

  GET  /api/health                — liveness + which brain is on
  POST /api/batch/run             — run a fresh batch (seed optional)
  GET  /api/batch/latest          — KPIs + incident list
  GET  /api/incidents             — filterable incident list
  GET  /api/incidents/{id}        — one incident, full story
  POST /api/incidents/{id}/decide — human approve/reject (audit-logged)
  GET  /api/postmortem            — markdown postmortem + stats
  GET  /api/log                   — the raw event log

State: in-memory per process, deterministic seed on boot. On a serverless
host each instance boots the same default batch, so the numbers a judge
sees are always the committed, reproducible ones. Human decisions persist
for the life of the warm instance and are recorded in the event log.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .pipeline import human_decide, run_batch
from .postmortem import write_postmortem

app = FastAPI(title="SettleOps", version="1.0.0",
              description="The incident console for your books.")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# the running state — deterministic on boot
BATCH = run_batch(seed=42)
POSTMORTEM_MD = write_postmortem(BATCH)


class Decision(BaseModel):
    decision: str  # "approve" | "reject"


class RunSpec(BaseModel):
    seed: int | None = None


def _ok(**kw) -> dict:
    return {"ok": True, **kw}


@app.get("/api/health")
def health():
    llm = bool(os.environ.get("GROQ_API_KEY") or os.environ.get("GEMINI_API_KEY")
               or os.environ.get("OPENAI_API_KEY"))
    return _ok(service="settleops", batch_id=BATCH.batch_id,
               brain="llm-assisted" if llm else "rules",
               incidents=len(BATCH.incidents),
               events=len(BATCH.event_log))


@app.post("/api/batch/run")
def run(spec: RunSpec | None = None):
    global BATCH, POSTMORTEM_MD
    seed = spec.seed if spec and spec.seed is not None else 42
    BATCH = run_batch(seed=seed)
    POSTMORTEM_MD = write_postmortem(BATCH)
    return _ok(batch=BATCH.to_dict())


@app.get("/api/batch/latest")
def latest():
    return _ok(batch=BATCH.to_dict())


@app.get("/api/incidents")
def incidents(status: str | None = None, klass: str | None = None,
              sev: str | None = None):
    items = BATCH.incidents
    if status:
        items = [i for i in items if i.status == status.upper()]
    if klass:
        items = [i for i in items if i.break_class == klass.upper()]
    if sev:
        items = [i for i in items if i.severity == sev.upper()]
    return _ok(incidents=[i.to_dict() for i in items])


@app.get("/api/incidents/{incident_id}")
def incident(incident_id: str):
    inc = next((i for i in BATCH.incidents if i.id == incident_id), None)
    if inc is None:
        raise HTTPException(404, f"unknown incident {incident_id}")
    return _ok(incident=inc.to_dict())


@app.post("/api/incidents/{incident_id}/decide")
def decide(incident_id: str, body: Decision):
    if body.decision not in ("approve", "reject"):
        raise HTTPException(400, "decision must be approve|reject")
    inc = human_decide(BATCH, incident_id, body.decision)
    if inc is None:
        raise HTTPException(404, f"unknown incident {incident_id}")
    return _ok(incident=inc.to_dict())


@app.get("/api/postmortem")
def postmortem():
    return _ok(markdown=POSTMORTEM_MD, metrics=BATCH.metrics())


@app.get("/api/log")
def log():
    from .audit import AuditLog
    a = AuditLog()
    a.events = BATCH.event_log
    problems = a.validate()
    return _ok(events=[e.__dict__ for e in BATCH.event_log], violations=problems)
