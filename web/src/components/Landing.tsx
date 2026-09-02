import type { ReactNode } from "react";
import type { Batch } from "../types";
import { StreamCard } from "./LedgerStream";
import { CountUp, CopyChip, Reveal } from "./ui";

/**
 * Landing.tsx — the overview: what this is, what it does, where the proof
 * lives, and the one action that matters (open the board).
 *
 * The mid-page speaks one grammar: spec tables with hairlines, the way a
 * term sheet or an RFC does — no callout cards, no icon badges. Mono is
 * for machine strings only (ids, commands, test names, amounts).
 */

const REPO = "https://github.com/deeep1905/settleops";
const TESTS = `${REPO}/blob/main/tests/test_engine.py`;

const LOOP = [
  {
    n: "01",
    fn: "ingest()",
    t: "Ingest",
    d: "Two sources that should agree: the books ledger and the rail's settlement file. 66 rows each, integer paise.",
  },
  {
    n: "02",
    fn: "match()",
    t: "Match",
    d: "Deterministic arithmetic — keys, fees, net vs gross, currency, settle lag. No LLM in this path.",
  },
  {
    n: "03",
    fn: "diagnose()",
    t: "Diagnose",
    d: "Every break classified into a six-class taxonomy with severity and evidence from the records.",
  },
  {
    n: "04",
    fn: "remediate()",
    t: "Remediate",
    d: "One runbook per class, bounded by five stopping rules. Proposals and pages — never silent writes.",
  },
  {
    n: "05",
    fn: "postmortem()",
    t: "Postmortem",
    d: "Match rate, MTTR, the honest could-not-resolve list. The batch closes the way incidents do.",
  },
];

/* each rule carries the name of the test that enforces it and the line it
   lives on — real names from tests/test_engine.py; click through and grep */
const RULES: [string, string, string, string, string, number][] = [
  ["S1", "≥ ₹50,000 pages a human", "no exceptions, any break class", "a large silent write is the one you can't take back", "test_big_money_forced_to_human", 137],
  ["S2", "currency never auto-acts", "any FX risk, any amount", "wrong-FX write-backs are unrecoverable", "test_currency_never_auto_acted", 193],
  ["S3", "max 5 auto-resolves / batch", "the budget resets per batch", "runaway automation stops itself", "test_auto_budget_respected", 207],
  ["S4", "one auto-action / incident", "across the incident's whole life", "a rejection is never re-proposed", "test_s4_one_automated_action_per_incident", 214],
  ["S5", "proposals only", "every class, every amount", "no journal entry lands without an approval event", "test_proposals_need_approval_state", 234],
];

/* the division of labor — who touches what, stage by stage.
   filled = always in the path · ring = optional, off without a key · — = never */
type Mark = "yes" | "opt" | "no";
const LABOR: [string, [Mark, string], [Mark, string], [Mark, string]][] = [
  ["ingest", ["yes", "two sources, integer paise"], ["no", ""], ["no", ""]],
  ["match", ["yes", "arithmetic — no model in this path"], ["no", ""], ["no", ""]],
  ["diagnose", ["yes", "six-class taxonomy, evidence attached"], ["opt", "one root-cause hypothesis per break — labeled AI-suggested, always overridable"], ["no", ""]],
  ["remediate", ["yes", "bounded runbooks, proposals only"], ["no", ""], ["yes", "approve or reject — the only money gate"]],
  ["page", ["yes", "rule S1 fires above ₹50,000"], ["no", ""], ["yes", "the desk takes it from there"]],
  ["postmortem", ["yes", "the honest could-not-resolve list"], ["no", ""], ["no", ""]],
];

