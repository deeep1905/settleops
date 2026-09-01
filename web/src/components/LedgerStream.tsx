import { useEffect, useRef, useState } from "react";
import type { Batch, Incident } from "../types";
import { classLabel, sevTone } from "../lib";

/**
 * LedgerStream.tsx — the hero's right side: the batch, in motion.
 *
 * A pseudo-3D canvas scene (no deps, painter's-algorithm perspective):
 * books rows and rail rows flow toward the viewer on a tilted floor and
 * meet at the matcher gate. Matched pairs fuse into one green chip that
 * settles past the camera; breaks telegraph their severity color on
 * approach, flare at the gate, and land in a tray stamped with the
 * REAL incidents of the live batch — the stream replays the ledger's
 * own composition (54 matched : 12 breaks = 81.8%), so the animation
 * is a visualization of the data, not a decoration on top of it.
 *
 * Pointer parallax tilts the camera; idle sway keeps it alive untouched;
 * prefers-reduced-motion gets one composed static frame instead.
 */

/* the canvas inks itself from the page's own tokens — flip the theme
   and the scene re-inks on the next frame. Tokens are hex in both
   palettes; DOM chips keep the Tailwind tones from lib.ts */
interface Pal {
  surface: string; accentSoft: string; okSoft: string;
  line2: string; faint: string; accent: string;
  ok: string; crit: string; warn: string; info: string; ink: string;
}
const pal = (): Pal => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--color-surface"), accentSoft: v("--color-accent-soft"), okSoft: v("--color-ok-soft"),
    line2: v("--color-line2"), faint: v("--color-faint"), accent: v("--color-accent"),
    ok: v("--color-ok"), crit: v("--color-crit"), warn: v("--color-warn"), info: v("--color-info"),
    ink: v("--color-ink"),
  };
};
const sevHex = (sev: string, p: Pal): string =>
  sev === "SEV-2" ? p.warn : sev === "SEV-3" ? p.info : p.crit;

