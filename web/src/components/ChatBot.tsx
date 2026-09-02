import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { postJSON, getJSON } from "../lib";

/**
 * ChatBot.tsx — Tally, the desk's companion.
 *
 * A round little presence you can pick up and put anywhere on the desk:
 *   · the ball drags (pointer events, clamped to the viewport, position
 *     remembered in localStorage) and leans into the carry; the desk it
 *     opens follows it — above when there's room, below when there isn't,
 *     tail always pointing home
 *   · the face is alive and every change is a cross-fade, never a swap:
 *     pupils that glide after the pointer, a blink on a slow clock,
 *     moods for the moments that matter. no clipped corners, no badge —
 *     the antenna's diamond is the status light, amber when the local
 *     brain answers and settling to green when the live one is on
 *   · answers arrive the way thoughts do — token by token. the engine
 *     streams SSE frames; the deterministic brains type themselves out
 *     in small word groups, the live brain streams its real tokens, and
 *     a blinking caret marks the spot while it lands
 * Page-aware throughout: Tally reads the view it's floating over and
 * answers in its context. ⌘K toggles, esc and walking away close, the
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

type StreamEvent =
  | { type: "start"; mode: Msg["mode"]; model: string | null }
  | { type: "delta"; text: string }
  | { type: "done"; mode: Msg["mode"]; model: string | null; action: Msg["action"] };

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

function TallyFace({ size = 64, mood = "idle", gaze, live, className = "" }: {
  size?: number; mood?: Mood; gaze?: { x: number; y: number }; live?: boolean; className?: string;
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

  /* moods cross-fade — every shape is always drawn, only the opacity
     moves, so the face never snaps between expressions */
  const on = (v: boolean) => (v ? 1 : 0);

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      {/* antenna — the amber diamond is the break marker from the logo;
          it leans with the ball, pulses while she thinks, and is the
          status light: green when the live brain is on, amber when the
          deterministic one answers — a settle, never a swap */}
      <g className="tally-antenna" data-think={think}>
        <line x1="32" y1="24" x2="32" y2="13.5" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
        <path className="tally-signal" data-think={think} data-live={live ? "true" : undefined}
              d="M32 5.5l4.4 5.2L32 16l-4.4-5.3Z" />
      </g>

      {/* the head — properly round, the one shape a companion should be */}
      <circle cx="32" cy="38" r="22" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
      {/* a quiet highlight so the ball reads as a ball */}
      <ellipse cx="24" cy="28" rx="7" ry="4" fill="#fff" opacity="0.32" transform="rotate(-20 24 28)" />

      {/* cheeks — amber, faint; fuller when she's pleased, gone when
          she's wide-eyed or sorry */}
      <g className="tally-fade" style={{ opacity: happy ? 0.85 : sad || wide ? 0 : 0.5 }}>
        <circle cx="20.5" cy="43" r="2.7" fill="#FFB224" />
        <circle cx="43.5" cy="43" r="2.7" fill="#FFB224" />
      </g>

      {/* the eyes — three expressions, cross-faded */}
      <g className="tally-fade" style={{ opacity: on(!happy && !wide) }}>
        {/* the default — big dark eyes that follow the pointer, and blink */}
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
      </g>
      <g className="tally-fade" style={{ opacity: on(happy) }}>
        {/* the squint of a good answer — two arcs */}
        <path d="M20.5 37.5q4-5.6 8 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M35.5 37.5q4-5.6 8 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g className="tally-fade" style={{ opacity: on(wide) }}>
        {/* wide — the "where are we going" of being carried */}
        <circle cx="24.5" cy="36.5" r="5.7" fill="#fff" stroke="var(--color-ink)" strokeWidth="1.5" />
        <circle cx="39.5" cy="36.5" r="5.7" fill="#fff" stroke="var(--color-ink)" strokeWidth="1.5" />
        <circle cx="24.5" cy="37.7" r="2.5" fill="var(--color-ink)" />
        <circle cx="39.5" cy="37.7" r="2.5" fill="var(--color-ink)" />
      </g>

      {/* the mouth — five expressions, cross-faded */}
      <path className="tally-fade" style={{ opacity: on(happy) }}
            d="M26 43.5q6 8.2 12 0Z" fill="var(--color-ink)" />
      <circle className="tally-fade" style={{ opacity: on(wide) }}
              cx="32" cy="46.5" r="3" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
      <path className="tally-fade" style={{ opacity: on(sad) }}
            d="M27 48q5-4.4 10 0" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      <path className="tally-fade" style={{ opacity: on(think) }}
            d="M28.5 46.5h7" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
      <path className="tally-fade" style={{ opacity: on(!happy && !wide && !sad && !think) }}
            d="M26 44q6 5.2 12 0" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
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
  const [closing, setClosing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);          // a round trip is in flight
  const [streaming, setStreaming] = useState(false); // the answer is arriving
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [pos, setPos] = useState<Pos>(() => loadPos());
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState(true);
  const [tilt, setTilt] = useState(0);

  const orb = useRef<HTMLButtonElement>(null);
  const orbWrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppress = useRef(false);
  const moodTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const typeTimer = useRef<number | undefined>(undefined);
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

  /* leave no timer behind */
  useEffect(() => () => {
    window.clearTimeout(moodTimer.current);
    window.clearTimeout(closeTimer.current);
    window.clearInterval(typeTimer.current);
  }, []);

  /* a closing desk folds in — a 150ms goodbye, then it's gone. every
     way out (esc, walking away, the ball itself) goes through here */
  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  };

  /* a desk closes when you walk away — a pointerdown anywhere that isn't
     tally or her panel folds it up */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (orbWrap.current?.contains(t) || panel.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, closing]);

  /* ⌘K / ctrl-K toggles, esc closes */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else { setOpen(true); feel("happy", 800); }
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  /* the local typewriter — canned lines land the same way streamed ones
     do, a couple of characters at a tick */
  const typeOut = (text: string) => {
    window.clearInterval(typeTimer.current);
    setMsgs([{ role: "bot", text: "" }]);
    setStreaming(true);
    let i = 0;
    typeTimer.current = window.setInterval(() => {
      i = Math.min(text.length, i + 2);
      const slice = text.slice(0, i);
      setMsgs((ms) => {
        if (!ms.length || ms[ms.length - 1].role !== "bot") {
          return [...ms, { role: "bot", text: slice }];
        }
        const c = [...ms];
        c[c.length - 1] = { ...c[c.length - 1], text: slice };
        return c;
      });
      if (i >= text.length) {
        window.clearInterval(typeTimer.current);
        setStreaming(false);
      }
    }, 16);
  };

  /* first open starts with a hello from tally — typed, not dumped */
  useEffect(() => {
    if (open && msgs.length === 0) {
      typeOut(`hey — i'm tally, the desk's companion.\ni can see you're on the ${PAGE_LABEL[view]} view, and every number i quote is live from the engine.\npick me up and put me wherever i'm useful — then /status, or tap a chip below.`);
      feel("happy", 1200);
    }
    if (open) field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* new text keeps the bottom in view — while it streams, not just when */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, streaming]);

  const reset = () => {
    typeOut(`clean slate.\ni'm still reading the ${PAGE_LABEL[view]} view — ask me anything, or /help for what i know cold.`);
    setInput("");
    feel("happy", 900);
    field.current?.focus();
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    if (q.toLowerCase() === "/reset") { reset(); return; }
    window.clearInterval(typeTimer.current);

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
      const r = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, page: view }),
      });
      if (!r.ok || !r.body) throw new Error("stream refused");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let ev: StreamEvent;
          try { ev = JSON.parse(line.slice(5).trim()) as StreamEvent; } catch { continue; }
          if (ev.type === "start") {
            setMsgs((ms) => [...ms, {
              role: "bot", text: "", mode: ev.mode, model: ev.model, action: null,
            }]);
            setStreaming(true);
          } else if (ev.type === "delta") {
            setMsgs((ms) => {
              if (!ms.length || ms[ms.length - 1].role !== "bot") return ms;
              const c = [...ms];
              c[c.length - 1] = { ...c[c.length - 1], text: c[c.length - 1].text + ev.text };
              return c;
            });
          } else if (ev.type === "done") {
            setMsgs((ms) => {
              if (!ms.length || ms[ms.length - 1].role !== "bot") return ms;
              const c = [...ms];
              c[c.length - 1] = {
                ...c[c.length - 1], mode: ev.mode, model: ev.model,
                action: ev.action ?? null,
              };
              return c;
            });
            setStreaming(false);
            feel("happy");
          }
        }
      }
    } catch {
      /* the stream broke — the one-shot endpoint is the spare tire */
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
      }
    } finally {
      setBusy(false);
      setStreaming(false);
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
    if (d.moved) {
      setPos(clampPos({ x: d.ox + dx, y: d.oy + dy }));
      /* she leans into the carry, and settles upright when you pause —
         a trailing tilt, eased by the wrapper's transition */
      setTilt((t) => {
        const v = t * 0.86 + (e.movementX ?? 0) * 0.32;
        return Math.max(-7, Math.min(7, v));
      });
    }
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
      setTilt(0);
    }
  };

  const onOrbClick = () => {
    if (suppress.current) { suppress.current = false; return; }
    if (open) { close(); return; }
    setOpen(true);
    feel("happy", 800);                // glad you opened the desk
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

  /* while you type, she reads along — the eyes go to the desk, not
     the pointer */
  const lookAtDesk = open && input.trim()
    ? (() => {
        const dx = px + PW / 2 - (pos.x + ORB / 2);
        const dy = py + panelH / 2 - (pos.y + ORB / 2);
        const d = Math.hypot(dx, dy) || 1;
        return { x: (dx / d) * 1.6, y: (dy / d) * 1.6 };
      })()
    : null;

  return (
    <>
      {/* ---------------- the companion, wherever you put her ---------------- */}
      <div ref={orbWrap} className="tally-tilt fixed z-50"
           style={{ top: pos.y, left: pos.x, transform: `rotate(${tilt}deg)` }}>
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
          className={`tally-orb relative flex size-16 cursor-grab touch-none select-none items-center justify-center rounded-full transition-transform duration-200 hover:scale-[1.05] active:cursor-grabbing ${
            mood === "drag" ? "scale-[1.08]" : ""
          }`}
        >
          <span
            key={mood === "happy" ? "boing" : "bob"}
            className={mood === "happy" ? "tally-boing" : "tally-bob"}
            data-paused={mood === "drag"}
          >
            <TallyFace size={64} mood={mood} gaze={lookAtDesk ?? gaze} live={!!status?.llm} />
          </span>
        </button>
      </div>

      {/* ---------------- the desk it opens, tail pointing home ---------------- */}
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="tally — the companion"
          style={{
            top: py, left: px, width: PW, height: panelH,
            transformOrigin: tailTop ? "top center" : "bottom center",
          }}
          className={`${closing ? "desk-out" : "desk-in"} fixed z-40 flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_24px_64px_-20px_rgba(16,19,23,0.45)]`}
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

          {/* header — who, where, and the brain as a color that settles,
              not a box in the corner */}
          <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
            <TallyFace size={30} mood={mood} gaze={gaze} live={!!status?.llm} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-tight">Tally</div>
              <div className="truncate text-[10.5px] text-faint">
                reading · {PAGE_LABEL[view]}
              </div>
            </div>
            <div
              className="flex shrink-0 items-center gap-1.5"
              title={status?.llm ? `${status.provider} · ${status.model}` : "no key — the deterministic brain answers"}
            >
              <span
                aria-hidden
                className="tally-live"
                data-on={status?.llm ? "true" : "false"}
              />
              <span className="text-[10.5px] text-faint">
                {status?.llm ? "groq · live" : "offline smarts"}
              </span>
            </div>
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
                  <TallyFace size={22} mood={(busy || streaming) && i === msgs.length - 1 ? "think" : "idle"} className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                      {m.text}
                      {streaming && i === msgs.length - 1 && <span className="tally-caret" aria-hidden />}
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
                    {m.mode && !streaming && (
                      <div className="mt-1.5 font-mono text-[9.5px] tracking-wide text-faint">
                        {m.mode === "llm" && m.model ? `groq · ${m.model}` : SOURCE[m.mode]}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && !streaming && (
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
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={busy || !input.trim()}
              aria-label="send"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85 disabled:opacity-30"
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
