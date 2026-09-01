import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { postJSON, getJSON } from "../lib";

/**
 * ChatBot.tsx — Tally, the desk's companion.
 *
 * A page-aware chat presence with two brains (the engine decides which):
 *   · slash commands — answered from live batch data, zero tokens
 *   · free-form — groq when a key exists, a regex brain when it doesn't
 * The mascot is deliberate: the amber diamond on the antenna is the
 * break marker from the logo — Tally wears the one thing the console
 * watches for. ⌘K toggles, esc closes, the broom resets.
 */

type View = "home" | "board" | "incident" | "postmortem" | "how";
type NavView = "home" | "board" | "postmortem" | "how";

interface Msg {
  role: "user" | "bot";
  text: string;
  mode?: "command" | "llm" | "regex";
  model?: string | null;
  action?: { label: string; view: NavView } | null;
}

interface ChatStatus {
  llm: boolean;
  provider: string;
  model: string | null;
  commands: string[];
}

const PAGE_LABEL: Record<View, string> = {
  home: "overview",
  board: "board",
  incident: "incident",
  postmortem: "postmortem",
  how: "how it works",
};

const CHIPS: Record<View, string[]> = {
  home: ["what is settleops?", "why five stopping rules?", "/status"],
  board: ["what's the biggest break?", "what's waiting on me?", "/status"],
  incident: ["what am I looking at?", "can you move money?", "/help"],
  postmortem: ["summarize this page", "/pm", "what's the match rate?"],
  how: ["explain the loop", "why is S1 a hard gate?", "/help"],
};

/* ------------------------------------------------------------------ face */

function TallyMark({ size = 28, cheeks = false, className = "" }: {
  size?: number; cheeks?: boolean; className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      {/* antenna — the amber diamond is the break marker from the logo */}
      <line x1="16" y1="10.5" x2="16" y2="6" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 2.4l2.6 2.9L16 8.2l-2.6-2.9Z" fill="#FFB224" />
      {/* head */}
      <rect x="4" y="9.5" width="24" height="18" rx="6"
        fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.6" />
      {/* eyes — they blink */}
      <circle className="tally-eye" cx="12" cy="17.5" r="2.1" fill="var(--color-ink)" />
      <circle className="tally-eye" cx="20" cy="17.5" r="2.1" fill="var(--color-ink)" />
      {/* the smile */}
      <path d="M12.6 21.8q3.4 2.6 6.8 0" fill="none" stroke="var(--color-ink)"
        strokeWidth="1.5" strokeLinecap="round" />
      {cheeks && (
        <>
          <circle cx="9" cy="20.5" r="1.1" fill="#FFB224" opacity="0.75" />
          <circle cx="23" cy="20.5" r="1.1" fill="#FFB224" opacity="0.75" />
        </>
      )}
    </svg>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-1.5 py-1.5" aria-label="tally is thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="tally-dot size-1.5 rounded-full bg-faint" />
      ))}
    </div>
  );
}

const SOURCE: Record<string, string> = {
  command: "engine · 0 tokens",
  llm: "groq · live",
  regex: "regex · 0 tokens",
};

/* ------------------------------------------------------------------ body */

