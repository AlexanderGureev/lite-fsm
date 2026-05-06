"use client";

import { useEffect, useRef } from "react";

type NodeColor = { r: number; g: number; b: number };
type PulseShape = "dot" | "diamond" | "square" | "triangle";

type EventKind = {
  name: string;
  color: NodeColor;
  shape: PulseShape;
  size: number;
  speed: number;
  weight: number;
  payload: (seq: number) => string;
};

type Node = {
  id: number;
  x: number;
  y: number;
  radius: number;
  pulse: number;
  phase: number;
  driftAmpX: number;
  driftAmpY: number;
  driftSpeedX: number;
  driftSpeedY: number;
  driftPhaseX: number;
  driftPhaseY: number;
  stateIndex: number;
  stateChange: number;
};

type Edge = {
  from: number;
  to: number;
};

type Pulse = {
  edgeIndex: number;
  position: number;
  speed: number;
  kind: EventKind;
  label: string;
};

type Ripple = {
  x: number;
  y: number;
  age: number;
  life: number;
  color: NodeColor;
};

const NODE_STATES = ["idle", "ready", "active", "loading", "done"] as const;

const NODE_COUNT_MIN = 9;
const NODE_COUNT_MAX = 12;
const NODE_AREA = { xMin: 0.5, xMax: 0.97, yMin: 0.1, yMax: 0.85 };
const NODE_MIN_DIST = 0.09;
const NODE_RADIUS_MIN = 5;
const NODE_RADIUS_MAX = 9;
const NEAREST_BASE = 2;
const NEAREST_BONUS_CHANCE = 0.35;

type NodeLayout = { x: number; y: number; radius: number; state: number };

