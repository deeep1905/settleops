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

/* raw hex for canvas — DOM chips keep the Tailwind tones from lib.ts */
const SEV_COLOR: Record<string, string> = {
  "SEV-1": "#e11d48",
  "SEV-2": "#d97706",
  "SEV-3": "#0284c7",
};
const OK = "#059669";

/* hex → rgb mix, for the break telegraph tint */
const mix = (a: string, b: string, t: number): string => {
  const p = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const A = p(a);
  const B = p(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",")})`;
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
      ].slice(0, 5),
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
      if (p.inc) {
        const sev = SEV_COLOR[p.inc.severity] ?? "#e11d48";
        flares.push({ age: 0, color: sev, small: false });
        spawnParticles(sev, 7);
        dying.push({ x: -40, z: 150, a: 1, fill: "#f6f8fa", top: "#ffffff", stroke: sev });
        dying.push({ x: 40, z: 150, a: 1, fill: "#e8ebfd", top: "#f4f5fe", stroke: sev });
        pushTray(p.inc);
      } else {
        flares.push({ age: 0, color: OK, small: true });
        spawnParticles(OK, 4);
        merged.push({ z: 150, a: 1 });
      }
    };

    /* ---------- the renderer ---------- */
    const draw = (now: number) => {
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
        /* contact shadow — grounds the box on the floor */
        ctx.globalAlpha = 0.13 * alpha;
        ctx.fillStyle = "#101317";
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
        ctx.strokeStyle = "rgba(16,19,23,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
        /* front face — vertical shading sells the volume */
        const frontGrad = ctx.createLinearGradient(0, yT, 0, yB);
        frontGrad.addColorStop(0, fill);
        frontGrad.addColorStop(1, mix(fill, "#101317", 0.14));
        ctx.beginPath();
        ctx.rect(x1, yT, x2 - x1, yB - yT);
        ctx.fillStyle = frontGrad; ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.globalAlpha = 1;
      };

      /* floor rings */
      ctx.lineWidth = 1;
      for (const z of [300, 450, 600, 750]) {
        ctx.strokeStyle = `rgba(212,217,222,${0.6 - (z - 300) / 1400})`;
        ctx.beginPath();
        ctx.moveTo(px(-250, z, camX), py(z, camY));
        ctx.lineTo(px(250, z, camX), py(z, camY));
        ctx.stroke();
      }
      /* lane borders */
      ctx.strokeStyle = "rgba(212,217,222,0.85)";
      for (const lx of [-205, 205]) {
        ctx.beginPath();
        ctx.moveTo(px(lx, 900, camX), py(900, camY));
        ctx.lineTo(px(lx, 60, camX), py(60, camY));
        ctx.stroke();
      }
      /* the matcher gate — a pulsing accent line across the floor */
      const pulse = reduced ? 0.75 : 0.5 + 0.25 * (Math.sin(now / 480) + 1) / 2;
      ctx.strokeStyle = `rgba(79,70,229,${pulse})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px(-135, 150, camX), py(150, camY));
      ctx.lineTo(px(135, 150, camX), py(150, camY));
      ctx.stroke();
      ctx.fillStyle = `rgba(79,70,229,${0.04 + 0.05 * ((reduced ? 1 : (Math.sin(now / 480) + 1) / 2))})`;
      ctx.beginPath();
      ctx.moveTo(px(-135, 150, camX), py(150, camY));
      ctx.lineTo(px(135, 150, camX), py(150, camY));
      ctx.lineTo(px(135, 172, camX), py(172, camY));
      ctx.lineTo(px(-135, 172, camX), py(172, camY));
      ctx.closePath();
      ctx.fill();
      /* the scanner — a bright segment sweeping the gate */
      const sweepT = reduced ? 0.5 : (now / 1300) % 1;
      const sweepX = -135 + 270 * sweepT;
      ctx.strokeStyle = "rgba(79,70,229,0.65)";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px(sweepX - 17, 150, camX), py(150, camY));
      ctx.lineTo(px(sweepX + 17, 150, camX), py(150, camY));
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(139,152,163,0.95)";
      ctx.fillText("the matcher", px(0, 150, camX), py(150, camY) - 8);
      ctx.fillText("books", px(-178, 830, camX), py(830, camY) - 15);
      ctx.fillText("rail", px(178, 830, camX), py(830, camY) - 15);

      /* chips — painter's algorithm, far first */
      interface D { z: number; paint: () => void }
      const items: D[] = [];
      for (const p of pairs) {
        const z = 900 - 750 * p.t;
        const conv = -175 + 135 * p.t;
        const wob = Math.sin(now / 900 + p.seed) * 7 * (1 - p.t);
        const bx = conv + wob;
        const rx = -conv - wob * 0.7;
        const telegraph = p.inc ? Math.max(0, (p.t - 0.55) / 0.45) : 0;
        const sevC = p.inc ? SEV_COLOR[p.inc.severity] : null;
        items.push({
          z,
          paint: () => drawChip(bx, z, 1, "#f6f8fa", "#ffffff", sevC && telegraph > 0 ? mix("#b9c1c9", sevC, telegraph) : "#b9c1c9"),
        });
        items.push({
          z,
          paint: () => drawChip(rx, z, 1, "#e8ebfd", "#f4f5fe", sevC && telegraph > 0 ? mix("#8f89e8", sevC, telegraph) : "#8f89e8"),
        });
      }
      for (const mm of merged) {
        items.push({ z: mm.z, paint: () => drawChip(0, mm.z, mm.a, "#d9f3e4", "#ecfdf5", OK) });
      }
      for (const d of dying) {
        items.push({ z: d.z, paint: () => drawChip(d.x, d.z, d.a, d.fill, d.top, d.stroke, false) });
      }
      items.sort((a, b) => b.z - a.z);
      for (const it of items) it.paint();

      /* flares at the gate */
      const gx = px(0, 150, camX);
      const gy = py(150, camY);
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

      /* horizon fog — depth without darkening the card */
      const fogTop = BASE() - 26 + camY * 0.4;
      const grad = ctx.createLinearGradient(0, fogTop, 0, fogTop + 122);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
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
      flares = [{ age: 0.45, color: OK, small: true }];
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

    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      redrawRef.current = null;
    };
  }, []);

  /* redraw the static frame when the (late-arriving) batch lands */
  useEffect(() => {
    redrawRef.current?.();
  }, [batch]);

  return (
    <aside
      className="rise card flex flex-col self-start overflow-hidden"
      style={{ animationDelay: "160ms" }}
      aria-label="live batch visualization"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" aria-hidden />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            the batch, in motion
          </span>
        </div>
        <span className="font-mono text-[11px] text-faint">
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

        {/* HUD — the real numbers, over the scene */}
        <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-ink/70" aria-hidden />
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">
            books · {batch?.counts.books ?? "—"}
          </span>
        </div>
        <div className="pointer-events-none absolute right-3 top-2.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-accent/80" aria-hidden />
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">
            rail · {batch?.counts.settlements ?? "—"}
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-2.5 left-3">
          <div className="font-mono text-[16px] font-semibold tabular leading-none text-ink">
            {batch ? `${batch.match_rate}%` : "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-faint">
            matched · {batch ? `${batch.counts.matched} of ${batch.counts.books}` : "—"}
          </div>
        </div>

        {/* the incident tray — real incidents, stamped as they break */}
        <div className="pointer-events-none absolute bottom-2.5 right-3 flex max-w-[62%] flex-col items-end gap-1 sm:max-w-none">
          {tray.map((t) => (
            <div
              key={t.key}
              className="pop flex items-center gap-1.5 rounded-md border border-line bg-white/95 px-2 py-1 shadow-[0_1px_3px_rgba(16,19,23,0.06)]"
            >
              <span className="font-mono text-[10.5px] font-semibold text-accent">{t.id}</span>
              <span className="hidden font-mono text-[10px] text-faint sm:inline">{classLabel[t.klass] ?? t.klass}</span>
              <span className={`rounded-[4px] px-1.5 py-px font-mono text-[9px] font-semibold ${sevTone(t.sev)}`}>
                {t.sev}
              </span>
            </div>
          ))}
        </div>

        {busy && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-white/92 px-3 py-1.5 font-mono text-[11px] font-medium text-accent shadow-sm">
            re-running the batch…
          </div>
        )}
        {!batch && !busy && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-mono text-[12px] text-faint">starting the engine…</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <span className="font-mono text-[11px] text-faint">
          brain: {brain} · replayed from the ledger
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
