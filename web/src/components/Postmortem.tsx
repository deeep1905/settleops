import { useEffect, useState } from "react";
import type { Incident, Metrics } from "../types";
import { getJSON } from "../lib";

interface PostmortemData {
  markdown: string;
  metrics: Metrics;
}

export function Postmortem({ onOpen }: { onOpen: (i: Incident) => void }) {
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

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
        the SRE artifact
      </div>
      <h1 className="mb-2 text-[28px] font-semibold tracking-[-0.02em]">Postmortem</h1>
      <p className="mb-6 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
        What happened, what the engine did, what it could not fix and why. The honest list is the
        point: an incident console that hides its unresolved pile is lying to you.
      </p>

      {/* stat grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="match rate" value={`${m.match_rate}%`} tone="ok" />
        <Stat label="incidents" value={m.incidents_total} />
        <Stat label="auto-resolved" value={m.auto_resolved} tone="ok" hint="bounded" />
        <Stat label="awaiting human" value={m.awaiting_human} tone="warn" />
      </div>

      {/* the markdown, rendered as light structure */}
      <div className="card divide-y divide-line">
        {data.markdown
          .split("\n\n")
          .filter(Boolean)
          .map(renderBlock)}
      </div>

      <p className="mt-4 text-[11.5px] text-faint">
        tip: every incident id above is live on the{" "}
        <button className="text-accent underline" onClick={() => onOpen({} as Incident)}>
          board
        </button>{" "}
        — regenerate with <span className="font-mono">make report</span>
      </p>
    </div>
  );
}

function Stat({ label, value, tone, hint }: {
  label: string; value: string | number; tone?: "ok" | "warn"; hint?: string;
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint">{label}</div>
      <div className={`tabular mt-1 text-[22px] font-semibold leading-none ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-[10.5px] text-faint">{hint}</div>}
    </div>
  );
}

function renderBlock(block: string, idx: number) {
  if (block.startsWith("# ")) {
    return (
      <h2 key={idx} className="px-5 py-3.5 text-[17px] font-semibold">{block.slice(2)}</h2>
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
              <tr key={i} className="border-t border-line/70">
                {r.map((c, j) => (
                  <td key={j} className={`py-1.5 pr-4 ${j === 0 ? "font-mono text-[11.5px]" : "text-muted"}`}>
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
