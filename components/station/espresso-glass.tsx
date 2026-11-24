"use client";

/**
 * Station: a clear glass under a bottomless portafilter, filling with the
 * scale's weight. Progress for the shot: the line etched on the glass is the
 * recipe's target. It is drawn inside the shot chart, behind the curves. The liquid lands golden and cloudy, then the dark coffee separates
 * from the bottom and the crema stays as a layer on top.
 *
 * The glass and portafilter are SVG (they follow the theme's colors); the
 * liquid, droplets and stream are a canvas under it, redrawn only while
 * something moves.
 */

import { useEffect, useRef } from "react";
import { CREMA_REST, initialGlass, snapGlass, stepGlass, type GlassInput, type GlassState } from "@/lib/station/glass-sim";

// ── Scene, in drawing units (the SVG viewBox; the canvas uses the same) ──
const VW = 160;
const VH = 354;
const CX = 80;
/** Underside of the basket: where droplets hang and the stream starts */
const BASKET_Y = 56;
const BASKET_HALF = 42;
/** Glass: rim and inner floor */
const RIM_Y = 132;
const FLOOR_Y = 330;
const IN_TOP = 55.5;
const IN_BOTTOM = 44.5;
/** Liquid height at the target weight, and the most the glass shows */
const TARGET_H = 140;
const MAX_H = 186;
/** Scale of the glass when the recipe's target is unknown (g) */
const DEFAULT_TARGET = 40;

/** Liquid is computed on a small grid and stretched: fine enough for the swirls, little work */
const GRID_W = 56;
const GRID_H = 98;

type RGB = [number, number, number];

/** From settled coffee (0) to crema (1); the last stop is set per frame */
const RAMP: { at: number; rgb: RGB }[] = [
  { at: 0, rgb: [22, 10, 4] },
  { at: 0.3, rgb: [66, 27, 8] },
  { at: 0.55, rgb: [146, 66, 14] },
  { at: 0.78, rgb: [218, 130, 30] },
];
const CREMA_FRESH: RGB = [244, 180, 66];
const CREMA_RESTED: RGB = [198, 142, 80];
/** Stream: syrupy at first, caramel, then blond near the end */
const STREAM: RGB[] = [[92, 38, 10], [186, 104, 30], [230, 184, 96]];

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function css([r, g, b]: RGB, alpha = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a: number, b: number, v: number): number {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
}

