import { useEffect, useState } from "react";
import type { Metrics } from "../types";
import { getJSON } from "../lib";
import { CountUp, Bar } from "./ui";

interface PostmortemData {
  markdown: string;
  metrics: Metrics;
}

export function Postmortem({ onBoard }: { onBoard: () => void }) {
  const [data, setData] = useState<PostmortemData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<PostmortemData>("/api/postmortem")
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="card px-4 py-8 text-center text-[13px] text-crit">{error}</div>;
  if (!data) return <div className="card px-4 py-10 text-center text-[13px] text-muted">loading postmortem…</div>;

  const m = data.metrics;
  const total = Math.max(1, m.incidents_total);

  return (
    <div>
      {/* ---------- hero band ---------- */}
      <section className="card grid-bg mb-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <div className="kicker text-accent">the sre artifact</div>
            <h1 className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[30px]">
              Postmortem
            </h1>
            <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
              What happened, what the engine did, what it could not fix and why. The honest
              list is the point: an incident console that hides its unresolved pile is
              lying to you.
            </p>
          </div>
          <div className="text-right">
            <CountUp
              value={m.match_rate}
              decimals={1}
              suffix="%"
              className="text-[42px] font-semibold leading-none tracking-[-0.02em] text-ink"
            />
            <div className="kicker mt-1.5 text-faint">match rate</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        {/* ---------- left: the report ---------- */}
        <div className="card divide-y divide-line">
          {data.markdown
            .split("\n\n")
            .filter(Boolean)
            .map(renderBlock)}
        </div>

        {/* ---------- right: the numbers, at a glance ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="incidents" value={m.incidents_total} />
            <Stat label="auto-resolved" value={m.auto_resolved} tone="ok" hint="bounded by S3" />
            <Stat label="awaiting human" value={m.awaiting_human} tone="warn" />
            <Stat label="paged" value={m.paged} tone="crit" />
          </div>

          <div className="card px-4 py-4">
            <div className="kicker text-faint">severity mix</div>
            <div className="mt-3 space-y-2.5">
              {([
                ["SEV-1", m.sev1, "bg-crit", "text-crit"],
                ["SEV-2", m.sev2, "bg-warn", "text-warn"],
                ["SEV-3", m.sev3, "bg-info", "text-info"],
              ] as [string, number, string, string][]).map(([sev, n, bar, label], i) => (
                <div key={sev} className="flex items-center gap-3">
                  <span className={`w-12 shrink-0 text-[11px] font-semibold ${label}`}>{sev}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper">
                    <Bar pct={(n / total) * 100} className={bar} delay={150 + i * 90} />
                  </div>
                  <span className="tabular w-4 shrink-0 text-right text-[12px] font-semibold text-ink">{n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card px-4 py-4">
            <div className="kicker text-faint">where it stands</div>
            <div className="mt-3 space-y-2.5">
              {([
                ["auto-resolved", m.auto_resolved, "bg-ok"],
                ["awaiting human", m.awaiting_human, "bg-warn"],
                ["open / scheduled", m.open_or_scheduled, "bg-accent"],
                ["paged", m.paged, "bg-crit"],
              ] as [string, number, string][]).map(([l, n, color], i) => (
                <div key={l} className="flex items-center gap-3">
                  <span className="w-[6.5rem] shrink-0 text-[12px] text-muted">{l}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper">
                    <Bar pct={(n / total) * 100} className={color} delay={200 + i * 80} />
                  </div>
                  <span className="tabular w-4 shrink-0 text-right text-[12px] font-semibold text-ink">{n}</span>
                </div>
              ))}
            </div>
            {m.mttr_hours_auto != null && (
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
                mean time to resolve (auto):{" "}
                <span className="tabular font-semibold text-ink">{m.mttr_hours_auto}h</span>
              </p>
            )}
          </div>

          <button
            onClick={onBoard}
            className="w-full rounded-[5px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper shadow-[0_1px_2px_rgba(16,19,23,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(16,19,23,0.45)]"
          >
            Work the board →
          </button>

          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            regenerated by <span className="font-mono">make report</span> — numbers enter
            the repo only through regeneration
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: {
  label: string; value: number; tone?: "ok" | "warn" | "crit"; hint?: string;
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "crit" ? "text-crit" : "text-ink";
  return (
    <div className="card lift px-4 py-3">
      <div className="kicker text-faint">{label}</div>
      <CountUp value={value} className={`mt-1 block text-[22px] font-semibold leading-none ${color}`} />
      {hint && <div className="mt-1 text-[10.5px] text-faint">{hint}</div>}
    </div>
  );
}

function renderBlock(block: string, idx: number) {
  if (block.startsWith("# ")) {
    return (
      <h2 key={idx} className="px-5 py-3.5 text-[17px] font-semibold tracking-[-0.01em]">{block.slice(2)}</h2>
    );
  }
  if (block.startsWith("*") && block.endsWith("*")) {
    return (
      <p key={idx} className="px-5 py-2 text-[12px] italic text-faint">{cleanEmphasis(block)}</p>
    );
  }
  if (block.startsWith("|")) {
    const rows = block.split("\n").filter((r) => !/^\|\s*-{2,}/.test(r));
    const header = rows[0].split("|").filter((c) => c.trim()).map((c) => c.trim());
    const body = rows.slice(1).map((r) => r.split("|").filter((c) => c.trim()).map((c) => c.trim()));
    return (
      <div key={idx} className="overflow-x-auto px-5 py-3">
        <table className="w-full min-w-[480px] text-left text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.05em] text-faint">
              {header.map((h) => <th key={h} className="py-1.5 pr-4 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className="border-t border-line/70 odd:bg-paper/45">
                {r.map((c, j) => (
                  <td key={j} className={`py-2 pr-4 ${j === 0 ? "font-mono text-[11.5px] font-medium text-accent" : "text-muted"}`}>
                    {cleanEmphasis(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.startsWith("- ")) {
    return (
      <ul key={idx} className="space-y-1.5 px-5 py-3">
        {block.split("\n").map((l, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line2" />
            {cleanEmphasis(l.slice(2))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={idx} className="px-5 py-3 text-[13px] leading-relaxed text-muted">
      {cleanEmphasis(block)}
    </p>
  );
}

function cleanEmphasis(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\*(.+)\*$/g, "$1").replace(/`/g, "");
}
