import { useMemo, useState } from "react";
import type { Batch, Incident } from "../types";
import { classLabel, classTone, inr, sevTone, statusTone } from "../lib";
import { CountUp, Select } from "./ui";
import type { Opt } from "./ui";

export function Board({ batch, brain, onOpen }: {
  batch: Batch; brain: string; onOpen: (i: Incident) => void;
}) {
  const [status, setStatus] = useState<string>("ALL");
  const [klass, setKlass] = useState<string>("ALL");

  const rows = useMemo(() => batch.incidents.filter((i) =>
    (status === "ALL" || i.status === status) &&
    (klass === "ALL" || i.break_class === klass)), [batch, status, klass]);

  const m = batch.metrics;

  /* live counts per option — the filters double as a summary */
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: batch.incidents.length };
    for (const i of batch.incidents) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [batch]);
  const classCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: batch.incidents.length };
    for (const i of batch.incidents) c[i.break_class] = (c[i.break_class] ?? 0) + 1;
    return c;
  }, [batch]);

  const statusOpts: Opt<string>[] = [
    { value: "ALL", label: "all statuses", count: statusCounts.ALL },
    ...(["OPEN", "PROPOSED", "PAGED", "RESOLVED", "TICKET"] as const)
      .filter((s) => statusCounts[s])
      .map((s) => ({ value: s, label: s.toLowerCase(), count: statusCounts[s] })),
  ];
  const classOpts: Opt<string>[] = [
    { value: "ALL", label: "all classes", count: classCounts.ALL },
    ...(["TIMING_GAP", "AMOUNT_DRIFT", "MISSING_ENTRY",
      "DUPLICATE_CHARGE", "FEE_MISMATCH", "CURRENCY_MISMATCH"] as const)
      .filter((c) => classCounts[c])
      .map((c) => ({ value: c, label: classLabel[c] ?? c.toLowerCase(), count: classCounts[c] })),
  ];

  return (
    <div>
      {/* ---------- hero strip ---------- */}
      <section className="card grid-bg mb-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <div className="kicker text-accent">
              batch {batch.batch_id} · seed {batch.seed} · {brain} brain
            </div>
            <h1 className="mt-2 max-w-[34ch] text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[30px]">
              {batch.counts.matched} of {batch.counts.books} lines reconciled.
              <span className="text-muted"> The rest became incidents.</span>
            </h1>
            <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
              {batch.counts.books} books rows vs {batch.counts.settlements} settlement rows. Every
              break was detected, diagnosed and routed to a runbook — {m.auto_resolved} closed
              inside the automation budget, {m.awaiting_human} waiting on a human, {m.paged} paged.
            </p>
          </div>
          <div className="text-right">
            <CountUp
              value={batch.match_rate}
              decimals={1}
              suffix="%"
              className="text-[42px] font-semibold leading-none tracking-[-0.02em] text-ink"
            />
            <div className="kicker mt-1.5 text-faint">match rate</div>
          </div>
        </div>
      </section>

      {/* ---------- KPI cards ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="incidents" value={m.incidents_total} tone="ink" />
        <Kpi label="auto-resolved" value={m.auto_resolved} tone="ok" hint="bounded by S3" />
        <Kpi label="awaiting human" value={m.awaiting_human} tone="warn" />
        <Kpi label="paged" value={m.paged} tone="crit" />
        <Kpi label="SEV-1" value={m.sev1} tone="crit" />
        <Kpi label="MTTR (auto)" value={`${m.mttr_hours_auto ?? "—"}h`} tone="ok" />
      </div>

      {/* ---------- filters ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Select label="status" value={status} options={statusOpts} onChange={setStatus} />
        <Select label="class" value={klass} options={classOpts} onChange={setKlass} />
        {(status !== "ALL" || klass !== "ALL") && (
          <button
            onClick={() => { setStatus("ALL"); setKlass("ALL"); }}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-faint transition-colors hover:text-ink"
          >
            reset
          </button>
        )}
        <span className="tabular ml-auto text-[12px] text-faint">
          {rows.length} of {batch.incidents.length} shown
        </span>
      </div>

      {/* ---------- incidents table ---------- */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-[11px] uppercase tracking-[0.06em] text-faint">
                <th className="px-4 py-2.5 font-semibold">sev</th>
                <th className="px-3 py-2.5 font-semibold">incident</th>
                <th className="px-3 py-2.5 font-semibold">class</th>
                <th className="px-3 py-2.5 font-semibold">amount</th>
                <th className="px-3 py-2.5 font-semibold">runbook</th>
                <th className="px-3 py-2.5 font-semibold">status</th>
                <th className="px-3 py-2.5 font-semibold">why</th>
              </tr>
            </thead>
            {/* keyed by the active filters so a new filter replays the stagger */}
            <tbody key={`${status}:${klass}`}>
              {rows.map((i, idx) => (
                <tr
                  key={i.id}
                  onClick={() => onOpen(i)}
                  style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}
                  className="row-in cursor-pointer border-b border-line/70 transition-colors last:border-b-0 hover:bg-accent-soft/50"
                >
                  <td className="px-4 py-2.5">
                    <span className={`chip ${sevTone(i.severity)}`}>{i.severity}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] font-medium text-accent">
                    {i.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`chip ${classTone[i.break_class] ?? ""}`}>
                      {classLabel[i.break_class] ?? i.break_class}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px] tabular">{inr(i.amount_paise)}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-muted">{i.runbook}</td>
                  <td className="px-3 py-2.5">
                    <span className={`chip ${statusTone(i.status)}`}>{i.status}</span>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-[12.5px] text-muted">
                    {i.resolve_reason}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-faint">
                    no incidents match these filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, hint }: {
  label: string; value: number | string; tone: "ink" | "ok" | "warn" | "crit"; hint?: string;
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn"
    : tone === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="card lift px-4 py-3">
      <div className="kicker text-faint">{label}</div>
      {typeof value === "number" ? (
        <CountUp value={value} className={`mt-1 block text-[24px] font-semibold leading-none ${color}`} />
      ) : (
        <div className={`tabular mt-1 text-[24px] font-semibold leading-none ${color}`}>{value}</div>
      )}
      {hint && <div className="mt-1 text-[10.5px] text-faint">{hint}</div>}
    </div>
  );
}