export function ChatBot({ view, onNavigate }: {
  view: View;
  onNavigate: (v: NavView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /* the engine says which brain is on — quietly, once */
  useEffect(() => {
    getJSON<ChatStatus>("/api/chat/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  /* ⌘K / ctrl-K toggles, esc closes */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* first open starts with a hello from tally */
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{
        role: "bot",
        text: `hey — i'm tally, the desk's companion.\ni can see you're on the ${PAGE_LABEL[view]} view, and every number i quote is live from the engine.\ntry /status, ask about the loop, or tap a chip below.`,
      }]);
    }
    if (open) field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* new messages keep the bottom in view */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  const reset = () => {
    setMsgs([{
      role: "bot",
      text: `clean slate.\ni'm still reading the ${PAGE_LABEL[view]} view — ask me anything, or /help for what i know cold.`,
    }]);
    setInput("");
    field.current?.focus();
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    if (q.toLowerCase() === "/reset") { reset(); return; }

    const user: Msg = { role: "user", text: q };
    /* the server trims to the last 6 turns — the client just tells the story */
    const history = [...msgs, user].map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.text,
    }));
    setMsgs((ms) => [...ms, user]);
    setInput("");
    setBusy(true);
    try {
      const d = await postJSON<{
        reply: string; mode: "command" | "llm" | "regex";
        model: string | null; action: { label: string; view: NavView } | null;
      }>("/api/chat", { messages: history, page: view });
      setMsgs((ms) => [...ms, {
        role: "bot", text: d.reply, mode: d.mode, model: d.model, action: d.action,
      }]);
    } catch {
      setMsgs((ms) => [...ms, {
        role: "bot",
        text: "the engine isn't answering — run make run and try again. i'll be here.",
      }]);
    } finally {
      setBusy(false);
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      {/* ---------------- the companion, resting ---------------- */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "close tally" : "ask tally"}
        title={open ? "close (esc)" : "ask tally — ⌘K"}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex size-14 items-center justify-center rounded-[10px] border border-line2 bg-surface shadow-[0_6px_24px_-8px_rgba(16,19,23,0.35)] transition-transform hover:-translate-y-0.5"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden className="text-muted">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <>
            <TallyMark size={34} cheeks />
            <span
              aria-hidden
              className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface ${
                status?.llm ? "bg-ok" : "bg-faint"
              }`}
            />
          </>
        )}
      </button>

      {/* ---------------- the desk it opens ---------------- */}
      {open && (
        <div
          role="dialog"
          aria-label="tally — the companion"
          className="menu-in fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-[min(68vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-[6px] border border-line bg-surface shadow-[0_24px_64px_-20px_rgba(16,19,23,0.45)]"
        >
          {/* header — who, where, which brain, and the broom */}
          <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
            <TallyMark size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-tight">Tally</div>
              <div className="truncate text-[10.5px] text-faint">
                reading · {PAGE_LABEL[view]}
              </div>
            </div>
            <span
              className="chip shrink-0 border border-line bg-paper text-[10px] text-faint"
              title={status?.llm ? `${status.provider} · ${status.model}` : "no key — the deterministic brain answers"}
            >
              <span className={`size-1.5 rounded-full ${status?.llm ? "bg-ok" : "bg-faint"}`} aria-hidden />
              {status?.llm ? "groq · live" : "offline smarts"}
            </span>
            <button
              type="button"
              onClick={reset}
              aria-label="reset conversation"
              title="reset conversation"
              className="flex size-7 shrink-0 items-center justify-center rounded-[4px] text-faint transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M13.7 1.8v3.4h-3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* the conversation */}
          <div ref={scroller} role="log" aria-live="polite"
            className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-4">
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-[5px] bg-ink px-3 py-2 text-[12.5px] leading-relaxed text-paper">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-2.5">
                  <TallyMark size={22} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                      {m.text}
                    </div>
                    {m.action && (
                      <button
                        type="button"
                        onClick={() => onNavigate(m.action!.view)}
                        className="mt-2 rounded-[4px] border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:border-accent/60"
                      >
                        {m.action.label} →
                      </button>
                    )}
                    {m.mode && (
                      <div className="mt-1.5 font-mono text-[9.5px] tracking-wide text-faint">
                        {m.mode === "llm" && m.model ? `groq · ${m.model}` : SOURCE[m.mode]}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex gap-2.5">
                <TallyMark size={22} className="mt-0.5" />
                <Typing />
              </div>
            )}
          </div>

          {/* quick asks — the demo's script, page by page */}
          <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
            {CHIPS[view].map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => void send(c)}
                className="rounded-[4px] border border-line bg-paper px-2 py-1 text-[11px] text-muted transition-colors hover:border-line2 hover:text-ink disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>

          {/* the ask line */}
          <div className="flex items-center gap-2 border-t border-line p-2.5">
            <input
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="ask tally — /help for commands"
              aria-label="ask tally"
              className="min-w-0 flex-1 rounded-[5px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={busy || !input.trim()}
              aria-label="send"
              className="flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-ink text-paper transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2.5 8h10M9 4.5L12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
