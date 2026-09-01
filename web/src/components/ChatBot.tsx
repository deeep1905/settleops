import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { postJSON, getJSON } from "../lib";

/**
 * ChatBot.tsx — Tally, the desk's companion.
 *
 * A round little presence you can pick up and put anywhere on the desk:
 *   · the ball drags (pointer events, clamped to the viewport, position
 *     remembered in localStorage) and the desk it opens follows it —
 *     above when there's room, below when there isn't, tail always
 *     pointing home
 *   · the face is alive — pupils that track the pointer, a blink on a
 *     slow clock, moods for the moments that matter (thinking while
 *     the engine answers, a boing when it lands, wide eyes in hand)
 *   · two brains, decided by the engine: slash commands answer from
 *     live batch data (zero tokens), free-form goes to groq when a key
 *     exists and to a regex brain when it doesn't
 * Page-aware throughout: Tally reads the view it's floating over and
 * answers in its context. The amber diamond on the antenna is the break
 * marker from the logo — Tally wears the one thing the console watches
 * for, and it pulses while she thinks. ⌘K toggles, esc closes, the
 * broom resets.
 */

type View = "home" | "board" | "incident" | "postmortem" | "how";
type NavView = "home" | "board" | "postmortem" | "how";
type Mood = "idle" | "think" | "happy" | "drag" | "sad";

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

/* --------------------------------------------------------- the placement */

const ORB = 64;                       // the ball's box, px
const EDGE = 10;                      // how close to the glass it may sit
const POS_KEY = "settleops.tally.pos";

type Pos = { x: number; y: number };

function clampPos(p: Pos): Pos {
  const w = window.innerWidth, h = window.innerHeight;
  return {
    x: Math.min(Math.max(EDGE, p.x), Math.max(EDGE, w - ORB - EDGE)),
    y: Math.min(Math.max(EDGE, p.y), Math.max(EDGE, h - ORB - EDGE)),
  };
}

/* the default seat: the corner every console keeps free */
function defaultPos(): Pos {
  return clampPos({ x: window.innerWidth - ORB - 20, y: window.innerHeight - ORB - 20 });
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (typeof p.x === "number" && typeof p.y === "number") return clampPos(p);
    }
  } catch { /* a fresh desk, then */ }
  return defaultPos();
}

