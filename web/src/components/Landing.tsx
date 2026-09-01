import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Batch } from "../types";
import { StreamCard } from "./LedgerStream";

/**
 * Landing.tsx — the overview: what this is, what it does, where the proof
 * lives, and the one action that matters (open the board). Same design
 * language as the console: light paper, surface cards, status colors,
 * mono for machine strings — the kicker voice everywhere a label appears.
 */

const LOOP = [
  {
    n: "1",
    fn: "ingest()",
    t: "Ingest",
    d: "Two sources that should agree: the books ledger and the rail's settlement file. 66 rows each, integer paise.",
  },
  {
    n: "2",
    fn: "match()",
    t: "Match",
    d: "Deterministic arithmetic — keys, fees, net vs gross, currency, settle lag. No LLM in this path.",
  },
  {
    n: "3",
    fn: "diagnose()",
    t: "Diagnose",
    d: "Every break classified into a six-class taxonomy with severity and evidence from the records.",
  },
  {
    n: "4",
    fn: "remediate()",
    t: "Remediate",
    d: "One runbook per class, bounded by five stopping rules. Proposals and pages — never silent writes.",
  },
  {
    n: "5",
    fn: "postmortem()",
    t: "Postmortem",
    d: "Match rate, MTTR, the honest could-not-resolve list. The batch closes the way incidents do.",
  },
];

/* each rule carries the name of the test that enforces it — real names,
   from tests/test_engine.py; grep them in the repo */
const RULES: [string, string, string, string][] = [
  ["S1", "≥ ₹50,000 pages a human", "no exceptions, any break class", "test_big_money_forced_to_human"],
  ["S2", "currency never auto-acts", "wrong-FX write-backs are unrecoverable", "test_currency_never_auto_acted"],
  ["S3", "max 5 auto-resolves / batch", "runaway automation stops itself", "test_auto_budget_respected"],
  ["S4", "one auto-action / incident", "a rejection is never re-proposed", "test_s4_one_automated_action_per_incident"],
  ["S5", "proposals only", "no journal entry lands without an approval event", "test_proposals_need_approval_state"],
];

const PROOF: [string, string][] = [
  ["make test", "68 passed — matcher ground truth, stopping rules, API, audit chain"],
  ["make report", "regenerated · bit-for-bit, hand-edits fail CI"],
  ["make run", "engine on :8000 — the batch this page is showing"],
  ["make console", "vite · this console, from source"],
];

