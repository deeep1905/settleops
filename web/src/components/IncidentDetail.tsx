import type { Incident } from "../types";
import { classLabel, classTone, inr, sevTone, statusTone, timeOf, rupees2 } from "../lib";

const RUNBOOK_STEPS: Record<string, string[]> = {
  "RBT-01": [
    "compare settled_date against books date",
    "if settle lag inside T+3 window → auto-resolve at re-check",
    "if beyond window → ticket for the finance desk",
  ],
  "RBT-02": [
    "compute the unexplained delta (net vs gross − fee)",
    "propose a journal adjustment for exactly the delta",
    "wait for human approval — never write silently (S5)",
  ],
  "RBT-03": [
    "draft the missing settlement/books entry",
    "page the finance desk — unrecorded money needs a human (S1)",
    "never auto-write a draft entry",
  ],
  "RBT-04": [
    "identify the duplicate settlement (second UTR)",
    "propose a reversal request for the duplicate",
    "page the desk — reversal of real money is human territory",
  ],
  "RBT-05": [
    "diff rail fee against the published schedule",
    "propose reclassifying the variance to fee-expense",
    "wait for human approval",
  ],
  "RBT-06": [
    "flag currency pair mismatch immediately (S2)",
    "page at SEV-1 — never any automated action",
    "verify FX route configuration with the rail",
  ],
};

const EVENT_TONE: Record<string, string> = {
  BREAK_DETECTED: "bg-crit",
  DIAGNOSED: "bg-info",
  RUNBOOK_STARTED: "bg-accent",
  ACTION_PROPOSED: "bg-warn",
  HUMAN_PAGED: "bg-crit",
  AUTO_RESOLVED: "bg-ok",
  ESCALATED: "bg-info",
  RECHECK_PASSED: "bg-ok",
  RECHECK_FAILED: "bg-warn",
  APPROVED: "bg-ok",
  REJECTED: "bg-crit",
};

const ACTOR_TONE: Record<string, string> = {
  engine: "text-accent bg-accent-soft",
  runbook: "text-info bg-info-soft",
  human: "text-ok bg-ok-soft",
  "llm-assist": "text-warn bg-warn-soft",
};