/* parse #hex or rgb() — so mixes can chain */
const parse = (c: string): number[] => {
  if (c[0] === "#" && c.length >= 7) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [16, 19, 23];
};
const mix = (a: string, b: string, t: number): string => {
  const A = parse(a);
  const B = parse(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",")})`;
};
const rgba = (c: string, a: number): string => {
  const [r, g, b] = parse(c);
  return `rgba(${r},${g},${b},${a})`;
};

interface TrayItem {
  id: string;
  sev: Incident["severity"];
  klass: string;
  key: string;
}

export function StreamCard({ batch, brain, busy, onRun }: {
  batch: Batch | null;
  brain: string;
  busy: boolean;
  onRun: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const batchRef = useRef<Batch | null>(batch);
  const busyRef = useRef(busy);
  const redrawRef = useRef<(() => void) | null>(null);
  const trayInit = useRef(false);
  batchRef.current = batch;
  busyRef.current = busy;

  const pushTray = (inc: Incident) => {
    setTray((prev) =>
      [
        { id: inc.id, sev: inc.severity, klass: inc.break_class, key: `${inc.id}-${Date.now()}-${Math.random()}` },
        ...prev,
      ].slice(0, 3),
    );
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- geometry: a fixed camera, a tilted floor ---------- */
    const F = 620;
    const persp = (z: number) => F / (F + Math.max(z, -60));
    let W = 1;
    let H = 1;
    let dpr = 1;
    let raf = 0;
    let staticDone = false;

    const BASE = () => H * 0.16;
    const K = () => H * 0.56;
    const px = (x: number, z: number, camX: number) => W / 2 + (x + camX) * persp(z);
    const py = (z: number, camY: number) => BASE() + camY + K() * persp(z);

    /* ---------- scene state (ref-owned; React only sees the tray) ---------- */
    interface Pair { t: number; seed: number; inc: Incident | null }
    interface Merged { z: number; a: number }
    interface Dying { x: number; z: number; a: number; fill: string; top: string; stroke: string }
    interface Flare { age: number; color: string; small: boolean }
    interface Particle { x: number; y: number; vx: number; vy: number; age: number; color: string }

    let pairs: Pair[] = [];
    let merged: Merged[] = [];
    let dying: Dying[] = [];
    let flares: Flare[] = [];
    let particles: Particle[] = [];
    let cursor = 0;
    let forceBreak = true; /* the first pair a visitor sees is a real incident */
    let spawnAcc = 260;
    let last = performance.now();
    let lastBatch: Batch | null = null;
    const cam = { x: 0, y: 0 };
    const camT = { x: 0, y: 0 };

    const spawn = () => {
      const b = batchRef.current;
      if (!b || busyRef.current) return;
      if (b !== lastBatch) { lastBatch = b; cursor = 0; forceBreak = true; }
      const ratio = b.counts.incidents / Math.max(1, b.counts.matched + b.counts.incidents);
      const isBreak = forceBreak || Math.random() < ratio;
      forceBreak = false;
      const inc = isBreak ? b.incidents[cursor++ % b.incidents.length] : null;
      pairs.push({ t: 0, seed: Math.random() * 6.283, inc });
    };

    /* the resolve burst — small sparks at the gate */
    const spawnParticles = (color: string, n: number) => {
      const sg = persp(150);
      const gx0 = W / 2 + cam.x * sg;
      const gy0 = BASE() + cam.y + K() * sg - 8;
      for (let i = 0; i < n; i++) {
        particles.push({
          x: gx0 + (Math.random() - 0.5) * 34 * sg,
          y: gy0 + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.02,
          vy: -0.02 - Math.random() * 0.024,
          age: 0,
          color,
        });
      }
    };

    const resolve = (p: Pair) => {
      const P = pal();
      if (p.inc) {
        const sev = sevHex(p.inc.severity, P);
        flares.push({ age: 0, color: sev, small: false });
        spawnParticles(sev, 7);
        dying.push({ x: -40, z: 150, a: 1, fill: P.surface, top: mix(P.surface, "#ffffff", 0.5), stroke: sev });
        dying.push({ x: 40, z: 150, a: 1, fill: P.accentSoft, top: mix(P.accentSoft, "#ffffff", 0.45), stroke: sev });
        pushTray(p.inc);
      } else {
        flares.push({ age: 0, color: P.ok, small: true });
        spawnParticles(P.ok, 4);
        merged.push({ z: 150, a: 1 });
      }
    };

    /* ---------- the renderer ---------- */
    const draw = (now: number) => {
      const P = pal();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const camX = cam.x + (reduced ? 0 : Math.sin(now / 1700) * 2.5);
      const camY = cam.y + (reduced ? 0 : Math.cos(now / 2300) * 1.8);

      const drawChip = (xw: number, z: number, a: number, fill: string, top: string, stroke: string, trail = true) => {
        const zf = Math.max(z, -60);
        const zb = zf + 22;
        const s0 = persp(zf);
        const x1 = px(xw - 30, zf, camX);
        const x2 = px(xw + 30, zf, camX);
        const yB = py(zf, camY);
        const yT = yB - 18 * s0;
        const x1b = px(xw - 30, zb, camX);
        const x2b = px(xw + 30, zb, camX);
        const yTb = py(zb, camY) - 18 * persp(zb);
        const alpha = Math.max(0, Math.min(1, a));
        /* contact shadow — grounds the box on the floor (dark in both themes) */
        ctx.globalAlpha = 0.13 * alpha;
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.ellipse(px(xw, zf, camX), yB + 2.5, 31 * s0, 4.5 * s0, 0, 0, Math.PI * 2);
        ctx.fill();
        /* motion trail — ghosts of where the chip came from */
        if (trail && zf > 0) {
          for (const [dz, ga] of [[70, 0.16], [140, 0.08]] as const) {
            const zt = zf + dz;
            const st = persp(zt);
            const x1t = px(xw - 30, zt, camX);
            const x2t = px(xw + 30, zt, camX);
            const yBt = py(zt, camY);
            const yTt = yBt - 18 * st;
            ctx.globalAlpha = ga * alpha;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.rect(x1t, yTt, x2t - x1t, yBt - yTt);
            ctx.fill();
          }
        }
        /* top face — lit from above: lighter than the front */
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x1, yT); ctx.lineTo(x2, yT); ctx.lineTo(x2b, yTb); ctx.lineTo(x1b, yTb);
        ctx.closePath();
        ctx.fillStyle = top; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
        /* front face — vertical shading sells the volume */
        const frontGrad = ctx.createLinearGradient(0, yT, 0, yB);
        frontGrad.addColorStop(0, fill);
        frontGrad.addColorStop(1, mix(fill, "#000000", 0.14));
        ctx.beginPath();
        ctx.rect(x1, yT, x2 - x1, yB - yT);
        ctx.fillStyle = frontGrad; ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.globalAlpha = 1;
      };

      /* floor rings — depth ticks down the runway */
      ctx.lineWidth = 1;
      for (const z of [300, 450, 600, 750]) {
        ctx.strokeStyle = rgba(P.line2, 0.6 - (z - 300) / 1400);
        ctx.beginPath();
        ctx.moveTo(px(-250, z, camX), py(z, camY));
        ctx.lineTo(px(250, z, camX), py(z, camY));
        ctx.stroke();
      }
      /* runway grid — longitudinal lines that make the floor read as 3D;
         the center line is the settled lane, dashed in accent */
      for (const lx of [-150, -75, 0, 75, 150]) {
        const center = lx === 0;
        ctx.strokeStyle = center ? rgba(P.accent, 0.18) : rgba(P.line2, 0.42);
        if (center) ctx.setLineDash([7, 9]);
        ctx.beginPath();
        ctx.moveTo(px(lx, 900, camX), py(900, camY));
        ctx.lineTo(px(lx, 60, camX), py(60, camY));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      /* lane borders */
      ctx.strokeStyle = rgba(P.line2, 0.85);
      for (const lx of [-205, 205]) {
        ctx.beginPath();
        ctx.moveTo(px(lx, 900, camX), py(900, camY));
        ctx.lineTo(px(lx, 60, camX), py(60, camY));
        ctx.stroke();
      }
      /* the matcher gate — an aura first, then a pulsing accent line */
      const gX = px(0, 150, camX);
      const gY = py(150, camY);
      const aura = 0.1 + 0.06 * (reduced ? 1 : (Math.sin(now / 480) + 1) / 2);
      const gglow = ctx.createRadialGradient(gX, gY - 6, 6, gX, gY - 6, 130);
      gglow.addColorStop(0, rgba(P.accent, aura));
      gglow.addColorStop(1, rgba(P.accent, 0));
      ctx.fillStyle = gglow;
      ctx.fillRect(gX - 140, gY - 140, 280, 200);
      const pulse = reduced ? 0.75 : 0.5 + 0.25 * (Math.sin(now / 480) + 1) / 2;
      ctx.strokeStyle = rgba(P.accent, pulse);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px(-135, 150, camX), py(150, camY));
      ctx.lineTo(px(135, 150, camX), py(150, camY));
      ctx.stroke();
      /* the scanner — a bright segment sweeping the gate */
      const sweepT = reduced ? 0.5 : (now / 1300) % 1;
      const sweepX = -135 + 270 * sweepT;
      ctx.strokeStyle = rgba(P.accent, 0.65);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px(sweepX - 17, 150, camX), py(150, camY));
      ctx.lineTo(px(sweepX + 17, 150, camX), py(150, camY));
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = P.faint;
      ctx.fillText("the matcher", px(0, 150, camX), py(150, camY) - 8);
      ctx.fillText("books", px(-178, 830, camX), py(830, camY) - 15);
      ctx.fillText("rail", px(178, 830, camX), py(830, camY) - 15);

      /* chips — painter's algorithm, far first */
      interface D { z: number; paint: () => void }
      const items: D[] = [];
      const bookEdge = mix(P.surface, P.ink, 0.25);
      for (const p of pairs) {
        const z = 900 - 750 * p.t;
        const conv = -175 + 135 * p.t;
        const wob = Math.sin(now / 900 + p.seed) * 7 * (1 - p.t);
        const bx = conv + wob;
        const rx = -conv - wob * 0.7;
        const telegraph = p.inc ? Math.max(0, (p.t - 0.55) / 0.45) : 0;
        const sevC = p.inc ? sevHex(p.inc.severity, P) : null;
        items.push({
          z,
          paint: () => drawChip(bx, z, 1, P.surface, mix(P.surface, "#ffffff", 0.35), sevC && telegraph > 0 ? mix(bookEdge, sevC, telegraph) : bookEdge),
        });
        items.push({
          z,
          paint: () => drawChip(rx, z, 1, P.accentSoft, mix(P.accentSoft, "#ffffff", 0.45), sevC && telegraph > 0 ? mix(P.accent, sevC, telegraph) : P.accent),
        });
      }
      for (const mm of merged) {
        items.push({ z: mm.z, paint: () => drawChip(0, mm.z, mm.a, P.okSoft, mix(P.okSoft, "#ffffff", 0.5), P.ok) });
      }
      for (const d of dying) {
        items.push({ z: d.z, paint: () => drawChip(d.x, d.z, d.a, d.fill, d.top, d.stroke, false) });
      }
      items.sort((a, b) => b.z - a.z);
      for (const it of items) it.paint();

      /* flares at the gate */
      const gx = gX;
      const gy = gY;
      for (const f of flares) {
        const r = 4 + f.age * (f.small ? 18 : 26);
        ctx.globalAlpha = Math.max(0, 1 - f.age);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy - 6, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* particles — the resolve burst */
      for (const pt of particles) {
        ctx.globalAlpha = Math.max(0, 1 - pt.age);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, 2, 2);
      }
      ctx.globalAlpha = 1;

      /* horizon fog — depth without darkening the card (the surface's own color) */
      const fogTop = BASE() - 26 + camY * 0.4;
      const grad = ctx.createLinearGradient(0, fogTop, 0, fogTop + 122);
      grad.addColorStop(0, rgba(P.surface, 0.95));
      grad.addColorStop(1, rgba(P.surface, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, fogTop, W, 122);
    };

    /* ---------- motion ---------- */
    const frame = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      spawnAcc += dt;
      if (spawnAcc >= 620) {
        spawnAcc = 0;
        if (pairs.length < 9) spawn();
      }
      for (const p of pairs) p.t += dt / 2600;
      const done = pairs.filter((p) => p.t >= 1);
      pairs = pairs.filter((p) => p.t < 1);
      for (const p of done) resolve(p);
      for (const mm of merged) {
        mm.z -= dt * (0.22 + (150 - mm.z) * 0.0008);
        if (mm.z < 60) mm.a -= dt / 350;
      }
      merged = merged.filter((mm) => mm.a > 0 && mm.z > -55);
      for (const d of dying) d.a -= dt / 260;
      dying = dying.filter((d) => d.a > 0);
      for (const f of flares) f.age += dt / 450;
      flares = flares.filter((f) => f.age < 1);
      for (const pt of particles) {
        pt.age += dt / 650;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 0.00005 * dt;
      }
      particles = particles.filter((pt) => pt.age < 1);
      if (busyRef.current) pairs = [];
      cam.x += (camT.x - cam.x) * 0.07;
      cam.y += (camT.y - cam.y) * 0.07;
      draw(now);
      raf = requestAnimationFrame(frame);
    };

    /* ---------- reduced motion: one composed frame ---------- */
    const staticScene = () => {
      const b = batchRef.current;
      const inc = b?.incidents[0] ?? null;
      pairs = [
        { t: 0.22, seed: 1.2, inc: null },
        { t: 0.5, seed: 3.1, inc: inc ?? null },
        { t: 0.78, seed: 5.0, inc: null },
      ];
      merged = [{ z: 80, a: 1 }];
      flares = [{ age: 0.45, color: pal().ok, small: true }];
      if (b && !trayInit.current) {
        trayInit.current = true;
        setTray(
          b.incidents.slice(0, 3).map((i) => ({
            id: i.id, sev: i.severity, klass: i.break_class, key: `static-${i.id}`,
          })),
        );
      }
    };

    /* ---------- plumbing ---------- */
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      if (reduced) {
        if (!staticDone) { staticScene(); staticDone = true; }
        draw(performance.now());
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    redrawRef.current = () => {
      if (reduced) {
        staticDone = false;
        resize();
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      camT.x = nx * 13;
      camT.y = ny * 6;
    };
    const onLeave = () => { camT.x = 0; camT.y = 0; };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    /* the desk lamp flipped — re-ink the composed frame (the animated
       loop re-reads the palette every frame anyway) */
    const onTheme = () => { redrawRef.current?.(); };
    window.addEventListener("settleops:theme", onTheme);

    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("settleops:theme", onTheme);
      redrawRef.current = null;
    };
  }, []);

  /* redraw the static frame when the (late-arriving) batch lands */
  useEffect(() => {
    redrawRef.current?.();
  }, [batch]);

  return (
    <aside
      className="rise card lift flex flex-col self-start overflow-hidden"
      style={{ animationDelay: "160ms" }}
      aria-label="live batch visualization"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-ink">
          The batch, in motion
        </span>
        <span className="shrink-0 font-mono text-[11px] text-faint">
          {batch ? `${batch.batch_id} · seed ${batch.seed}` : "booting"}
        </span>
      </div>

      <div ref={wrapRef} className="relative h-[340px] touch-none sm:h-[400px] lg:h-[420px]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          role="img"
          aria-label="Animated replay of the batch: books and rail rows flow toward the matcher gate; matched pairs merge and settle, breaks flare and land in the incident tray."
        />

        {/* one HUD zone: a scrim, the match rate, the incident tray —
            the lanes label themselves in-scene, the counts live in the footer */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface/90 via-surface/55 to-transparent" />

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-line/70 bg-surface/75 px-3 py-2 backdrop-blur-[2px]">
          <div className="kicker text-faint">match rate</div>
          <div className="tabular mt-0.5 font-mono text-[20px] font-semibold leading-none text-ink">
            {batch ? `${batch.match_rate}%` : "—"}
          </div>
          <div className="tabular mt-1.5 text-[10px] text-faint">
            {batch ? `${batch.counts.matched} of ${batch.counts.books} rows` : "—"}
          </div>
        </div>

        {/* the incident tray — real incidents, stamped as they break */}
        <div className="pointer-events-none absolute bottom-3 right-3 flex max-w-[58%] flex-col items-end gap-1 sm:max-w-none">
          {tray.map((t, i) => (
            <div
              key={t.key}
              style={{ opacity: i === 0 ? 1 : i === 1 ? 0.72 : 0.45 }}
              className="pop flex items-center gap-1.5 rounded-md border border-line bg-surface/85 px-2 py-1 shadow-[0_1px_3px_rgba(16,19,23,0.06)] backdrop-blur-[2px]"
            >
              <span className={`h-1.5 w-1.5 rounded-[2px] ${t.sev === "SEV-1" ? "bg-crit" : t.sev === "SEV-2" ? "bg-warn" : "bg-info"}`} aria-hidden />
              <span className="font-mono text-[10.5px] font-semibold text-ink">{t.id}</span>
              <span className="hidden font-mono text-[10px] text-faint sm:inline">{classLabel[t.klass] ?? t.klass}</span>
              <span className={`rounded-[4px] px-1.5 py-px font-mono text-[9px] font-semibold ${sevTone(t.sev)}`}>
                {t.sev}
              </span>
            </div>
          ))}
        </div>

        {busy && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface/95 px-3 py-1.5 font-mono text-[11px] font-medium text-accent shadow-sm">
            re-running the batch…
          </div>
        )}
        {!batch && !busy && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-mono text-[12px] text-faint">starting the engine…</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <span className="truncate text-[11.5px] text-faint">
          {batch ? `books ${batch.counts.books} · rail ${batch.counts.settlements} · ` : ""}
          {brain} brain · replayed from the ledger
        </span>
        <button
          onClick={onRun}
          disabled={busy || !batch}
          className="shrink-0 rounded-md border border-line2 bg-surface px-2.5 py-1 font-mono text-[11px] font-medium text-ink transition-colors hover:border-ink/30 hover:bg-paper disabled:opacity-40"
        >
          {busy ? "running…" : "re-run"}
        </button>
      </div>
    </aside>
  );
}