function hash(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth noise, 0 to 1 */
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Inner half width of the glass at height `y` (it is wider at the rim) */
function halfWidth(y: number): number {
  return IN_BOTTOM + (IN_TOP - IN_BOTTOM) * ((FLOOR_Y - y) / (FLOOR_Y - RIM_Y));
}

function cavityPath(ctx: CanvasRenderingContext2D) {
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(CX - IN_TOP, RIM_Y);
  ctx.lineTo(CX - halfWidth(FLOOR_Y - r), FLOOR_Y - r);
  ctx.quadraticCurveTo(CX - IN_BOTTOM, FLOOR_Y, CX - IN_BOTTOM + r, FLOOR_Y);
  ctx.lineTo(CX + IN_BOTTOM - r, FLOOR_Y);
  ctx.quadraticCurveTo(CX + IN_BOTTOM, FLOOR_Y, CX + halfWidth(FLOOR_Y - r), FLOOR_Y - r);
  ctx.lineTo(CX + IN_TOP, RIM_Y);
  ctx.closePath();
}

/** Droplets on the basket: where (-1 to 1 across it), when they show up, how big */
const BEADS = Array.from({ length: 15 }, (_, i) => ({
  u: (hash(i, 7) * 2 - 1) * 0.92,
  delay: hash(i, 13) * 0.6,
  size: 1.8 + hash(i, 29) * 2.2,
}));

interface Scene {
  ctx: CanvasRenderingContext2D;
  grid: HTMLCanvasElement;
  gridCtx: CanvasRenderingContext2D;
  pixels: ImageData;
}

function draw(scene: Scene, s: GlassState, target: number | null, width: number, height: number, dpr: number) {
  const { ctx } = scene;
  const scale = Math.min(width / VW, height / VH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Same fit as the SVG on top: aspect kept, centered sideways, standing on the bottom edge
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (width - VW * scale) / 2, dpr * (height - VH * scale));

  const t = s.time;
  const full = target && target > 0 ? target : DEFAULT_TARGET;
  const progress = s.level / full;
  const liquidH = Math.min(MAX_H, progress * TARGET_H);
  const surfaceY = FLOOR_Y - liquidH;
  const crema = mix(CREMA_RESTED, CREMA_FRESH, s.turb);
  const streamColor = progress < 0.25
    ? mix(STREAM[0], STREAM[1], progress / 0.25)
    : mix(STREAM[1], STREAM[2], clamp01((progress - 0.6) / 0.4));

  // ── Liquid ──
  if (liquidH > 0.5) {
    const settledH = liquidH * (s.settled / Math.max(s.level, 0.001));
    // Crema still to clear, as height: the swirls live in it and die out as it goes
    const excess = Math.max(0, liquidH * (1 - CREMA_REST) - settledH);
    // Where dark meets crema: a blurry band while the stream stirs it; once it stops,
    // sharp curls of dark coffee pushing up through the crema; a clean line at rest
    const soft = 3.5 + s.turb * 0.3 * liquidH;
    const roll = 1.5 + (0.3 + 0.6 * (1 - s.turb)) * excess;
    const data = scene.pixels.data;
    const cellH = (FLOOR_Y - RIM_Y) / GRID_H;
    const cellW = (IN_TOP * 2) / GRID_W;
    for (let j = 0; j < GRID_H; j++) {
      const y = RIM_Y + (j + 0.5) * cellH;
      const above = FLOOR_Y - y; // height above the glass floor
      const depth = liquidH - above;
      const half = halfWidth(y);
      for (let i = 0; i < GRID_W; i++) {
        const o = (j * GRID_W + i) * 4;
        if (depth < -cellH) { data[o + 3] = 0; continue; }
        const dx = (i + 0.5) * cellW - IN_TOP;
        // Fractal noise, bent by a slower field so it curls instead of just drifting;
        // the pattern creeps up, like crema rising
        const wx = noise(dx * 0.02 + 11, above * 0.02 - t * 0.12) - 0.5;
        const wy = noise(dx * 0.02 + 37, above * 0.02 + t * 0.09) - 0.5;
        const px = dx * 0.045 + wx * 2.2, py = above * 0.045 + wy * 2.2 - t * 0.22;
        const n = (noise(px, py) + 0.5 * noise(px * 2.1 + 5, py * 2.1) + 0.25 * noise(px * 4.3 + 9, py * 4.3)) / 1.75;
        // Dark never climbs into the crema that stays on top
        const lift = Math.max((n - 0.5) * 3.2 * roll, -0.95 * excess);
        let c = smoothstep(settledH - soft, settledH + soft, above + lift);
        if (s.pour > 0.02 && depth > 0) {
          // The stream dives in and drags fresh, pale coffee down the middle
          const spread = 6 + depth * 0.28;
          const wobble = (noise(above * 0.06, t * 1.4) - 0.5) * 10;
          const reach = clamp01(1 - depth / (0.8 * liquidH + 1));
          c += s.pour * reach * (0.55 + 0.45 * n) * Math.exp(-((dx + wobble) ** 2) / (spread * spread));
          if (c > 1) c = 1;
        }
        // Color for this share of crema
        let lo = RAMP[0], hiAt = 1, hiRgb = crema;
        for (let k = 1; k < RAMP.length; k++) {
          if (c >= RAMP[k].at) lo = RAMP[k];
          else { hiAt = RAMP[k].at; hiRgb = RAMP[k].rgb; break; }
        }
        const k = (c - lo.at) / (hiAt - lo.at);
        // Thin at the walls: dark coffee lets some red light through there
        const edge = smoothstep(0.62, 1, Math.abs(dx) / half) * (1 - c);
        const shade = 1 - 0.1 * (dx / half) ** 2 * c;
        data[o] = (lo.rgb[0] + (hiRgb[0] - lo.rgb[0]) * k) * shade + edge * 46;
        data[o + 1] = (lo.rgb[1] + (hiRgb[1] - lo.rgb[1]) * k) * shade + edge * 15;
        data[o + 2] = (lo.rgb[2] + (hiRgb[2] - lo.rgb[2]) * k) * shade + edge * 3;
        data[o + 3] = 255;
      }
    }
    scene.gridCtx.putImageData(scene.pixels, 0, 0);

    ctx.save();
    cavityPath(ctx);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, surfaceY, VW, FLOOR_Y - surfaceY + 1);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(scene.grid, CX - IN_TOP, RIM_Y, IN_TOP * 2, FLOOR_Y - RIM_Y);
    ctx.restore();

    // Surface, seen slightly from above
    const rx = halfWidth(surfaceY) - 0.4;
    const ry = Math.min(4, liquidH * 0.5);
    ctx.fillStyle = css(mix(crema, [255, 236, 190], 0.16));
    ctx.beginPath();
    ctx.ellipse(CX, surfaceY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = css(mix(crema, [90, 40, 10], 0.35), 0.5);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(CX, surfaceY, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    if (s.pour > 0.05) {
      // Rings spreading from where the stream lands
      for (let k = 0; k < 2; k++) {
        const grow = (t * 0.9 + k * 0.5) % 1;
        ctx.strokeStyle = css([255, 240, 205], 0.55 * (1 - grow) * s.pour);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(CX, surfaceY, 3 + grow * (rx - 6), (3 + grow * (rx - 6)) * (ry / rx), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ── Droplets sweating out of the basket, before the first drop ──
  if (s.beads > 0.01) {
    for (const b of BEADS) {
      const grown = clamp01(s.beads * 1.6 - b.delay);
      if (grown <= 0) continue;
      const r = b.size * grown;
      const x = CX + b.u * (BASKET_HALF - 6);
      const y = BASKET_Y + 4 * (1 - b.u * b.u) + r * 0.9;
      ctx.fillStyle = css(mix(STREAM[0], STREAM[1], grown * 0.6));
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,225,170,0.6)";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Stream: rivulets gather under the basket into one thread ──
  if (s.pour > 0.01) {
    const end = Math.max(RIM_Y - 40, surfaceY) + 1.5;
    const neckY = BASKET_Y + 46;
    const thread = (1.5 + s.flow * 1.05) * Math.min(1, s.pour * 1.6);
    const coneHalf = 30 * s.pour;
    const sway = (y: number) => Math.sin(y * 0.045 - t * 8) * 0.9 * clamp01((y - neckY) / 120);
    const dark = mix(streamColor, [40, 14, 4], 0.55);

    if (s.pour >= 0.5) {
      ctx.beginPath();
      ctx.moveTo(CX - coneHalf, BASKET_Y);
      ctx.bezierCurveTo(CX - coneHalf * 0.55, BASKET_Y + 20, CX - thread, BASKET_Y + 30, CX - thread / 2, neckY);
      for (let y = neckY + 12; y < end; y += 12) ctx.lineTo(CX - thread / 2 + sway(y), y);
      ctx.lineTo(CX - thread / 2 + sway(end), end);
      ctx.lineTo(CX + thread / 2 + sway(end), end);
      for (let y = end - ((end - neckY) % 12 || 12); y > neckY; y -= 12) ctx.lineTo(CX + thread / 2 + sway(y), y);
      ctx.lineTo(CX + thread / 2, neckY);
      ctx.bezierCurveTo(CX + thread, BASKET_Y + 30, CX + coneHalf * 0.55, BASKET_Y + 20, CX + coneHalf, BASKET_Y);
      ctx.closePath();
      const body = ctx.createLinearGradient(0, BASKET_Y, 0, neckY + 30);
      body.addColorStop(0, css(dark));
      body.addColorStop(1, css(streamColor));
      ctx.fillStyle = body;
      ctx.fill();

      // Tiger stripes: darker rivulets wandering across the cone
      ctx.save();
      ctx.clip();
      ctx.lineCap = "round";
      for (let k = 0; k < 5; k++) {
        const u = (k / 4) * 2 - 1 + Math.sin(t * 1.3 + k * 1.9) * 0.16;
        ctx.strokeStyle = css(k % 2 ? [255, 214, 140] : [48, 17, 4], k % 2 ? 0.4 : 0.5);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(CX + u * coneHalf, BASKET_Y);
        ctx.bezierCurveTo(CX + u * coneHalf * 0.5, BASKET_Y + 20, CX + u * thread, BASKET_Y + 30, CX + u * thread * 0.3, neckY + 4);
        ctx.stroke();
      }
      // Light catching the thread
      ctx.strokeStyle = "rgba(255,232,180,0.45)";
      ctx.lineWidth = Math.max(0.5, thread * 0.22);
      ctx.beginPath();
      ctx.moveTo(CX - thread * 0.18, neckY);
      for (let y = neckY + 12; y < end; y += 12) ctx.lineTo(CX - thread * 0.18 + sway(y), y);
      ctx.stroke();
      ctx.restore();
    } else {
      // Starting or running out: single drops, speeding up as they fall
      const top = BASKET_Y + 8;
      ctx.fillStyle = css(streamColor);
      for (let k = 0; k < 3; k++) {
        const fall = (t * 1.5 + k / 3) % 1;
        const r = 2.4 * Math.min(1, s.pour * 4) * (1 - 0.25 * fall);
        ctx.beginPath();
        ctx.ellipse(CX, top + fall * fall * (end - top), r * 0.85, r * (1.1 + fall * 0.9), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function EspressoGlass({
  weight, scale, target, flow, brewing, className = "",
}: {
  /** The shot's weight (g) */
  weight: number | null | undefined;
  /** What the scale reads right now (g): the last drips after the flow is cut */
  scale?: number | null;
  /** Recipe's target weight (g): the dashed line on the glass */
  target: number | null;
  /** Flow into the cup (g/s): how thick the stream is */
  flow?: number | null;
  /** Coffee is being pulled right now */
  brewing: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<GlassInput>({ weight: weight ?? 0, target, flow: flow ?? null, brewing, scale });
  /** Starts the redraw loop if it is stopped (set by the effect that owns the canvas) */
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const grid = document.createElement("canvas");
    grid.width = GRID_W;
    grid.height = GRID_H;
    const gridCtx = grid.getContext("2d");
    if (!box || !canvas || !ctx || !gridCtx) return;
    const scene: Scene = { ctx, grid, gridCtx, pixels: gridCtx.createImageData(GRID_W, GRID_H) };
    const state = initialGlass(inputRef.current);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, dpr = 1, frameId = 0, last = 0;

    const paint = () => draw(scene, state, inputRef.current.target, width, height, dpr);
    const frame = (now: number) => {
      frameId = 0;
      // Real elapsed time, so a slow tablet shows fewer frames, not a slower pour
      const dt = Math.min(2, Math.max(0, (now - last) / 1000));
      last = now;
      const moving = stepGlass(state, inputRef.current, dt);
      paint();
      if (moving) frameId = requestAnimationFrame(frame);
    };
    wakeRef.current = () => {
      if (still.matches) { snapGlass(state, inputRef.current); paint(); return; }
      if (frameId) return;
      last = performance.now();
      frameId = requestAnimationFrame(frame);
    };

    const fit = new ResizeObserver(() => {
      width = box.clientWidth;
      height = box.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      paint();
    });
    fit.observe(box);
    wakeRef.current();

    return () => {
      fit.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
      wakeRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    inputRef.current = { ...inputRef.current, weight: weight ?? 0, target, flow: flow ?? null, brewing };
    wakeRef.current();
  }, [weight, target, flow, brewing]);

  // The scale never rests, so it doesn't wake the drawing: it is only read while
  // the glass is already moving (the shot, and the drips right after it)
  useEffect(() => {
    inputRef.current = { ...inputRef.current, scale };
  }, [scale]);

  const full = target && target > 0 ? target : null;
  const shown = Math.max(0, weight ?? 0);

  return (
    <div ref={boxRef} role="img" className={`relative h-full w-full ${className}`}
      aria-label={full ? `Cup: ${shown.toFixed(1)} of ${full} g` : `Cup: ${shown.toFixed(1)} g`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMax meet"
        className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* Bottomless portafilter, seen from the front */}
        <rect x="30" y="10" width="100" height="11" rx="2" fill="var(--ink)" fillOpacity="0.35" />
        <rect x="11" y="25" width="138" height="10" rx="2.5" fill="var(--ink)" />
        <rect x="21" y="20" width="118" height="27" rx="4" fill="var(--ink)" />
        <path d="M36 46 L124 46 L122 56 Q80 64 38 56 Z" fill="var(--ink)" fillOpacity="0.6" />

        {/* Glass: thick base, walls, rim */}
        <g transform={`translate(0 ${RIM_Y - 168})`}>
        <path d="M20 168 L31 378 Q31.5 388 41.5 388 L118.5 388 Q128.5 388 129 378 L140 168 L135.5 168 L125 357 Q124.5 366 116.5 366 L43.5 366 Q35.5 366 35 357 L24.5 168 Z"
          fill="var(--ink)" fillOpacity="0.09" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.2" strokeLinejoin="round" />
        <ellipse cx={CX} cy="168" rx="60" ry="4.5" fill="none" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.2" />
        <path d="M44 377 L116 377" stroke="var(--paper)" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
        {/* Reflections on the front of the glass */}
        <path d="M33 184 L41.5 346" stroke="#fff" strokeOpacity="0.32" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M127 190 L123 262" stroke="#fff" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Target weight: a fill line etched on the glass (the chart has its own dashed line) */}
        {full && (
          <path d={`M${CX - halfWidth(FLOOR_Y - TARGET_H) - 6} ${FLOOR_Y - TARGET_H} L${CX + halfWidth(FLOOR_Y - TARGET_H) + 6} ${FLOOR_Y - TARGET_H}`}
            stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1.3" />
        )}
      </svg>
    </div>
  );
}
