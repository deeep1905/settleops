// shared types mirroring the engine's dicts
export interface TimelineEvent {
  ts: string;
  kind: string;
  actor: "engine" | "runbook" | "human" | "llm-assist";
  incident_id: string | null;
  detail: string;
}

export interface Incident {
  id: string;
  break_class: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  books_id: string | null;
  settle_id: string | null;
  order_ref: string;
  amount_paise: number;
  currency: string;
  status:
    | "OPEN"
    | "SCHEDULED"
    | "PROPOSED"
    | "PAGED"
    | "RESOLVED"
    | "TICKET";
  runbook: string;
  proposed_action: string | null;
  action_state: "NONE" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  cause_hint: string;
  cause_source: string;
  detected_at: string;
  resolved_at: string | null;
  resolve_reason: string;
  events: TimelineEvent[];
}

export interface Metrics {
  match_rate: number;
  incidents_total: number;
  auto_resolved: number;
  awaiting_human: number;
  open_or_scheduled: number;
  paged: number;
  sev1: number;
  sev2: number;
  sev3: number;
  mttr_hours_auto: number | null;
}

export interface Batch {
  batch_id: string;
  seed: number;
  opened_at: string;
  counts: { books: number; settlements: number; matched: number; incidents: number };
  match_rate: number;
  metrics: Metrics;
  incidents: Incident[];
}