const generateNodes = (rng: () => number): NodeLayout[] => {
  const count = NODE_COUNT_MIN + Math.floor(rng() * (NODE_COUNT_MAX - NODE_COUNT_MIN + 1));
  const result: NodeLayout[] = [];
  let attempts = 0;
  const maxAttempts = count * 60;
  while (result.length < count && attempts < maxAttempts) {
    attempts++;
    const x = lerp(NODE_AREA.xMin, NODE_AREA.xMax, rng());
    const y = lerp(NODE_AREA.yMin, NODE_AREA.yMax, rng());
    const tooClose = result.some(
      (n) => Math.hypot(n.x - x, n.y - y) < NODE_MIN_DIST,
    );
    if (tooClose) continue;
    result.push({
      x,
      y,
      radius: lerp(NODE_RADIUS_MIN, NODE_RADIUS_MAX, rng()),
      state: Math.floor(rng() * NODE_STATES.length),
    });
  }
  return result;
};

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const generateEdges = (nodes: NodeLayout[], rng: () => number): Edge[] => {
  const dist = (i: number, j: number) =>
    Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
  const keys = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const neighbors = nodes
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((a, b) => dist(i, a) - dist(i, b));
    const k = NEAREST_BASE + (rng() < NEAREST_BONUS_CHANCE ? 1 : 0);
    for (let n = 0; n < k && n < neighbors.length; n++) {
      keys.add(edgeKey(i, neighbors[n]));
    }
  }

  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const key of keys) {
    const [a, b] = key.split("-").map(Number);
    union(a, b);
  }

  const componentsOf = () => {
    const map = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      const root = find(i);
      const list = map.get(root);
      if (list) list.push(i);
      else map.set(root, [i]);
    }
    return Array.from(map.values());
  };

  let comps = componentsOf();
  while (comps.length > 1) {
    let bestA = comps[0][0];
    let bestB = comps[1][0];
    let bestD = Infinity;
    for (const a of comps[0]) {
      for (const b of comps[1]) {
        const d = dist(a, b);
        if (d < bestD) {
          bestD = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    keys.add(edgeKey(bestA, bestB));
    union(bestA, bestB);
    comps = componentsOf();
  }

  return Array.from(keys).map((k) => {
    const [from, to] = k.split("-").map(Number);
    return { from, to };
  });
};

const COLOR_BLUE: NodeColor = { r: 0, g: 113, b: 227 };
const COLOR_VIOLET: NodeColor = { r: 132, g: 92, b: 232 };
const COLOR_CYAN: NodeColor = { r: 30, g: 170, b: 220 };
const COLOR_GREEN: NodeColor = { r: 52, g: 168, b: 122 };
const COLOR_AMBER: NodeColor = { r: 220, g: 138, b: 60 };
const COLOR_SLATE: NodeColor = { r: 110, g: 118, b: 145 };

const EVENT_KINDS: EventKind[] = [
  {
    name: "set",
    color: COLOR_BLUE,
    shape: "dot",
    size: 1,
    speed: 1,
    weight: 4,
    payload: (seq) => `set:${seq}`,
  },
  {
    name: "inc",
    color: COLOR_CYAN,
    shape: "dot",
    size: 0.7,
    speed: 1.4,
    weight: 3,
    payload: () => "inc",
  },
  {
    name: "load",
    color: COLOR_VIOLET,
    shape: "square",
    size: 1.4,
    speed: 0.65,
    weight: 2,
    payload: (seq) => `load:${(seq * 17) % 240 + 60}ms`,
  },
  {
    name: "ok",
    color: COLOR_GREEN,
    shape: "diamond",
    size: 1.05,
    speed: 1.25,
    weight: 2,
    payload: () => "ok",
  },
  {
    name: "tick",
    color: COLOR_SLATE,
    shape: "dot",
    size: 0.55,
    speed: 1.5,
    weight: 3,
    payload: () => "tick",
  },
  {
    name: "err",
    color: COLOR_AMBER,
    shape: "triangle",
    size: 1.15,
    speed: 0.8,
    weight: 1,
    payload: (seq) => `err#${seq}`,
  },
];

const TOTAL_WEIGHT = EVENT_KINDS.reduce((acc, k) => acc + k.weight, 0);

const PULSE_COUNT = 7;
const BASE_SPEED_MIN = 0.07;
const BASE_SPEED_MAX = 0.14;
const PULSE_FADE = 0.16;
const TRAIL_LENGTH = 8;
const TRAIL_SPACING = 0.022;
const RIPPLE_LIFE = 1.4;
const RIPPLE_RADIUS = 60;
const STATE_LABEL_FONT = '9px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
const PULSE_LABEL_FONT = '9px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgba = (c: NodeColor, alpha: number) =>
  `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;

const pickKind = (rng: () => number): EventKind => {
  let r = rng() * TOTAL_WEIGHT;
  for (const k of EVENT_KINDS) {
    r -= k.weight;
    if (r <= 0) return k;
  }
  return EVENT_KINDS[0];
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: PulseShape,
  x: number,
  y: number,
  size: number,
) => {
  ctx.beginPath();
  if (shape === "dot") {
    ctx.arc(x, y, size, 0, Math.PI * 2);
  } else if (shape === "square") {
    const s = size * 1.55;
    ctx.rect(x - s / 2, y - s / 2, s, s);
  } else if (shape === "diamond") {
    const s = size * 1.55;
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  } else {
    const s = size * 1.8;
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.866, y + s * 0.5);
    ctx.lineTo(x - s * 0.866, y + s * 0.5);
    ctx.closePath();
  }
};

export function HeroBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rng = (() => {
      let seed = ((Date.now() ^ 0x9e3779b1) >>> 0) || 1;
      return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };
    })();

    const nodeLayout = generateNodes(rng);
    const edges = generateEdges(nodeLayout, rng);

    let setSeq = 1;
    const nextSeq = () => setSeq++;

    const makePulse = (): Pulse => {
      const kind = pickKind(rng);
      return {
        edgeIndex: Math.floor(rng() * edges.length),
        position: rng(),
        speed: lerp(BASE_SPEED_MIN, BASE_SPEED_MAX, rng()) * kind.speed,
        kind,
        label: kind.payload(nextSeq()),
      };
    };

    const nodes: Node[] = nodeLayout.map((node, id) => ({
      id,
      x: node.x,
      y: node.y,
      radius: node.radius,
      pulse: 0,
      phase: rng() * Math.PI * 2,
      driftAmpX: lerp(0.004, 0.012, rng()),
      driftAmpY: lerp(0.004, 0.012, rng()),
      driftSpeedX: lerp(0.18, 0.32, rng()),
      driftSpeedY: lerp(0.14, 0.28, rng()),
      driftPhaseX: rng() * Math.PI * 2,
      driftPhaseY: rng() * Math.PI * 2,
      stateIndex: node.state,
      stateChange: 0,
    }));
    const pulses: Pulse[] = Array.from({ length: PULSE_COUNT }, () => makePulse());
    const ripples: Ripple[] = [];
    const edgeGlow = new Array<number>(edges.length).fill(0);
    const edgeColor = new Array<NodeColor>(edges.length).fill(COLOR_BLUE);

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let lastTime = performance.now();
    let rafId = 0;

    const draw = (now: number) => {
      const dt = Math.min(48, now - lastTime) / 1000;
      lastTime = now;
      const t = now * 0.001;

      ctx.clearRect(0, 0, width, height);

      const positions = nodes.map((node) => {
        const dx = reduceMotion ? 0 : Math.sin(t * node.driftSpeedX + node.driftPhaseX) * node.driftAmpX;
        const dy = reduceMotion ? 0 : Math.cos(t * node.driftSpeedY + node.driftPhaseY) * node.driftAmpY;
        return { x: (node.x + dx) * width, y: (node.y + dy) * height };
      });

      ctx.lineCap = "round";

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const a = positions[edge.from];
        const b = positions[edge.to];
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, "rgba(20, 22, 36, 0.02)");
        grad.addColorStop(0.5, "rgba(20, 22, 36, 0.1)");
        grad.addColorStop(1, "rgba(20, 22, 36, 0.02)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        const glow = edgeGlow[i];
        if (glow > 0.02) {
          const c = edgeColor[i];
          const activeGrad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          activeGrad.addColorStop(0, rgba(c, 0));
          activeGrad.addColorStop(0.5, rgba(c, glow * 0.32));
          activeGrad.addColorStop(1, rgba(c, 0));
          ctx.strokeStyle = activeGrad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        edgeGlow[i] = Math.max(0, glow - dt * 0.7);
      }

      ctx.textBaseline = "middle";

      for (const pulse of pulses) {
        if (!reduceMotion) {
          pulse.position += pulse.speed * dt;
        }
        if (pulse.position >= 1) {
          const finishedEdge = edges[pulse.edgeIndex];
          const target = nodes[finishedEdge.to];
          const targetPos = positions[finishedEdge.to];
          target.pulse = 1;
          target.stateIndex = (target.stateIndex + 1) % NODE_STATES.length;
          target.stateChange = 1;
          ripples.push({
            x: targetPos.x,
            y: targetPos.y,
            age: 0,
            life: RIPPLE_LIFE,
            color: pulse.kind.color,
          });
          const next = makePulse();
          pulse.edgeIndex = next.edgeIndex;
          pulse.position = 0;
          pulse.speed = next.speed;
          pulse.kind = next.kind;
          pulse.label = next.label;
        }

        const edge = edges[pulse.edgeIndex];
        const from = positions[edge.from];
        const to = positions[edge.to];

        const fade = clamp01(
          Math.min(pulse.position / PULSE_FADE, (1 - pulse.position) / PULSE_FADE),
        );

        edgeGlow[pulse.edgeIndex] = Math.max(edgeGlow[pulse.edgeIndex], fade);
        edgeColor[pulse.edgeIndex] = pulse.kind.color;

        const baseSize = pulse.kind.size;

        for (let i = TRAIL_LENGTH - 1; i >= 1; i--) {
          const tt = pulse.position - i * TRAIL_SPACING;
          if (tt < 0 || tt > 1) continue;
          const trailFade = clamp01(
            Math.min(tt / PULSE_FADE, (1 - tt) / PULSE_FADE),
          );
          const k = 1 - i / TRAIL_LENGTH;
          const px = lerp(from.x, to.x, tt);
          const py = lerp(from.y, to.y, tt);
          ctx.fillStyle = rgba(pulse.kind.color, k * k * 0.5 * trailFade);
          ctx.beginPath();
          ctx.arc(px, py, 0.6 + k * 1.4 * baseSize, 0, Math.PI * 2);
          ctx.fill();
        }

        const headX = lerp(from.x, to.x, pulse.position);
        const headY = lerp(from.y, to.y, pulse.position);

        const haloR = 12 * baseSize;
        const halo = ctx.createRadialGradient(headX, headY, 0, headX, headY, haloR);
        halo.addColorStop(0, rgba(pulse.kind.color, 0.42 * fade));
        halo.addColorStop(1, rgba(pulse.kind.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(headX, headY, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(pulse.kind.color, 0.95 * fade);
        drawShape(ctx, pulse.kind.shape, headX, headY, 1.7 * baseSize);
        ctx.fill();
        ctx.strokeStyle = rgba(pulse.kind.color, 0.6 * fade);
        ctx.lineWidth = 0.8;
        ctx.stroke();

        if (fade > 0.25) {
          const labelAlpha = (fade - 0.25) / 0.75;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const offset = 9 + baseSize * 2;
          const lx = headX + nx * offset;
          const ly = headY + ny * offset;

          ctx.font = PULSE_LABEL_FONT;
          ctx.textAlign = "center";
          const textW = ctx.measureText(pulse.label).width;
          const padX = 4;
          const padY = 2;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.78 * labelAlpha})`;
          ctx.beginPath();
          const bx = lx - textW / 2 - padX;
          const by = ly - 6 - padY;
          const bw = textW + padX * 2;
          const bh = 12 + padY * 2;
          const br = 3;
          ctx.moveTo(bx + br, by);
          ctx.lineTo(bx + bw - br, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
          ctx.lineTo(bx + bw, by + bh - br);
          ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
          ctx.lineTo(bx + br, by + bh);
          ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
          ctx.lineTo(bx, by + br);
          ctx.quadraticCurveTo(bx, by, bx + br, by);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = rgba(pulse.kind.color, 0.4 * labelAlpha);
          ctx.lineWidth = 0.7;
          ctx.stroke();

          ctx.fillStyle = rgba(pulse.kind.color, 0.95 * labelAlpha);
          ctx.fillText(pulse.label, lx, ly);
        }
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        if (!reduceMotion) r.age += dt;
        const progress = r.age / r.life;
        if (progress >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const eased = 1 - (1 - progress) * (1 - progress);
        const radius = eased * RIPPLE_RADIUS;
        const alpha = (1 - progress) * 0.45;
        ctx.strokeStyle = rgba(r.color, alpha);
        ctx.lineWidth = 1 - progress * 0.6;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.font = STATE_LABEL_FONT;
      ctx.textAlign = "center";

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const center = positions[i];
        const breath = reduceMotion ? 0 : Math.sin(t * 0.9 + node.phase) * 0.5 + 0.5;
        const breathScale = 1 + breath * 0.12 + node.pulse * 0.5;
        const radius = node.radius * breathScale;
        const activation = Math.max(node.pulse, breath * 0.18);

        const halo = ctx.createRadialGradient(
          center.x,
          center.y,
          0,
          center.x,
          center.y,
          radius * 5.5,
        );
        halo.addColorStop(0, `rgba(0, 113, 227, ${0.06 + activation * 0.22})`);
        halo.addColorStop(1, "rgba(0, 113, 227, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle =
          node.pulse > 0.05
            ? `rgba(0, 113, 227, ${0.1 + node.pulse * 0.18})`
            : "rgba(20, 22, 36, 0.04)";
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle =
          node.pulse > 0.05
            ? `rgba(0, 97, 211, ${0.6 + node.pulse * 0.35})`
            : "rgba(20, 22, 36, 0.36)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle =
          node.pulse > 0.05
            ? `rgba(0, 97, 211, ${0.8 + node.pulse * 0.2})`
            : "rgba(20, 22, 36, 0.55)";
        ctx.beginPath();
        ctx.arc(center.x, center.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        const stateName = NODE_STATES[node.stateIndex];
        const labelY = center.y + radius + 10;
        const baseLabelAlpha = 0.42 + activation * 0.4;
        const flashAlpha = node.stateChange * 0.5;
        ctx.fillStyle = `rgba(20, 22, 36, ${baseLabelAlpha + flashAlpha})`;
        ctx.fillText(stateName, center.x, labelY);

        node.pulse = Math.max(0, node.pulse - dt * 0.7);
        node.stateChange = Math.max(0, node.stateChange - dt * 0.9);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(20, 22, 36, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 22, 36, 0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(circle at 75% 50%, black 0%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(circle at 75% 50%, black 0%, transparent 78%)",
        }}
      />

      <div
        className="absolute right-[-10%] top-[6%] size-[58%] rounded-full opacity-50 blur-3xl md:opacity-75"
        style={{
          background: "radial-gradient(circle, rgba(0, 113, 227, 0.38), transparent 65%)",
          animation: "hero-orb-drift 18s ease-in-out infinite",
        }}
      />
      <div
        className="absolute right-[15%] top-[40%] size-[42%] rounded-full opacity-40 blur-3xl md:opacity-65"
        style={{
          background: "radial-gradient(circle, rgba(132, 92, 232, 0.32), transparent 65%)",
          animation: "hero-orb-drift 24s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute bottom-[-12%] right-[8%] size-[40%] rounded-full opacity-30 blur-3xl md:opacity-45"
        style={{
          background: "radial-gradient(circle, rgba(96, 165, 250, 0.28), transparent 65%)",
          animation: "hero-orb-drift 28s ease-in-out infinite",
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0 size-full opacity-50 md:opacity-100" />

      <div
        className="absolute inset-0 bg-linear-to-b from-canvas via-canvas/82 to-transparent md:hidden"
      />
      <div
        className="absolute inset-0 hidden md:block"
        style={{
          background:
            "linear-gradient(to right, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 88%, transparent) 30%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{
          background: "linear-gradient(to bottom, transparent, var(--canvas-parchment))",
        }}
      />
    </div>
  );
}
