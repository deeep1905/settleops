"""API tests via FastAPI TestClient — every endpoint, the decision flow,
error paths, and the no-LLM guarantee."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

from settleops.api import app

client = TestClient(app)


class TestHealth:
    def test_health_ok(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] and d["service"] == "settleops"
        assert d["brain"] == "rules"
        assert d["incidents"] == 12


class TestBatch:
    def test_latest_has_kpis(self):
        d = client.get("/api/batch/latest").json()
        b = d["batch"]
        assert b["match_rate"] == 81.8
        assert b["counts"]["books"] == 66
        assert len(b["incidents"]) == 12

    def test_run_with_default_seed_is_deterministic(self):
        a = client.post("/api/batch/run", json={}).json()["batch"]
        assert a["batch_id"] == "R42"
        assert a["match_rate"] == 81.8

    def test_run_with_new_seed_changes_numbers(self):
        a = client.post("/api/batch/run", json={"seed": 42}).json()["batch"]
        b = client.post("/api/batch/run", json={"seed": 7}).json()["batch"]
        assert a["counts"] != b["counts"] or a["incidents"] != b["incidents"]
        # restore deterministic state for other tests
        client.post("/api/batch/run", json={"seed": 42})


class TestIncidents:
    def test_list_all(self):
        d = client.get("/api/incidents").json()
        assert len(d["incidents"]) == 12

    def test_filter_status(self):
        d = client.get("/api/incidents", params={"status": "PAGED"}).json()
        assert d["incidents"]
        assert all(i["status"] == "PAGED" for i in d["incidents"])

    def test_filter_class(self):
        d = client.get("/api/incidents", params={"klass": "TIMING_GAP"}).json()
        assert len(d["incidents"]) == 3

    def test_filter_sev(self):
        d = client.get("/api/incidents", params={"sev": "SEV-1"}).json()
        assert len(d["incidents"]) == 1

    def test_detail_has_story(self):
        d = client.get("/api/incidents/INC-0001").json()["incident"]
        assert d["events"]
        assert d["runbook"].startswith("RBT-")

    def test_detail_404(self):
        assert client.get("/api/incidents/INC-9999").status_code == 404


class TestDecisions:
    def test_approve_flow(self):
        # pick a proposed incident
        items = client.get("/api/incidents", params={"status": "PROPOSED"}).json()["incidents"]
        iid = items[0]["id"]
        r = client.post(f"/api/incidents/{iid}/decide", json={"decision": "approve"})
        assert r.status_code == 200
        inc = r.json()["incident"]
        assert inc["status"] == "RESOLVED"
        assert inc["action_state"] == "APPROVED"
        assert any(e["kind"] == "APPROVED" and e["actor"] == "human"
                   for e in inc["events"])
        # restore
        client.post("/api/batch/run", json={"seed": 42})

    def test_reject_flow(self):
        items = client.get("/api/incidents", params={"status": "PROPOSED"}).json()["incidents"]
        iid = items[0]["id"]
        r = client.post(f"/api/incidents/{iid}/decide", json={"decision": "reject"})
        assert r.json()["incident"]["status"] == "OPEN"
        client.post("/api/batch/run", json={"seed": 42})

    def test_bad_decision_rejected(self):
        r = client.post("/api/incidents/INC-0001/decide", json={"decision": "maybe"})
        assert r.status_code == 400

    def test_unknown_incident_404(self):
        r = client.post("/api/incidents/INC-9999/decide", json={"decision": "approve"})
        assert r.status_code == 404


class TestPostmortemEndpoint:
    def test_returns_markdown_and_metrics(self):
        d = client.get("/api/postmortem").json()
        assert "match rate" in d["markdown"]
        assert d["metrics"]["match_rate"] == 81.8

    def test_log_endpoint_validates(self):
        d = client.get("/api/log").json()
        assert d["violations"] == []
        assert d["events"]