function savePos(p: Pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ face */

function TallyFace({ size = 64, mood = "idle", gaze, className = "" }: {
  size?: number; mood?: Mood; gaze?: { x: number; y: number }; className?: string;
}) {
  const happy = mood === "happy";
  const think = mood === "think";
  const wide = mood === "drag";
  const sad = mood === "sad";

  /* where the pupils sit — tracking the pointer when idle, pinned when
     the mood says otherwise (up-right while thinking, down at the hand
     while being carried, down while apologizing) */
  const p = happy ? { x: 0, y: 0 }
    : think ? { x: 1.4, y: -1.7 }
    : wide ? { x: 0, y: 1.3 }
    : sad ? { x: 0, y: 1.5 }
    : gaze ?? { x: 0, y: 0 };

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      {/* antenna — the amber diamond is the break marker from the logo;
          it leans with the ball and pulses while she thinks */}
      <g className="tally-antenna" data-think={think}>
        <line x1="32" y1="24" x2="32" y2="13.5" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
        <path className={think ? "tally-signal" : undefined} d="M32 5.5l4.4 5.2L32 16l-4.4-5.3Z" fill="#FFB224" />
      </g>

      {/* the head — properly round, the one shape a companion should be */}
      <circle cx="32" cy="38" r="22" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
      {/* a quiet highlight so the ball reads as a ball */}
      <ellipse cx="24" cy="28" rx="7" ry="4" fill="#fff" opacity="0.32" transform="rotate(-20 24 28)" />

      {/* cheeks — amber, faint; fuller when she's pleased */}
      {!sad && !wide && (
        <>
          <circle cx="20.5" cy="43" r="2.7" fill="#FFB224" opacity={happy ? 0.85 : 0.5} />
          <circle cx="43.5" cy="43" r="2.7" fill="#FFB224" opacity={happy ? 0.85 : 0.5} />
        </>
      )}

      {/* the eyes */}
      {happy ? (
        /* the squint of a good answer — two arcs */
        <>
          <path d="M20.5 37.5q4-5.6 8 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M35.5 37.5q4-5.6 8 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
        </>
      ) : wide ? (
        /* wide — the "where are we going" of being carried */
        <>
          <circle cx="24.5" cy="36.5" r="5.7" fill="#fff" stroke="var(--color-ink)" strokeWidth="1.5" />
          <circle cx="39.5" cy="36.5" r="5.7" fill="#fff" stroke="var(--color-ink)" strokeWidth="1.5" />
          <circle cx="24.5" cy="37.7" r="2.5" fill="var(--color-ink)" />
          <circle cx="39.5" cy="37.7" r="2.5" fill="var(--color-ink)" />
        </>
      ) : (
        /* the default — big dark eyes that follow the pointer, and blink */
        <>
          <g className="tally-eye">
            <g className="tally-pupil" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
              <circle cx="24.5" cy="36.5" r="3.7" fill="var(--color-ink)" />
              <circle cx="25.8" cy="35.2" r="1.05" fill="#fff" opacity="0.9" />
            </g>
          </g>
          <g className="tally-eye tally-eye-r">
            <g className="tally-pupil" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
              <circle cx="39.5" cy="36.5" r="3.7" fill="var(--color-ink)" />
              <circle cx="40.8" cy="35.2" r="1.05" fill="#fff" opacity="0.9" />
            </g>
          </g>
        </>
      )}

      {/* the mouth */}
      {happy ? (
        <path d="M26 43.5q6 8.2 12 0Z" fill="var(--color-ink)" />
      ) : wide ? (
        <circle cx="32" cy="46.5" r="3" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
      ) : sad ? (
        <path d="M27 48q5-4.4 10 0" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      ) : think ? (
        <path d="M28.5 46.5h7" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M26 44q6 5.2 12 0" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
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
  const [mood, setMood] = useState<Mood>("idle");
  const [pos, setPos] = useState<Pos>(() => loadPos());
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState(true);

  const orb = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const moodTimer = useRef<number | undefined>(undefined);
  const gazeNext = useRef({ x: 0, y: 0, has: false });

  /* a mood that holds for a beat, then settles back to idle */
  const feel = (m: Mood, hold = 1600) => {
    setMood(m);
    window.clearTimeout(moodTimer.current);
    if (m !== "idle" && m !== "think") {
      moodTimer.current = window.setTimeout(() => setMood("idle"), hold);
    }
  };

  /* the eyes follow the pointer — rAF-throttled so it stays cheap */
  useEffect(() => {
    let raf = 0;
    const onMove = (e: globalThis.PointerEvent) => {
      const r = orb.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d < 28) { gazeNext.current = { x: 0, y: 0, has: true }; }
      else {
        const pull = Math.min(1, (d - 28) / 150);
        gazeNext.current = { x: (dx / d) * 2.1 * pull, y: (dy / d) * 2.1 * pull, has: true };
      }
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (gazeNext.current.has) {
          setGaze({ x: gazeNext.current.x, y: gazeNext.current.y });
          gazeNext.current.has = false;
        }
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  /* the desk resizes — the companion stays on it */
  useEffect(() => {
    const onResize = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      setPos((p) => clampPos(p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* the invitation fades after a while; the first pickup retires it */
  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 7500);
    return () => window.clearTimeout(t);
  }, []);

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
        text: `hey — i'm tally, the desk's companion.\ni can see you're on the ${PAGE_LABEL[view]} view, and every number i quote is live from the engine.\npick me up and put me wherever i'm useful — then /status, or tap a chip below.`,
      }]);
      feel("happy", 1200);
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
    feel("happy", 900);
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
    feel("think");
    try {
      const d = await postJSON<{
        reply: string; mode: "command" | "llm" | "regex";
        model: string | null; action: { label: string; view: NavView } | null;
      }>("/api/chat", { messages: history, page: view });
      setMsgs((ms) => [...ms, {
        role: "bot", text: d.reply, mode: d.mode, model: d.model, action: d.action,
      }]);
      feel("happy");
    } catch {
      setMsgs((ms) => [...ms, {
        role: "bot",
        text: "the engine isn't answering — run make run and try again. i'll be here.",
      }]);
      feel("sad", 2600);
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

  /* -------------------------------------------- picking tally up & moving */

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    orb.current?.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true;
      setHint(false);
      window.clearTimeout(moodTimer.current);
      setMood("drag");
    }
    if (d.moved) setPos(clampPos({ x: d.ox + dx, y: d.oy + dy }));
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    try { orb.current?.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (!d) return;
    if (d.moved) {
      suppress.current = true;         // the click that follows a drag is not a toggle
      savePos(pos);
      setMood("idle");
    }
  };

  const onOrbClick = () => {
    if (suppress.current) { suppress.current = false; return; }
    setOpen((o) => !o);
  };

  /* ------------------------------------------- the desk, anchored to tally */

  const PW = Math.min(vp.w * 0.92, 380);
  const PH = Math.min(vp.h * 0.68, 520);
  const orbCX = pos.x + ORB / 2;
  const orbTop = pos.y;
  const orbBottom = pos.y + ORB;

  /* her desk prefers the air above her; below when the air runs out.
     When neither side fits the full desk — mid-screen on a short page —
     it shrinks into the roomier side rather than leave the glass. */
  const roomAbove = orbTop - 16 - EDGE;
  const roomBelow = vp.h - EDGE - (orbBottom + 16);
  let panelH = PH;
  let py: number;
  if (PH <= roomAbove) {
    py = orbTop - PH - 16;
  } else if (PH <= roomBelow) {
    py = orbBottom + 16;
  } else {
    const side = Math.max(roomAbove, roomBelow);
    panelH = Math.max(320, Math.min(PH, side));
    py = roomAbove >= roomBelow
      ? Math.max(EDGE, orbTop - panelH - 16)
      : Math.min(vp.h - EDGE - panelH, orbBottom + 16);
  }

  const px = Math.min(Math.max(EDGE, orbCX - PW / 2), Math.max(EDGE, vp.w - PW - EDGE));
  const tailX = Math.min(Math.max(px + 26, orbCX), px + PW - 26);

  /* the tail points home — the panel's top edge when she hovers above
     the desk, its bottom edge when she sits under it; and none at all
     when she perches on it (the classic widget stance) */
  const onPanel = pos.x < px + PW && pos.x + ORB > px && orbTop < py + panelH && orbBottom > py;
  const tailTop = !onPanel && orbBottom <= py + 20;
  const tailBottom = !onPanel && orbTop >= py + panelH - 20;

  return (
    <>
      {/* ---------------- the companion, wherever you put her ---------------- */}
      <div className="fixed z-50" style={{ top: pos.y, left: pos.x }}>
        {hint && !open && mood !== "drag" && (
          <div
            aria-hidden
            className={`pop pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[10.5px] font-medium text-muted shadow-[0_4px_12px_-4px_rgba(16,19,23,0.25)] ${
              pos.y < 64 ? "-bottom-8" : "-top-8"
            }`}
          >
            drag me anywhere · tap to chat
          </div>
        )}
        <button
          ref={orb}
          type="button"
          onClick={onOrbClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={open ? "close tally" : "ask tally — drag to move"}
          title={open ? "close (esc)" : "tally — drag me anywhere, tap to chat · ⌘K"}
          data-drag={mood === "drag"}
          className={`tally-orb relative flex size-16 cursor-grab touch-none select-none items-center justify-center rounded-full transition-transform duration-200 active:cursor-grabbing ${
            mood === "drag" ? "scale-[1.08]" : ""
          }`}
        >
          <span
            key={mood === "happy" ? "boing" : "bob"}
            className={mood === "happy" ? "tally-boing" : "tally-bob"}
            data-paused={mood === "drag"}
          >
            <TallyFace size={64} mood={mood} gaze={gaze} />
          </span>
          {!open && (
            <span
              aria-hidden
              className={`absolute bottom-1 right-1 size-3 rounded-full border-2 border-surface ${
                status?.llm ? "bg-ok" : "bg-faint"
              }`}
            />
          )}
        </button>
      </div>

      {/* ---------------- the desk it opens, tail pointing home ---------------- */}
      {open && (
        <div
          role="dialog"
          aria-label="tally — the companion"
          style={{ top: py, left: px, width: PW, height: panelH }}
          className="menu-in fixed z-40 flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_24px_64px_-20px_rgba(16,19,23,0.45)]"
        >
          {/* the tail — a small diamond that keeps the desk attached to the ball */}
          {(tailTop || tailBottom) && (
            <span
              aria-hidden
              className={`absolute size-3 rotate-45 bg-surface ${
                tailTop ? "-top-1.5 border-l border-t border-line" : "-bottom-1.5 border-r border-b border-line"
              }`}
              style={{ left: tailX - px - 6 }}
            />
          )}

          {/* header — who, where, which brain, and the broom */}
          <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
            <TallyFace size={30} mood={mood} gaze={gaze} className="mt-0.5" />
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
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-paper hover:text-ink"
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
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-[12px] rounded-br-[4px] bg-ink px-3 py-2 text-[12.5px] leading-relaxed text-paper">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-2.5">
                  <TallyFace size={22} mood={busy && i === msgs.length - 1 ? "think" : "idle"} className="mt-0.5" />
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
                <TallyFace size={22} mood="think" className="mt-0.5" />
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
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line2 hover:text-ink disabled:opacity-40"
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
              className="min-w-0 flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={busy || !input.trim()}
              aria-label="send"
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-paper transition-opacity hover:opacity-85 disabled:opacity-30"
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
