import { useCallback, useEffect, useState } from "react";
import type { Batch, Incident } from "./types";
import { getJSON, postJSON } from "./lib";
import { Board } from "./components/Board";
import { IncidentDetail } from "./components/IncidentDetail";
import { Postmortem } from "./components/Postmortem";
import { HowItWorks } from "./components/HowItWorks";
import { Landing } from "./components/Landing";
import { LogoMark, ThemeToggle } from "./components/ui";
import { ChatBot } from "./components/ChatBot";

const REPO = "https://github.com/deeep1905/settleops";

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

  /* every navigation lands at the top, the way a real console does */
  useEffect(() => { window.scrollTo(0, 0); }, [view, current]);

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

  /* the landing ends on its own card now — every view closes the same
     way, into the same standard footer */

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <button className="flex items-center gap-2.5" onClick={() => setView("home")} title="overview">
            <LogoMark size={22} />
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
              /* on phones the bar stays lean: the logo goes home, the
                 landing links to how-it-works — the two workhorse views
                 plus the run button fit without horizontal scroll */
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-[4px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  v === "home" || v === "how" ? "hidden sm:inline-flex" : ""
                } ${
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
              className="ml-2 rounded-[4px] bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {restarting ? "running…" : "Run batch"}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-6">
        {/* views compose themselves on navigation; incidents re-compose per id */}
        <div key={view === "incident" && current ? `incident-${current.id}` : view} className="view-in">
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
              {view === "postmortem" && <Postmortem onBoard={() => setView("board")} />}
              {view === "how" && (
                <HowItWorks
                  batch={batch}
                  onOpen={() => setView("board")}
                  onPm={() => setView("postmortem")}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* the bottom of the desk: mark + copyright + lamp + source on the
          left, quiet link columns on the right. A footer says where things
          are; it does not repeat the site. Standard tokens — it follows the
          theme the way every other surface does. */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6">
          <div className="flex flex-col gap-10 lg:flex-row lg:gap-16">
            {/* ---------------- the left column ---------------- */}
            <div className="flex shrink-0 flex-col lg:w-[264px]">
              <div>
                <button
                  onClick={() => { setView("home"); window.scrollTo({ top: 0 }); }}
                  className="group flex items-center gap-2.5"
                  aria-label="SettleOps home"
                >
                  <LogoMark size={20} className="opacity-80 transition-opacity group-hover:opacity-100" />
                  <span className="text-[15px] font-semibold leading-none tracking-[-0.01em]">SettleOps</span>
                </button>
                <p className="mt-5 text-[11px] leading-relaxed text-muted">
                  © 2026 SettleOps · built by <a href="https://github.com/deeep1905" target="_blank" rel="noreferrer" className="font-medium text-muted transition-colors hover:text-ink">deeep1905</a>
                  <br />
                  Razorpay AI Buildathon 2026 · Track 4
                  <br />
                  synthetic data · integer paise · deterministic seed
                </p>
              </div>

              <div className="mt-auto flex items-center gap-3 pt-8">
                <ThemeToggle />
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[4px] border border-line py-1.5 pl-2.5 pr-3 text-[11px] font-medium text-muted transition-colors hover:border-line2 hover:text-ink"
                >
                  <svg aria-hidden className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  deeep1905/settleops
                </a>
              </div>
            </div>

            {/* ---------------- quiet link columns ---------------- */}
            <nav className="flex flex-1 flex-wrap gap-x-14 gap-y-8" aria-label="footer">
              <div className="flex flex-col">
                <span className="mb-1.5 text-[12.5px] font-semibold text-ink">Console</span>
                <div className="flex flex-col gap-1">
                  {([
                    ["home", "Overview"],
                    ["board", "Board"],
                    ["postmortem", "Postmortem"],
                    ["how", "How it works"],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => { setView(v); window.scrollTo({ top: 0 }); }}
                      className="w-fit text-left text-[13px] leading-relaxed text-muted transition-colors hover:text-ink"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col">
                <span className="mb-1.5 text-[12.5px] font-semibold text-ink">The repo</span>
                <div className="flex flex-col gap-1">
                  {([
                    ["README", `${REPO}/blob/main/README.md`],
                    ["tests/", `${REPO}/tree/main/tests`],
                    ["Makefile", `${REPO}/blob/main/Makefile`],
                    ["docs/", `${REPO}/tree/main/docs`],
                  ] as const).map(([label, href]) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit text-[13px] leading-relaxed text-muted transition-colors hover:text-ink"
                    >
                      {label} <span aria-hidden className="text-faint">↗</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex flex-col">
                <span className="mb-1.5 text-[12.5px] font-semibold text-ink">Verify</span>
                <div className="flex flex-col gap-1">
                  {([
                    ["make test", `${REPO}#quickstart`],
                    ["make report", `${REPO}#what-the-demo-batch-shows`],
                    ["make run", `${REPO}#quickstart`],
                  ] as const).map(([label, href]) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit font-mono text-[11.5px] leading-relaxed text-muted transition-colors hover:text-ink"
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </nav>
          </div>
        </div>
      </footer>

      {/* the companion — every view, ⌘K away */}
      <ChatBot view={view} onNavigate={(v) => setView(v)} />
    </div>
  );
}
