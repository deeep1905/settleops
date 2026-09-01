import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

/**
 * ui.tsx — shared primitives, zero new dependencies:
 *   CountUp — numbers that arrive, eased, tabular, reduced-motion aware
 *   Select  — a real filter menu (listbox semantics, keyboard, counts)
 *   Reveal  — sections compose themselves as they enter the viewport
 */

/* ------------------------------------------------------------------ */
/* CountUp                                                             */
/* ------------------------------------------------------------------ */

export function CountUp({ value, decimals = 0, suffix = "", className, duration = 700 }: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const [n, setN] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !Number.isFinite(value)) {
      setN(value);
      return;
    }
    const start = from.current;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3); /* ease-out cubic */
      setN(start + (value - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={`tabular ${className ?? ""}`}>
      {n.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Select — the filter control the board deserves                      */
/* ------------------------------------------------------------------ */

export interface Opt<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly Opt<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  /* click-away */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  /* highlight the active option when opening */
  useEffect(() => {
    if (open) setHi(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHi((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (options[hi]) pick(options[hi].value);
    }
  };

  const active = options.find((o) => o.value === value);

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2.5 rounded-lg border bg-surface py-1.5 pl-3 pr-2.5 transition-colors hover:border-line2 ${
          open ? "border-accent" : "border-line"
        }`}
      >
        <span className="kicker text-faint">{label}</span>
        <span className="text-[12.5px] font-medium text-ink">{active?.label ?? value}</span>
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden
          className={`ml-0.5 shrink-0 text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="menu-in absolute left-0 top-[calc(100%+6px)] z-30 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-[0_8px_28px_-10px_rgba(16,19,23,0.28)]"
        >
          {options.map((o, idx) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              onMouseEnter={() => setHi(idx)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                idx === hi ? "bg-accent-soft text-accent" : "text-ink"
              }`}
            >
              <span className="w-3.5 shrink-0">
                {o.value === value && (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={o.value === value ? "font-semibold" : ""}>{o.label}</span>
              {o.count !== undefined && (
                <span className="tabular ml-auto text-[11px] text-faint">{o.count}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar — a distribution bar that grows from zero                       */
/* ------------------------------------------------------------------ */

export function Bar({ pct, className, style, delay = 0 }: {
  pct: number;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}) {
  return (
    <span
      className={`bar block h-1.5 rounded-full ${className ?? ""}`}
      style={{ ...style, "--w": `${Math.max(2, Math.min(100, pct))}%`, animationDelay: `${delay}ms` } as CSSProperties}
    />
  );
}

/* ------------------------------------------------------------------ */
/* LogoMark — the exception grid: three rows agree, one doesn't.       */
/* The amber diamond is the break — the one row that doesn't match.   */
/* ------------------------------------------------------------------ */

export function LogoMark({ size = 22, className = "" }: {
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      <g transform="translate(-0.6,-0.6)">
        <rect width="32" height="32" rx="7" fill="#4F46E5" />
        <circle cx="10" cy="10" r="3.3" fill="#fff" />
        <circle cx="22" cy="10" r="3.3" fill="#fff" />
        <circle cx="10" cy="22" r="3.3" fill="#fff" />
        <path d="M22 17.4L26.6 22L22 26.6L17.4 22Z" fill="#FFB224" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ThemeToggle — the desk lamp: sun on the night desk, moon on the    */
/* day desk. Persists in localStorage, flips <html data-theme>, and   */
/* broadcasts so the canvas scenes re-ink themselves.                 */
/* ------------------------------------------------------------------ */

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  const toggle = () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") !== "dark";
    if (next) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem("settleops-theme", next ? "dark" : "light");
    } catch {
      /* private mode: the toggle still works, it just won't persist */
    }
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", next ? "#0e1116" : "#f5f6f8"));
    window.dispatchEvent(new CustomEvent("settleops:theme"));
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark === null ? "Switch color theme" : dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark === null ? "Switch color theme" : dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex size-8 items-center justify-center rounded-full border border-line bg-surface text-faint transition-all hover:border-line2 hover:text-ink ${className}`}
    >
      {/* sun — the face shown on the night desk */}
      <svg aria-hidden className="icon-sun size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      {/* moon — the face shown on the day desk */}
      <svg aria-hidden className="icon-moon size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal — sections compose themselves as they enter the viewport.    */
/* One observer per element, disconnected on first hit; reduced-motion */
/* and no-JS both degrade to visible content.                          */
/* ------------------------------------------------------------------ */

export function Reveal({ children, className = "", delay = 0 }: {
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

/* ------------------------------------------------------------------ */
/* CopyChip — a command you can take with you: click to copy, the     */
/* checkmark confirms. The proof layer's commands become real.        */
/* ------------------------------------------------------------------ */

export function CopyChip({ cmd, className = "" }: { cmd: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      /* clipboard blocked — the label is still readable, no-op */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`copy "${cmd}"`}
      className={`flex shrink-0 items-center gap-2 rounded-md border bg-paper px-2.5 py-1 font-mono text-[12px] font-semibold text-ink transition-colors hover:border-accent/50 hover:text-accent ${className}`}
    >
      <span className="pop" key={copied ? "y" : "n"}>{cmd}</span>
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className="pop shrink-0">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-faint">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )}
    </button>
  );
}