export function IncidentDetail({ incident: i, onBack, onDecide }: {
  incident: Incident;
  onBack: () => void;
  onDecide: (id: string, decision: "approve" | "reject") => Promise<void>;
}) {
  const pending = i.action_state === "PENDING_APPROVAL" && i.status !== "RESOLVED";

  return (
    <div>
      {/* header */}
      <button onClick={onBack}
        className="mb-4 text-[12.5px] font-medium text-muted transition-colors hover:text-ink">
        ← back to the board
      </button>

      <div className="card pop mb-5 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold text-accent">{i.id}</span>
          <span className={`chip pop ${sevTone(i.severity)}`} key={i.severity}>{i.severity}</span>
          <span className={`chip pop ${classTone[i.break_class] ?? ""}`} key={i.break_class}>
            {classLabel[i.break_class] ?? i.break_class}
          </span>
          <span key={i.status} className={`chip pop ${statusTone(i.status)}`}>{i.status}</span>
          <span className="tabular ml-auto font-mono text-[19px] font-semibold">
            {inr(i.amount_paise)}
          </span>
        </div>
        {/* machine strings, but readable: the label whispers, the value
            speaks — separation without a whole new layout */}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px]">
          <span><span className="text-faint">order</span> <span className="text-muted">{i.order_ref}</span></span>
          <span><span className="text-faint">books</span> <span className="text-muted">{i.books_id ?? "—"}</span></span>
          <span><span className="text-faint">settle</span> <span className="text-muted">{i.settle_id ?? "—"}</span></span>
          <span><span className="text-faint">currency</span> <span className="text-muted">{i.currency}</span></span>
          <span><span className="text-faint">runbook</span> <span className="text-muted">{i.runbook}</span></span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* left column: diagnosis + runbook + action */}
        <div className="space-y-5">
          {/* diagnosis */}
          <section className="card px-5 py-4">
            <h3 className="kicker text-faint">diagnosis</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink">
              {i.events.find((e) => e.kind === "DIAGNOSED" && e.actor === "engine")?.detail
                ?? "—"}
            </p>
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
              <span className={`chip mr-2 ${i.cause_source === "llm" ? "text-warn bg-warn-soft" : "text-info bg-info-soft"}`}>
                {i.cause_source === "llm" ? "AI-suggested" : "rules"}
              </span>
              {i.cause_hint}
            </p>
          </section>

          {/* runbook */}
          <section className="card px-5 py-4">
            <div className="flex items-baseline justify-between">
              <h3 className="kicker text-faint">
                runbook <span className="font-mono">{i.runbook}</span>
              </h3>
              <span className="text-[11.5px] text-faint">
                {i.status === "RESOLVED" ? "closed" : pending ? "waiting on you" : "in progress"}
              </span>
            </div>
            <ol className="mt-3 space-y-2.5">
              {(RUNBOOK_STEPS[i.runbook] ?? ["page a human — unmapped class"]).map((s, idx) => {
                const done = i.status === "RESOLVED" || (idx === 0 && i.runbook !== "");
                return (
                  <li key={idx} className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-semibold ${
                      done ? "border-ok bg-ok-soft text-ok" : "border-line2 bg-surface text-faint"}`}>
                      {done ? "✓" : idx + 1}
                    </span>
                    <span className="text-[13px] leading-relaxed text-ink">{s}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* proposed action + decision */}
          <section className={`card px-5 py-4 ${pending ? "border-warn/40" : ""}`}>
            <h3 className="kicker text-faint">proposed action</h3>
            {i.proposed_action ? (
              <>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{i.proposed_action}</p>
                {pending ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => void onDecide(i.id, "approve")}
                      className="rounded-[5px] bg-[#059669] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(5,150,105,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(5,150,105,0.55)] disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      Approve &amp; close
                    </button>
                    <button
                      onClick={() => void onDecide(i.id, "reject")}
                      className="rounded-[5px] border border-line2 bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-crit/40 hover:bg-crit-soft hover:text-crit disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      Reject &amp; reopen
                    </button>
                    <span className="text-[11.5px] text-faint">
                      your decision is audit-logged as a human event
                    </span>
                  </div>
                ) : (
                  <p key={`${i.action_state}-${i.status}`} className={`pop mt-2 text-[12.5px] font-medium ${i.action_state === "APPROVED" ? "text-ok" : i.action_state === "REJECTED" ? "text-crit" : "text-muted"}`}>
                    {i.action_state === "APPROVED" && "✓ approved by a human — incident closed"}
                    {i.action_state === "REJECTED" && "rejected by a human — incident reopened"}
                    {i.action_state === "NONE" && "paged to the human desk — no auto-apply path"}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                {i.status === "RESOLVED"
                  ? `resolved — ${i.resolve_reason}`
                  : i.status === "PAGED"
                  ? "paged to the human desk; no machine action proposed"
                  : "no machine action proposed"}
              </p>
            )}
          </section>
        </div>

        {/* right column: timeline */}
        <section className="card h-fit px-5 py-4">
          <h3 className="kicker text-faint">timeline · {i.events.length} events</h3>
          <ol className="mt-4 space-y-4">
            {i.events.map((e, idx) => (
              <li key={idx} style={{ animationDelay: `${Math.min(idx, 10) * 45}ms` }} className="row-in relative pl-5">
                {idx < i.events.length - 1 && (
                  <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden />
                )}
                <span className={`absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full ${EVENT_TONE[e.kind] ?? "bg-line2"}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink">{e.kind}</span>
                  <span className="font-mono text-[10.5px] text-faint tabular">{timeOf(e.ts)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`chip ${ACTOR_TONE[e.actor] ?? ""}`}>{e.actor}</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{e.detail}</p>
              </li>
            ))}
          </ol>
          {i.resolved_at && (
            <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-faint">
              resolved at {timeOf(i.resolved_at)} · {i.resolve_reason}
            </p>
          )}
        </section>
      </div>

      {/* money-at-stake footnote */}
      <p className="mt-4 text-[11.5px] text-muted">
        money at stake {rupees2(i.amount_paise)} · every event above is in the append-only log
        (<span className="font-mono">data/incident_log.jsonl</span>) and replayable end to end
      </p>
    </div>
  );
}
