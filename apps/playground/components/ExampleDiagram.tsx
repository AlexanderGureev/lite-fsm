import type { ExampleIconKey } from "@/lib/examples-manifest";
import { cn } from "@/lib/utils";

type DiagramProps = {
  variant: ExampleIconKey;
  className?: string;
};

const VIEW = "0 0 120 56";

export function ExampleDiagram({ variant, className }: DiagramProps) {
  return (
    <svg
      aria-hidden
      viewBox={VIEW}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      <DiagramContent variant={variant} />
    </svg>
  );
}

const inkStroke = "stroke-ink-muted-48/55";
const inkFill = "fill-ink-muted-48/55";
const accentStroke = "stroke-current";
const accentFill = "fill-current";

function DiagramContent({ variant }: { variant: ExampleIconKey }) {
  if (variant === "lamp") {
    return (
      <g>
        <path d="M36 28 C 56 12, 64 12, 84 28" className={inkStroke} strokeWidth={1} />
        <path d="M84 28 C 64 44, 56 44, 36 28" className={accentStroke} strokeWidth={1.25} />
        <Node cx={36} cy={28} r={6} muted />
        <Node cx={84} cy={28} r={6} active />
      </g>
    );
  }

  if (variant === "heart") {
    return (
      <g>
        <path d="M33 28 H 54" className={inkStroke} strokeWidth={1} />
        <path d="M66 28 C 80 14, 92 14, 100 18" className={accentStroke} strokeWidth={1.25} strokeDasharray="2 2" />
        <path d="M66 28 C 80 42, 92 42, 100 38" className={inkStroke} strokeWidth={1} strokeDasharray="2 2" />
        <Node cx={28} cy={28} r={5} muted />
        <Node cx={60} cy={28} r={6} active />
        <Tick cx={108} cy={18} />
        <Cross cx={108} cy={38} />
      </g>
    );
  }

  if (variant === "actors") {
    return (
      <g>
        <path d="M30 18 L60 38 L90 18 Z" className={inkStroke} strokeWidth={1} />
        <path d="M30 18 L60 38" className={accentStroke} strokeWidth={1.5} />
        <circle cx={45} cy={28} r={1.6} className={accentFill} />
        <Node cx={30} cy={18} r={5} active />
        <Node cx={60} cy={38} r={5} active />
        <Node cx={90} cy={18} r={5} muted />
      </g>
    );
  }

  if (variant === "network") {
    return (
      <g>
        <rect x={10} y={10} width={36} height={36} rx={3} className={inkStroke} strokeWidth={0.75} strokeDasharray="2 2" />
        <rect x={74} y={10} width={36} height={36} rx={3} className={inkStroke} strokeWidth={0.75} strokeDasharray="2 2" />
        <path d="M46 28 L74 28" className={accentStroke} strokeWidth={1.25} />
        <polygon points="74,25 74,31 78,28" className={accentFill} />
        <polygon points="46,25 46,31 42,28" className={accentFill} />
        <Node cx={28} cy={20} r={3.5} muted />
        <Node cx={28} cy={36} r={3.5} active />
        <Node cx={92} cy={20} r={3.5} active />
        <Node cx={92} cy={36} r={3.5} muted />
      </g>
    );
  }

  if (variant === "gamepad") {
    const cx = 60;
    const cy = 28;
    const ring = [0, 60, 120, 180, 240, 300].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: cx + Math.cos(rad) * 22, y: cy + Math.sin(rad) * 14 };
    });
    return (
      <g>
        {ring.map((p, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            className={i % 2 === 0 ? accentStroke : inkStroke}
            strokeWidth={i % 2 === 0 ? 1 : 0.75}
          />
        ))}
        {ring.map((p, i) => (
          <Node key={`n-${i}`} cx={p.x} cy={p.y} r={3.5} active={i % 2 === 0} muted={i % 2 !== 0} />
        ))}
        <Node cx={cx} cy={cy} r={5} active />
      </g>
    );
  }

  if (variant === "download") {
    return (
      <g>
        <rect x={12} y={19} width={22} height={18} rx={3} className={accentStroke} strokeWidth={1.2} />
        <circle cx={23} cy={28} r={3.2} className={accentFill} opacity={0.22} />
        <circle cx={23} cy={28} r={1.4} className={accentFill} />

        <path d="M34 28 H43 V14 H52" className={inkStroke} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M34 28 H52" className={accentStroke} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M34 28 H43 V42 H52" className={inkStroke} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />

        <Node cx={56} cy={14} r={3.5} muted />
        <Node cx={56} cy={28} r={3.8} active />
        <Node cx={56} cy={42} r={3.5} muted />

        <path d="M66 14 H102" className={inkStroke} strokeWidth={0.9} strokeLinecap="round" opacity={0.48} />
        <path d="M66 28 H102" className={inkStroke} strokeWidth={0.9} strokeLinecap="round" opacity={0.48} />
        <path d="M66 42 H102" className={inkStroke} strokeWidth={0.9} strokeLinecap="round" opacity={0.48} />
        <path d="M66 14 H84" className={accentStroke} strokeWidth={2.2} strokeLinecap="round" />
        <path d="M66 28 H94" className={accentStroke} strokeWidth={2.2} strokeLinecap="round" />
        <path d="M66 42 H78" className={accentStroke} strokeWidth={2.2} strokeLinecap="round" />

        <path d="M18 49 H102" className={inkStroke} strokeWidth={0.8} strokeLinecap="round" opacity={0.4} />
        <path d="M18 49 H74" className={accentStroke} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    );
  }

  if (variant === "persist") {
    return (
      <g>
        <rect x={9} y={9} width={28} height={26} rx={3} className={inkStroke} strokeWidth={0.8} />
        <rect x={83} y={9} width={28} height={26} rx={3} className={inkStroke} strokeWidth={0.8} />

        <rect x={48} y={15} width={24} height={22} rx={3} className={accentStroke} strokeWidth={1.1} />
        <path d="M53 23 H67" className={accentStroke} strokeWidth={1.3} strokeLinecap="round" />
        <path d="M53 29 H63" className={inkStroke} strokeWidth={1} strokeLinecap="round" />

        <path d="M38.5 19 H43.5" className={accentStroke} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M73.5 19 H78.5" className={accentStroke} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M81.5 30 H76.5" className={inkStroke} strokeWidth={1} strokeLinecap="round" />
        <path d="M46.5 30 H41.5" className={inkStroke} strokeWidth={1} strokeLinecap="round" />
        <polygon points="43.5,16 43.5,22 47.5,19" className={accentFill} />
        <polygon points="78.5,16 78.5,22 82.5,19" className={accentFill} />
        <polygon points="76.5,27 76.5,33 72.5,30" className={inkFill} />
        <polygon points="41.5,27 41.5,33 37.5,30" className={inkFill} />

        <Node cx={23} cy={22} r={3.5} active />
        <Node cx={97} cy={22} r={3.5} muted />
        <circle cx={60} cy={46} r={3.4} className={accentStroke} strokeWidth={1.1} />
        <circle cx={60} cy={46} r={1.2} className={accentFill} />
      </g>
    );
  }

  if (variant === "streaming") {
    return (
      <g>
        <line x1={44} y1={12} x2={44} y2={24} className={accentStroke} strokeWidth={1} />
        <circle cx={44} cy={9} r={1.8} className={accentFill} />

        <line x1={68} y1={32} x2={68} y2={44} className={inkStroke} strokeWidth={1} />
        <circle cx={68} cy={47} r={1.8} className={inkFill} />

        <path d="M20 28 H 92" className={inkStroke} strokeWidth={1} strokeDasharray="2 3" />
        <polygon points="100,25 100,31 104,28" className={accentFill} />

        <Node cx={20} cy={28} r={4} active />
        <Node cx={44} cy={28} r={4} active />
        <Node cx={68} cy={28} r={4} muted />
        <Node cx={92} cy={28} r={4} muted />
      </g>
    );
  }

  if (variant === "grid") {
    const cells = [
      { x: 24, y: 8 },
      { x: 52, y: 8 },
      { x: 80, y: 8 },
      { x: 24, y: 24 },
      { x: 52, y: 24 },
      { x: 80, y: 24 },
      { x: 24, y: 40 },
      { x: 52, y: 40 },
      { x: 80, y: 40 },
    ];
    const hot = new Set([0, 4, 8]);
    return (
      <g>
        {cells.map((c, i) => (
          <rect
            key={i}
            x={c.x}
            y={c.y}
            width={16}
            height={10}
            rx={1.5}
            strokeWidth={0.75}
            className={hot.has(i) ? accentStroke : inkStroke}
            fill={hot.has(i) ? "currentColor" : "transparent"}
            fillOpacity={hot.has(i) ? 0.18 : 0}
          />
        ))}
      </g>
    );
  }

  return (
    <g>
      <rect
        x={14}
        y={10}
        width={92}
        height={36}
        rx={3}
        className={accentStroke}
        strokeWidth={0.75}
        strokeDasharray="3 3"
      />
      <line x1={20} y1={20} x2={28} y2={20} className={accentStroke} strokeWidth={1} />
      <line x1={20} y1={28} x2={36} y2={28} className={accentStroke} strokeWidth={1} />
      <line x1={20} y1={36} x2={26} y2={36} className={accentStroke} strokeWidth={1} />
      <Node cx={84} cy={20} r={3.5} active />
      <Node cx={84} cy={36} r={3.5} active />
      <Node cx={96} cy={28} r={4.5} active />
    </g>
  );
}

function Node({
  cx,
  cy,
  r,
  active,
  muted,
}: {
  cx: number;
  cy: number;
  r: number;
  active?: boolean;
  muted?: boolean;
}) {
  const stroke = active ? accentStroke : inkStroke;
  const dot = active ? accentFill : inkFill;
  return (
    <g>
      {active ? (
        <circle cx={cx} cy={cy} r={r + 3} className={accentFill} opacity={0.16} />
      ) : null}
      <circle cx={cx} cy={cy} r={r} strokeWidth={1.25} className={stroke} fill="white" />
      <circle cx={cx} cy={cy} r={r * 0.32} className={dot} opacity={muted ? 0.7 : 1} />
    </g>
  );
}

function Tick({ cx, cy }: { cx: number; cy: number }) {
  return (
    <path
      d={`M${cx - 3} ${cy} L${cx - 1} ${cy + 2} L${cx + 3} ${cy - 3}`}
      className={accentStroke}
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Cross({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className={inkStroke} strokeWidth={1.25} strokeLinecap="round">
      <line x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3} />
      <line x1={cx + 3} y1={cy - 3} x2={cx - 3} y2={cy + 3} />
    </g>
  );
}