export function Landing({ batch, brain, onOpen, onHow, onPm, onRun, busy }: {
  batch: Batch | null;
  brain: string;
  onOpen: () => void;
  onHow: () => void;
  onPm: () => void;
  onRun: () => void;
  busy: boolean;
}) {
  const m = batch?.metrics;
  const c = batch?.counts;

  return (
    <div>
      {/* ------------------------------ hero ------------------------------ */}
      <section className="grid-bg card mb-8 grid gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-10">
        <div>
          <div className="rise inline-flex max-w-full items-center gap-2.5 rounded-full border border-line bg-surface px-3 py-1.5">
            <span className="live-dot" aria-hidden />
            <span className="kicker truncate text-muted">
              razorpay ai buildathon 2026 · track 4
              <span className="hidden md:inline"> · ai finance controller</span>
            </span>
          </div>
          <h1 style={{ animationDelay: "70ms" }} className="rise mt-5 max-w-[16ch] text-balance text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.025em]">
            Reconciliation is the SRE problem nobody gave an SRE.
          </h1>
          <p style={{ animationDelay: "140ms" }} className="rise mt-5 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
            Finance teams close books by hand: eyeball the settlement file against the
            ledger, chase the differences in a spreadsheet, hope nothing slips. Ops teams
            solved this shape years ago. <span className="font-medium text-ink">SettleOps</span>{" "}
            runs that loop on a payment batch — match two sources deterministically,
            diagnose every break, run a bounded remediation runbook, page a human when
            the machine shouldn't decide, and write the postmortem.
          </p>
          <div style={{ animationDelay: "210ms" }} className="rise mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={onOpen}
              className="rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(16,19,23,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(16,19,23,0.45)]"
            >
              Open the board →
            </button>
            <button
              onClick={onHow}
              className="rounded-lg border border-line2 bg-surface px-4.5 py-2.5 text-[13.5px] font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-ink/25"
            >
              How it works
            </button>
          </div>
          {/* live stat row — the engine's own numbers, not marketing's */}
          <div style={{ animationDelay: "280ms" }} className="rise mt-7 flex flex-wrap items-center gap-y-4">
            {c ? (
              [
                ["rows in flight", `${c.books} ↔ ${c.settlements}`],
                ["match rate", `${batch!.match_rate}%`],
                ["incidents", `${c.incidents}`],
              ].map(([l, v], i) => (
                <div key={l} className={i > 0 ? "border-l border-line pl-5 pr-5 sm:pl-6" : "pr-5"}>
                  <div className="kicker text-faint">{l}</div>
                  <div className="tabular mt-1 font-mono text-[16px] font-semibold leading-none text-ink">{v}</div>
                </div>
              ))
            ) : (
              <div className="kicker text-faint">starting the engine…</div>
            )}
          </div>
          <p style={{ animationDelay: "340ms" }} className="rise mt-5 text-[12px] text-faint">
            nothing to sign up for · the batch is already running · every number on this
            page is live from the engine
          </p>
        </div>

        {/* the batch, in motion — the proof the product runs */}
        <StreamCard batch={batch} brain={brain} onRun={onRun} busy={busy} />
      </section>

      {/* ------------------------------ the loop ------------------------------ */}
      <section className="mb-8">
        <Reveal>
          <SectionHead
            kicker="the loop"
            title="Five steps, all deterministic, all auditable"
            note="the how-it-works view has the full detail"
          />
        </Reveal>
        <div className="relative grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {/* the spine — one pipeline, not five cards */}
          <div className="pointer-events-none absolute left-4 right-4 top-[14px] hidden h-px bg-line2 lg:block" aria-hidden />
          {LOOP.map((s, i) => (
            <Reveal key={s.n} delay={i * 70} className="h-full">
              <div className="card lift group relative h-full px-4 py-4">
                <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-line2 bg-surface font-mono text-[11px] font-semibold text-accent transition-colors group-hover:border-accent/50 group-hover:text-accent">
                  {s.n}
                </div>
                <div className="mt-3 text-[14px] font-semibold">{s.t}</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.d}</p>
                <code className="mt-3 inline-block rounded-[5px] bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent">
                  {s.fn}
                </code>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-2.5 text-[12px] text-faint">
            one code path — the same engine runs the console, the tests and{" "}
            <span className="font-mono">make report</span>
          </p>
        </Reveal>
      </section>

      {/* ------------------------------ stopping rules + ai placement ------------------------------ */}
      <section className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Reveal className="h-full">
          <div className="card h-full px-5 py-5">
            <SectionHead
              kicker="bounded by construction"
              title="Five stopping rules"
              note="each rule enforced by a dedicated test"
              compact
            />
            <div className="mt-2">
              {RULES.map(([id, rule, why, test]) => (
                <div
                  key={id}
                  className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 border-b border-line/60 py-3.5 last:border-0 last:pb-0 first:pt-1"
                >
                  <span className="rounded-[5px] bg-crit-soft px-1.5 py-px font-mono text-[11px] font-semibold text-crit">
                    {id}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-[13px] font-medium text-ink">{rule}</span>
                      <span className="hidden text-right text-[12px] text-faint lg:block">{why}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-ok/90">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
                        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <code className="truncate font-mono text-[10.5px]">{test}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3.5 border-t border-line pt-3.5 text-[12.5px] leading-relaxed text-muted">
              An automation that can spend is an automation that can go wrong at 3 a.m.
              The difference between an agent and a liability is written down — and enforced
              by the suite, not by prose.
            </p>
          </div>
        </Reveal>

        <Reveal delay={90} className="h-full">
          <div className="grid h-full gap-3">
            <div className="lift rounded-lg border border-ok/25 border-l-2 border-l-ok bg-ok-soft/60 px-5 py-4">
              <div className="kicker text-ok">where the ai is</div>
              <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink">
                <li>one root-cause hypothesis per unresolved break — labeled{" "}
                  <span className="chip bg-white text-muted">AI-suggested</span>, always overridable</li>
                <li>optional, off without a key; the rules brain is the deterministic fallback</li>
              </ul>
            </div>
            <div className="lift rounded-lg border border-crit/25 border-l-2 border-l-crit bg-crit-soft/60 px-5 py-4">
              <div className="kicker text-crit">where it isn't</div>
              <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink">
                <li>the matcher — matching is arithmetic, not language</li>
                <li>the runbooks and stopping rules — plain code</li>
                <li>every money decision — approve or reject is a human click, logged as a human event</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------ proof layer ------------------------------ */}
      <section className="mb-8">
        <Reveal>
          <SectionHead
            kicker="the proof layer"
            title="Every claim is a command"
            note="ci runs make verify on every push"
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="card overflow-hidden">
            {/* terminal chrome */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-line2" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-line2" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-line2" aria-hidden />
                <span className="kicker ml-2 truncate text-faint">settleops — the repo's own gate</span>
              </div>
              <span className="hidden font-mono text-[10.5px] text-faint sm:block">
                exit 0, or it doesn't ship
              </span>
            </div>
            {/* terminal body — the commands, and what they prove */}
            <div className="term-body px-4 py-4 sm:px-5">
              {PROOF.map(([cmd, out]) => (
                <div key={cmd} className="flex flex-wrap items-baseline gap-x-2 py-0.5">
                  <span className="select-none text-[#6e7681]">$</span>
                  <span className="font-semibold text-[#e6edf3]">{cmd}</span>
                  <span className="mx-1 hidden h-px min-w-4 flex-1 self-center border-b border-dashed border-[#21262d] sm:block" aria-hidden />
                  <span className="text-[#3fb950]">{out}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 py-0.5">
                <span className="select-none text-[#6e7681]">$</span>
                <span className="caret inline-block h-3.5 w-[7px] bg-[#58a6ff]" aria-hidden />
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-3.5 text-[12.5px] leading-relaxed text-muted">
            {m ? (
              <>
                the seed plants exactly {batch!.counts.incidents} breaks across six classes — the tests
                assert the matcher finds exactly those, no more, no less. The match rate is{" "}
                <span className="tabular font-medium text-ink">{batch!.match_rate}%</span> because the
                data says so, not because a demo wanted it to.
              </>
            ) : (
              <>ground truth is planted by the generator and asserted by the suite.</>
            )}
          </p>
        </Reveal>
      </section>

      {/* ------------------------------ cta band ------------------------------ */}
      <Reveal>
        <section className="grid-bg-dark relative overflow-hidden rounded-xl border border-ink bg-ink px-6 py-9 text-white sm:px-9">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-[52ch]">
              <div className="kicker text-white/50">you are the desk</div>
              <h2 className="mt-2.5 text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">
                Twelve incidents are waiting. Two closed themselves. One pages you.
              </h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/70">
                Approve a proposed adjustment, reject one, or let the SEV-1 sit — every
                decision lands on the incident's timeline as a human event. The audit trail
                is born in front of you.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button
                onClick={onOpen}
                className="rounded-lg bg-white px-5 py-2.5 text-[13.5px] font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]"
              >
                Open the board →
              </button>
              <button
                onClick={onPm}
                className="rounded-lg border border-white/25 px-4.5 py-2.5 text-[13.5px] font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/10"
              >
                Read the postmortem
              </button>
            </div>
          </div>
          {m && (
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-4">
              {([
                ["match rate", `${m.match_rate}%`],
                ["incidents", `${m.incidents_total}`],
                ["auto-resolved", `${m.auto_resolved}`],
                ["waiting on you", `${m.awaiting_human}`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l}>
                  <div className="tabular font-mono text-[22px] font-semibold leading-none text-white">{v}</div>
                  <div className="kicker mt-2 text-white/45">{l}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}

/* ------------------------------ section head ------------------------------ */

function SectionHead({ kicker, title, note, compact }: {
  kicker: string; title: string; note?: string; compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-2" : "mb-4"}>
      <div className="kicker text-accent">{kicker}</div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={`font-semibold tracking-[-0.02em] ${compact ? "text-[16px]" : "text-[22px]"}`}>
          {title}
        </h2>
        {note && <span className="font-mono text-[10.5px] text-faint">{note}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ scroll reveal ------------------------------ */

/**
 * Reveal — sections compose themselves as they enter the viewport.
 * One observer per element, disconnected on first hit; reduced-motion
 * and no-JS both degrade to visible content.
 */
function Reveal({ children, className = "", delay = 0 }: {
  children: ReactNode; className?: string; delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
