import { useCallback, useEffect, useState } from "react";
import type { Batch, Incident } from "./types";
import { getJSON, postJSON } from "./lib";
import { Board } from "./components/Board";
import { IncidentDetail } from "./components/IncidentDetail";
import { Postmortem } from "./components/Postmortem";
import { HowItWorks } from "./components/HowItWorks";
import { Landing } from "./components/Landing";

type View = "home" | "board" | "incident" | "postmortem" | "how";

export default function App() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [current, setCurrent] = useState<Incident | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [brain, setBrain] = useState<string>("rules");

  const load = useCallback(async () => {
    try {
      const h = await getJSON<{ brain: string }>("/api/health");
      setBrain(h.brain);
      const d = await getJSON<{ batch: Batch }>("/api/batch/latest");
      setBatch(d.batch);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openIncident = (i: Incident) => { setCurrent(i); setView("incident"); };

  const decide = async (id: string, decision: "approve" | "reject") => {
    const d = await postJSON<{ incident: Incident }>(`/api/incidents/${id}/decide`, { decision });
    setCurrent(d.incident);
    setBatch((b) => b ? { ...b, incidents: b.incidents.map((x) => x.id === id ? d.incident : x) } : b);
    void load();
  };

  const rerun = async () => {
    setRestarting(true);
    try {
      await postJSON("/api/batch/run", {});
      await load();
    } finally { setRestarting(false); }
  };

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <button className="flex items-center gap-2.5" onClick={() => setView("home")} title="overview">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="6" fill="#4F46E5" />
              <path d="M9 16.5l5 5 9-11" stroke="#fff" strokeWidth="3.2" fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">SettleOps</span>
            <span className="hidden text-[12px] text-faint sm:inline">finance incident console</span>
          </button>

          <nav className="ml-auto flex items-center gap-1">
            {([
              ["home", "Overview"],
              ["board", "Board"],
              ["postmortem", "Postmortem"],
              ["how", "How it works"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  view === v || (view === "incident" && (v === "board" || v === "home"))
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-paper hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={rerun}
              disabled={restarting || !batch}
              className="ml-2 rounded-md bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {restarting ? "running…" : "Run batch"}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        {error && (
          <div className="card mb-6 border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
            Engine unreachable ({error}). Run <code className="font-mono">make run</code> and reload —
            the console stands alone, the numbers arrive when the engine does.
          </div>
        )}
        {!batch && !error && view !== "home" && (
          <div className="card mb-6 px-4 py-10 text-center text-[13px] text-muted">
            starting the engine…
          </div>
        )}
        {view === "home" && (
          <Landing
            batch={batch}
            brain={brain}
            onOpen={() => setView("board")}
            onHow={() => setView("how")}
            onPm={() => setView("postmortem")}
            onRun={rerun}
            busy={restarting}
          />
        )}
        {batch && view !== "home" && (
          <>
            {view === "board" && <Board batch={batch} brain={brain} onOpen={openIncident} />}
            {view === "incident" && current && (
              <IncidentDetail incident={current} onBack={() => setView("board")} onDecide={decide} />
            )}
            {view === "postmortem" && <Postmortem onOpen={openIncident} />}
            {view === "how" && <HowItWorks />}
          </>
        )}
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {/* brand block */}
          <div>
            <div className="flex items-center gap-2.5">
              <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
                <rect width="32" height="32" rx="6" fill="#4F46E5" />
                <path d="M9 16.5l5 5 9-11" stroke="#fff" strokeWidth="3.2" fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[15px] font-semibold tracking-[-0.01em]">SettleOps</span>
            </div>
            <p className="mt-3 max-w-[38ch] text-[12.5px] leading-relaxed text-muted">
              The incident console for your books — deterministic matching, bounded
              remediation, an audit trail born with every event.
            </p>
            <div className="mt-4 flex items-center gap-2 font-mono text-[10.5px] text-faint">
              <span className="live-dot" aria-hidden />
              {batch
                ? `batch ${batch.batch_id} · seed ${batch.seed} · brain: ${brain}`
                : `brain: ${brain}`}
            </div>
          </div>

          {/* console nav */}
          <nav aria-label="console">
            <div className="kicker text-faint">console</div>
            <ul className="mt-3 space-y-2">
              {([
                ["home", "Overview"],
                ["board", "Board"],
                ["postmortem", "Postmortem"],
                ["how", "How it works"],
              ] as const).map(([v, label]) => (
                <li key={v}>
                  <button
                    onClick={() => { setView(v); window.scrollTo({ top: 0 }); }}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* the repo — every claim, greppable */}
          <nav aria-label="repository">
            <div className="kicker text-faint">the repo</div>
            <ul className="mt-3 space-y-2">
              {([
                ["README", "https://github.com/deeep1905/settleops/blob/main/README.md"],
                ["tests/", "https://github.com/deeep1905/settleops/tree/main/tests"],
                ["Makefile", "https://github.com/deeep1905/settleops/blob/main/Makefile"],
                ["docs/", "https://github.com/deeep1905/settleops/tree/main/docs"],
              ] as const).map(([label, href]) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[12px] text-muted transition-colors hover:text-accent"
                  >
                    {label} <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-[12px] text-faint sm:px-6">
            <span>SettleOps · reconciliation as incident response</span>
            <span className="font-mono">synthetic data · integer paise · deterministic seed</span>
            <span className="ml-auto">built for Razorpay AI Buildathon 2026 · Track 4</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