const PROOF: [string, string, string][] = [
  ["make test", "97 tests — matcher ground truth, stopping rules, API, audit chain, companion", "97 passed"],
  ["make report", "numbers regenerate from the data, bit-for-bit — CI fails on any hand-edit", "byte-identical"],
  ["make run", "the engine on :8000 — the same batch this page is showing", "live · batch R42"],
  ["make console", "this console, built from source", "this page"],
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
      <section className="grid-bg card mb-8 grid gap-8 px-7 py-12 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:gap-10">
        <div>
          <div className="rise inline-flex max-w-full items-center rounded-[4px] border border-line bg-surface px-3.5 py-1.5">
            <span className="kicker truncate text-muted">
              razorpay ai buildathon 2026 · track 4
              <span className="hidden md:inline"> · ai finance controller</span>
            </span>
          </div>
          <h1 style={{ animationDelay: "70ms" }} className="rise mt-5 max-w-[17ch] text-balance text-[clamp(34px,5.2vw,52px)] font-semibold leading-[1.05] tracking-[-0.027em]">
            Reconciliation is the SRE problem nobody gave an SRE.
          </h1>
          <p style={{ animationDelay: "140ms" }} className="rise mt-5 max-w-[58ch] text-[15.5px] leading-relaxed text-muted">
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
              className="rounded-[5px] bg-ink px-6 py-3 text-[14px] font-semibold text-paper shadow-[0_1px_2px_rgba(16,19,23,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(16,19,23,0.45)]"
            >
              Open the board →
            </button>
            <button
              onClick={onHow}
              className="rounded-[5px] border border-line2 bg-surface px-5 py-3 text-[14px] font-medium text-ink transition-all hover:-translate-y-0.5 hover:border-ink/25"
            >
              How it works
            </button>
          </div>
          {/* live stat row — the engine's own numbers, not marketing's */}
          <div style={{ animationDelay: "280ms" }} className="rise mt-7 flex flex-wrap items-center gap-y-4">
            {c ? (
              [
                ["rows in flight", <span key="r" className="tabular font-mono text-[18px] font-semibold leading-none text-ink">{c.books} ↔ {c.settlements}</span>],
                ["match rate", <CountUp key="m" value={batch!.match_rate} decimals={1} suffix="%" duration={900} className="font-mono text-[18px] font-semibold leading-none text-ink" />],
                ["incidents", <CountUp key="i" value={c.incidents} duration={900} className="font-mono text-[18px] font-semibold leading-none text-ink" />],
              ].map(([l, v], i) => (
                <div key={l as string} className={i > 0 ? "border-l border-line pl-5 pr-5 sm:pl-6" : "pr-5"}>
                  <div className="kicker text-faint">{l}</div>
                  <div className="mt-1">{v}</div>
                </div>
              ))
            ) : (
              <div className="kicker text-faint">starting the engine…</div>
            )}
          </div>
          <p style={{ animationDelay: "340ms" }} className="rise mt-5 text-[12.5px] text-faint">
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
        <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-5">
          {LOOP.map((s, i) => (
            <Reveal key={s.n} delay={i * 70} className="h-full">
              <div className="card lift group h-full px-6 py-6">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[12.5px] font-semibold text-accent">{s.n}</span>
                  <code className="rounded-[3px] bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent">
                    {s.fn}
                  </code>
                </div>
                <div className="mt-3.5 text-[16.5px] font-semibold">{s.t}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-2.5 text-[12.5px] text-faint">
            one code path — the same engine runs the console, the tests and{" "}
            <span className="font-mono">make report</span>
          </p>
        </Reveal>
      </section>

      {/* ------------------------------ stopping rules: the schedule ------------------------------ */}
      <section className="mb-8">
        <Reveal>
          <SectionHead
            kicker="bounded by construction"
            title="Five stopping rules"
            note={
              <a href={TESTS} target="_blank" rel="noreferrer"
                className="transition-colors hover:text-ink">
                each rule enforced by a dedicated test —{" "}
                <span className="font-mono">tests/test_engine.py</span> ↗
              </a>
            }
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-line bg-paper/60">
                    <th className="kicker px-5 py-3 pr-4 font-semibold text-faint">rule</th>
                    <th className="kicker px-3 py-3 font-semibold text-faint">the condition</th>
                    <th className="kicker px-3 py-3 font-semibold text-faint">why it exists</th>
                    <th className="kicker px-5 py-3 text-right font-semibold text-faint">enforced by</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map(([id, rule, qualifier, why, test, line], idx) => (
                    <tr
                      key={id}
                      style={{ animationDelay: `${idx * 45}ms` }}
                      className="row-in border-b border-line/70 transition-colors last:border-0 hover:bg-paper/50"
                    >
                      <td className="px-5 py-5 pr-4 font-mono text-[12.5px] font-semibold text-ink">{id}</td>
                      <td className="px-3 py-5">
                        <div className="text-[14px] font-medium text-ink">{rule}</div>
                        <div className="mt-0.5 text-[12.5px] text-muted">{qualifier}</div>
                      </td>
                      <td className="px-3 py-5 text-[13.5px] leading-relaxed text-muted">{why}</td>
                      <td className="px-5 py-5 text-right">
                        <a
                          href={`${TESTS}#L${line}`}
                          target="_blank"
                          rel="noreferrer"
                          title={`jump to ${test}()`}
                          className="font-mono text-[11.5px] text-accent transition-colors hover:underline"
                        >
                          {test}()
                        </a>
                        <div className="mt-0.5 text-[11px] text-faint">
                          tests/test_engine.py:{line}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3.5 text-[13px] leading-relaxed text-muted">
              An automation that can spend is an automation that can go wrong at 3 a.m.
              The difference between an agent and a liability is written down — and enforced
              by the suite, not by prose.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------ the division of labor ------------------------------ */}
      <section className="mb-8">
        <Reveal>
          <SectionHead
            kicker="the division of labor"
            title="Where the AI is — and where it isn't"
            note="one optional slot, labeled; everything else is code or a human"
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-line bg-paper/60">
                    <th className="kicker px-5 py-3 pr-4 font-semibold text-faint">stage</th>
                    <th className="kicker px-3 py-3 font-semibold text-faint">engine · deterministic</th>
                    <th className="kicker px-3 py-3 font-semibold text-faint">ai assist · optional</th>
                    <th className="kicker px-5 py-3 font-semibold text-faint">human</th>
                  </tr>
                </thead>
                <tbody>
                  {LABOR.map(([stage, engine, ai, human], idx) => (
                    <tr
                      key={stage}
                      style={{ animationDelay: `${idx * 45}ms` }}
                      className="row-in border-b border-line/70 last:border-0"
                    >
                      <td className="px-5 py-4 pr-4 font-mono text-[12.5px] font-semibold text-ink">{stage}</td>
                      <td className="px-3 py-4"><Cell mark={engine[0]}>{engine[1]}</Cell></td>
                      <td className="px-3 py-4"><Cell mark={ai[0]}>{ai[1]}</Cell></td>
                      <td className="px-5 py-4"><Cell mark={human[0]}>{human[1]}</Cell></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-3">
              <Legend mark="yes" label="always in the path" />
              <Legend mark="opt" label="optional — off without a key" />
              <Legend mark="no" label="never" />
            </div>
            <p className="border-t border-line px-5 py-3.5 text-[13px] leading-relaxed text-muted">
              The assist never writes, never matches, never decides — a hypothesis is a
              comment on the incident, and without a key it stays off entirely: the rules
              brain is the deterministic fallback. Every money decision is a human click,
              logged as a human event.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------ proof layer ------------------------------ */}
      <section className="mb-8">
        <Reveal>
          <SectionHead
            kicker="the proof layer"
            title="Every claim is a command"
            note="run them yourself — the repo is the demo"
          />
        </Reveal>
        <Reveal delay={80}>
          <div className="card overflow-hidden">
            {PROOF.map(([cmd, d, result]) => (
              <div
                key={cmd}
                className="group flex flex-col gap-1.5 border-b border-line/60 px-5 py-5 transition-colors last:border-0 hover:bg-paper/60 sm:flex-row sm:items-center sm:gap-4"
              >
                <CopyChip cmd={cmd} className="sm:w-[8.5rem] sm:justify-center" />
                <span className="text-[13.5px] leading-relaxed text-muted">{d}</span>
                <span className="shrink-0 text-[12px] font-medium text-faint sm:ml-auto">
                  {result}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={140}>
          <p className="mt-3.5 max-w-[72ch] text-[13px] leading-relaxed text-muted">
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

      {/* ------------------------------ cta band — the page opens on a grid card and closes on one ------------------------------ */}
      <Reveal>
        <section className="cta-band relative overflow-hidden rounded-md border border-line bg-surface px-7 py-11 sm:px-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-[52ch]">
              <div className="kicker text-accent">you are the desk</div>
              <h2 className="mt-3 text-balance text-[27px] font-semibold leading-[1.12] tracking-[-0.022em] text-ink">
                Twelve incidents are waiting. Two closed themselves. One pages you.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Approve a proposed adjustment, reject one, or let the SEV-1 sit — every
                decision lands on the incident's timeline as a human event. The audit trail
                is born in front of you.
              </p>
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-faint">
                <span className="rounded-[3px] border border-line bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-muted">⌘K</span>
                <span>anywhere — tally, the desk's companion, answers with the live batch (regex when no key, groq when there is one)</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button
                onClick={onOpen}
                className="rounded-[5px] bg-ink px-6 py-3 text-[14px] font-semibold text-paper shadow-[0_1px_2px_rgba(16,19,23,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(16,19,23,0.45)]"
              >
                Open the board →
              </button>
              <button
                onClick={onPm}
                className="rounded-[5px] border border-line2 bg-surface px-5 py-3 text-[14px] font-medium text-ink transition-all hover:-translate-y-0.5 hover:bg-paper"
              >
                Read the postmortem
              </button>
            </div>
          </div>
          {m && (
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
              {([
                ["match rate", <CountUp key="mr" value={m.match_rate} decimals={1} suffix="%" className="font-mono text-[24px] font-semibold leading-none text-ink" />],
                ["incidents", <CountUp key="inc" value={m.incidents_total} className="font-mono text-[24px] font-semibold leading-none text-ink" />],
                ["auto-resolved", <CountUp key="ar" value={m.auto_resolved} className="font-mono text-[24px] font-semibold leading-none text-ink" />],
                ["waiting on you", <CountUp key="ah" value={m.awaiting_human} className="font-mono text-[24px] font-semibold leading-none text-ink" />],
              ] as [string, ReactNode][]).map(([l, v]) => (
                <div key={l}>
                  <div>{v}</div>
                  <div className="kicker mt-2.5 text-faint">{l}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}

/* ------------------------------ matrix cell ------------------------------ */

function Cell({ mark, children }: { mark: Mark; children?: string }) {
  if (mark === "no" || !children) {
    return <span className="text-[13px] text-faint">—</span>;
  }
  return (
    <span className="flex items-start gap-2.5">
      {mark === "yes" ? (
        <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-ink" aria-hidden />
      ) : (
        <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-accent bg-accent-soft" aria-hidden />
      )}
      <span className="min-w-0 text-[13px] leading-relaxed text-muted">{children}</span>
    </span>
  );
}

function Legend({ mark, label }: { mark: Mark; label: string }) {
  return (
    <span className="flex items-center gap-2 text-[12px] text-faint">
      {mark === "yes" ? (
        <span className="h-2 w-2 rounded-full bg-ink" aria-hidden />
      ) : mark === "opt" ? (
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-accent" aria-hidden />
      ) : (
        <span className="text-[12.5px]" aria-hidden>—</span>
      )}
      {label}
    </span>
  );
}

/* ------------------------------ section head ------------------------------ */

function SectionHead({ kicker, title, note, compact }: {
  kicker: string; title: string; note?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-2" : "mb-4"}>
      <div className="kicker text-accent">{kicker}</div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={`font-semibold tracking-[-0.02em] ${compact ? "text-[17.5px]" : "text-[24.5px]"}`}>
          {title}
        </h2>
        {note && <span className="text-[12.5px] text-faint">{note}</span>}
      </div>
    </div>
  );
}

/* ------------------------------ scroll reveal ------------------------------ */
/* Reveal lives in ui.tsx — shared with the how-it-works view. */
