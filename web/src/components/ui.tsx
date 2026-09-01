import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

/**
 * ui.tsx — shared primitives, zero new dependencies:
 *   CountUp — numbers that arrive, eased, tabular, reduced-motion aware
 *   Select  — a real filter menu (listbox semantics, keyboard, counts)
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
