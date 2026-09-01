import type { Batch } from "../types";

/**
 * Landing.tsx — the overview: what this is, what it does, where the proof
 * lives, and the one action that matters (open the board). Same design
 * language as the console: light paper, surface cards, status colors,
 * mono for machine strings.
 */

const LOOP = [
  {
    n: "01",
    t: "Ingest",
    d: "Two sources that should agree: the books ledger and the rail's settlement file. 66 rows each, integer paise.",
  },
  {
    n: "02",
    t: "Match",
    d: "Deterministic arithmetic — keys, fees, net vs gross, currency, settle lag. No LLM in this path.",
  },
  {
    n: "03",
    t: "Diagnose",
    d: "Every break classified into a six-class taxonomy with severity and evidence from the records.",
  },
  {
    n: "04",
    t: "Remediate",
    d: "One runbook per class, bounded by five stopping rules. Proposals and pages — never silent writes.",
  },
  {
    n: "05",
    t: "Postmortem",
    d: "Match rate, MTTR, the honest could-not-resolve list. The batch closes the way incidents do.",
  },
];

const RULES: [string, string, string][] = [
  ["S1", "≥ ₹50,000 pages a human", "no exceptions, any break class"],
  ["S2", "currency never auto-acts", "wrong-FX write-backs are unrecoverable"],
  ["S3", "max 5 auto-resolves / batch", "runaway automation stops itself"],
  ["S4", "one auto-action / incident", "a rejection is never re-proposed"],
  ["S5", "proposals only", "no journal entry lands without an approval event"],
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

  return (
    <div>
      {/* ------------------------------ hero ------------------------------ */}
      <section className="grid-bg card mb-8 grid gap-8 px-6 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            razorpay ai buildathon 2026 · track 4 · ai finance controller
          </div>
          <h1 className="mt-4 max-w-[16ch] text-balance text-[clamp(30px,5vw,44px)] font-semibold leading-[1.08] tracking-[-0.025em]">
            Reconciliation is the SRE problem nobody gave an SRE.
          </h1>
          <p className="mt-5 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
            Finance teams close books by hand: eyeball the settlement file against the
            ledger, chase the differences in a spreadsheet, hope nothing slips. Ops teams
            solved this shape years ago. <span className="font-medium text-ink">SettleOps</span>{" "}
            runs that loop on a payment batch — match two sources deterministically,
            diagnose every break, run a bounded remediation runbook, page a human when
            the machine shouldn't decide, and write the postmortem.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={onOpen}
              className="rounded-md bg-ink px-4.5 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-85"
            >
              Open the board →
            </button>
            <button
              onClick={onHow}
              className="rounded-md border border-line2 bg-surface px-4 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-paper"
            >
              How it works
            </button>
          </div>
          <p className="mt-4 text-[12px] text-faint">
            nothing to sign up for · the batch is already running · every number on this
            page is live from the engine
          </p>
        </div>

        {/* live batch state — the proof the product runs */}
        <LiveCard batch={batch} brain={brain} onRun={onRun} busy={busy} />
      </section>

      {/* ------------------------------ the loop ------------------------------ */}
      <section className="mb-8">
        <SectionHead
          kicker="the loop"
          title="Six steps, all deterministic, all auditable"
          note="the how-it-works view has the full detail"
        />
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {LOOP.map((s, i) => (
            <div key={s.n} className="card relative px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-accent">{s.n}</span>
                {i < LOOP.length - 1 && (
                  <span className="hidden text-[14px] text-line2 lg:block">›</span>
                )}
              </div>
              <div className="mt-2 text-[14px] font-semibold">{s.t}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-faint">
          one code path — the same engine runs the console, the tests and{" "}
          <span className="font-mono">make report</span>
        </p>
      </section>

      {/* ------------------------------ stopping rules + ai placement ------------------------------ */}
      <section className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="card px-5 py-5">
          <SectionHead
            kicker="bounded by construction"
            title="Five stopping rules"
            note="each rule has a dedicated test"
            compact
          />
          <div className="mt-1 space-y-2">
            {RULES.map(([id, rule, why]) => (
              <div key={id} className="flex items-baseline gap-3">
                <span className="w-7 shrink-0 font-mono text-[12px] font-semibold text-crit">{id}</span>
                <span className="text-[13px] font-medium text-ink">{rule}</span>
                <span className="ml-auto hidden text-right text-[12px] text-faint sm:block">{why}</span>
              </div>
            ))}
          </div>
          <p className="mt-3.5 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
            An automation that can spend is an automation that can go wrong at 3 a.m.
            The difference between an agent and a liability is written down — and enforced
            by the suite, not by prose.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-ok/25 bg-ok-soft/60 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ok">
              where the ai is
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink">
              <li>one root-cause hypothesis per unresolved break — labeled{" "}
                <span className="chip bg-white text-muted">AI-suggested</span>, always overridable</li>
              <li>optional, off without a key; the rules brain is the deterministic fallback</li>
            </ul>
          </div>
          <div className="rounded-lg border border-crit/25 bg-crit-soft/60 px-5 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-crit">
              where it isn't
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink">
              <li>the matcher — matching is arithmetic, not language</li>
              <li>the runbooks and stopping rules — plain code</li>
              <li>every money decision — approve or reject is a human click, logged as a human event</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------ proof strip ------------------------------ */}
      <section className="card mb-8 px-5 py-5">
        <SectionHead
          kicker="the proof layer"
          title="Every claim is a command"
          compact
        />
        <div className="mt-2 grid gap-2.5 md:grid-cols-2">
          {[
            ["make test", "68 tests — matcher ground truth, stopping rules, API, audit chain"],
            ["make report", "numbers regenerate bit-for-bit; CI fails on any hand-edit"],
            ["make run", "the engine on :8000 — same batch the console is showing"],
            ["make console", "this console, from source"],
          ].map(([cmd, d]) => (
            <div key={cmd} className="flex items-baseline gap-3">
              <code className="shrink-0 rounded-md bg-paper px-2 py-1 font-mono text-[12px] font-medium text-ink">
                {cmd}
              </code>
              <span className="text-[12.5px] leading-relaxed text-muted">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-3.5 border-t border-line pt-3 text-[12.5px] text-muted">
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
      </section>

      {/* ------------------------------ cta band ------------------------------ */}
      <section className="grid gap-4 rounded-lg border border-line bg-ink px-6 py-8 text-white sm:px-8">
        <div className="max-w-[52ch]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
            you are the desk
          </div>
          <h2 className="mt-2 text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">
            Twelve incidents are waiting. Two closed themselves. One pages you.
          </h2>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/70">
            Approve a proposed adjustment, reject one, or let the SEV-1 sit — every
            decision lands on the incident's timeline as a human event. The audit trail
            is born in front of you.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onOpen}
            className="rounded-md bg-white px-4.5 py-2.5 text-[13.5px] font-semibold text-ink transition-opacity hover:opacity-85"
          >
            Open the board →
          </button>
          <button
            onClick={onPm}
            className="rounded-md border border-white/25 px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-white/10"
          >
            Read the postmortem
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ live batch card ------------------------------ */

function LiveCard({ batch, brain, onRun, busy }: {
  batch: Batch | null; brain: string; onRun: () => void; busy: boolean;
}) {
  const rows: [string, string][] = batch
    ? [
        ["books", `${batch.counts.books} rows`],
        ["settlements", `${batch.counts.settlements} rows`],
        ["matched", `${batch.counts.matched} · ${batch.match_rate}%`],
        ["incidents", `${batch.metrics.incidents_total} · ${batch.metrics.sev1} SEV-1`],
        ["auto-resolved", `${batch.metrics.auto_resolved} · S3 budget`],
        ["awaiting human", `${batch.metrics.awaiting_human}`],
        ["paged", `${batch.metrics.paged} · S1 / S2`],
        ["MTTR (auto)", `${batch.metrics.mttr_hours_auto ?? "—"}h`],
      ]
    : [];

  return (
    <aside className="card flex flex-col self-start p-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" aria-hidden />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            live batch state
          </span>
        </div>
        <span className="font-mono text-[11px] text-faint">
          {batch ? `${batch.batch_id} · seed ${batch.seed}` : "booting"}
        </span>
      </div>

      <div className="flex-1 px-4 py-3">
        {batch ? (
          <dl className="space-y-2 font-mono text-[12.5px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="text-faint">{k}</dt>
                <dd className="tabular text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="py-8 text-center font-mono text-[12px] text-faint">
            starting the engine…
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="font-mono text-[11px] text-faint">
          brain: {brain} · regenerates bit-for-bit
        </span>
        <button
          onClick={onRun}
          disabled={busy || !batch}
          className="rounded-md border border-line2 bg-surface px-2.5 py-1 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-40"
        >
          {busy ? "running…" : "re-run"}
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------ section head ------------------------------ */

function SectionHead({ kicker, title, note, compact }: {
  kicker: string; title: string; note?: string; compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-1" : "mb-4"}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{kicker}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`font-semibold tracking-[-0.02em] ${compact ? "text-[16px]" : "text-[22px]"}`}>
          {title}
        </h2>
        {note && <span className="text-[12px] text-faint">{note}</span>}
      </div>
    </div>
  );
}
