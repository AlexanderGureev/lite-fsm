"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { FSMContextProvider } from "@lite-fsm/react";
import {
  ActivityIcon,
  Gamepad2Icon,
  HeartPulseIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ShieldIcon,
  SwordsIcon,
  UsersRoundIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  createEntitiesRtsScene,
  RTS_CAMERA_ZOOM_EVENT,
  RTS_CANVAS,
  type PhaserApi,
  type RtsCameraZoomAction,
} from "./phaser-scene";
import { GAME_PRESETS, makeStore, useSelector, useTransition, type AppStore, type GameConfig } from "../store";
import type { RtsPresetId } from "../store";
import {
  createRtsMetricsAdapter,
  type MetricsAdapter,
  type RtsMetricsSnapshot,
  type RtsTimingStats,
} from "../store/metrics";
import { readRtsEntityStats, type RtsEntityStats } from "../store/selectors";

type GameLike = {
  destroy: (removeCanvas?: boolean, noReturn?: boolean) => void;
  scale?: {
    resize?: (width: number, height: number) => void;
  };
};

const presetEntries = Object.entries(GAME_PRESETS) as Array<[RtsPresetId, (typeof GAME_PRESETS)[RtsPresetId]]>;

const emptyStats: RtsEntityStats = {
  total: 0,
  allies: 0,
  enemies: 0,
  selected: 0,
  heroHp: 0,
  heroMaxHp: 0,
  heroAlive: false,
};

const emptyTimingStats: RtsTimingStats = {
  current: 0,
  average: 0,
  max: 0,
};

const emptyMetrics: RtsMetricsSnapshot = {
  version: 0,
  fps: emptyTimingStats,
  tick: emptyTimingStats,
  sync: emptyTimingStats,
  flowFieldRebuildMs: 0,
  spatialGridBuildMs: 0,
};

const formatCount = (value: number) => value.toLocaleString("en-US");

const formatFps = (value: number) => formatCount(Math.round(value));

const formatMs = (value: number) => {
  if (value >= 100) return `${value.toFixed(0)} ms`;
  if (value >= 10) return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} ms`;
};

const readCountInput = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const activePresetFor = (config: GameConfig) =>
  presetEntries.find(
    ([, preset]) =>
      preset.config.enemyCount === config.enemyCount &&
      preset.config.allyCount === config.allyCount &&
      preset.config.seed === config.seed,
  )?.[0];

const dispatchCameraZoom = (action: RtsCameraZoomAction) => {
  window.dispatchEvent(new CustomEvent(RTS_CAMERA_ZOOM_EVENT, { detail: { action } }));
};

function useRtsEntityStats(manager: AppStore, enabled: boolean) {
  const [stats, setStats] = useState<RtsEntityStats>(emptyStats);

  useEffect(() => {
    if (!enabled) {
      setStats(emptyStats);
      return;
    }

    let frame = 0;
    let lastRead = 0;

    const readStats = (time: number) => {
      if (time - lastRead >= 120) {
        setStats(readRtsEntityStats(manager.entities().get("unitActor")));
        lastRead = time;
      }

      frame = window.requestAnimationFrame(readStats);
    };

    setStats(readRtsEntityStats(manager.entities().get("unitActor")));
    frame = window.requestAnimationFrame(readStats);

    return () => window.cancelAnimationFrame(frame);
  }, [enabled, manager]);

  return stats;
}

function useRtsPerformanceMetrics(metrics: MetricsAdapter, enabled: boolean) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!enabled) return () => undefined;
      return metrics.subscribe(listener);
    },
    [enabled, metrics],
  );
  const getSnapshot = useCallback(() => (enabled ? metrics.getVersion() : 0), [enabled, metrics]);

  useSyncExternalStore(subscribe, getSnapshot, () => 0);

  return enabled ? metrics.readSnapshot() : emptyMetrics;
}

function CountInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-caption-strong text-ink-muted-80">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        onChange={(event) => onChange(readCountInput(event.target.value))}
        className="h-11 w-full rounded-lg border border-hairline bg-background px-3 text-body-strong text-ink outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}

function SeedInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-caption-strong text-ink-muted-80">seed</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-hairline bg-background px-3 text-body-strong text-ink outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/20"
      />
    </label>
  );
}

function TacticalPreview({ config }: { config: GameConfig }) {
  const enemyDots = Math.min(36, Math.max(8, Math.round(config.enemyCount / 280)));
  const allyDots = Math.min(18, Math.max(3, Math.round(config.allyCount / 18)));

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-hairline bg-[#111612]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[#f6e27a]/70 bg-[#f6e27a]/18 shadow-[0_0_0_6px_rgba(246,226,122,0.08)]" />
      {Array.from({ length: allyDots }, (_, index) => (
        <span
          key={`ally-${index}`}
          aria-hidden="true"
          className="absolute size-2.5 rounded-sm bg-[#59d6a3] shadow-[0_0_0_3px_rgba(89,214,163,0.14)]"
          style={{
            left: `${42 + (index % 6) * 4}%`,
            top: `${43 + Math.floor(index / 6) * 6}%`,
          }}
        />
      ))}
      {Array.from({ length: enemyDots }, (_, index) => (
        <span
          key={`enemy-${index}`}
          aria-hidden="true"
          className="absolute size-2 rounded-full bg-[#ff6f61] shadow-[0_0_0_2px_rgba(255,111,97,0.16)]"
          style={{
            left: `${8 + ((index * 17) % 84)}%`,
            top: `${10 + ((index * 29) % 80)}%`,
          }}
        />
      ))}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2">
        <Badge className="rounded-md bg-[#59d6a3] text-[#09271a]">allies {formatCount(config.allyCount)}</Badge>
        <Badge className="rounded-md bg-[#ff6f61] text-[#2d0906]">enemies {formatCount(config.enemyCount)}</Badge>
      </div>
    </div>
  );
}

function StartScreen() {
  const transition = useTransition();
  const config = useSelector((state) => state.gameSession.context.config);
  const activePreset = activePresetFor(config);
  const isHeavyRun = config.enemyCount >= 10_000;

  return (
    <Card className="mx-auto my-8 w-[calc(100%-2rem)] max-w-6xl gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline sm:my-12">
      <CardHeader className="grid gap-4 border-b border-hairline px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
        <div>
          <CardDescription className="text-caption-strong text-primary">Entities + Phaser</CardDescription>
          <CardTitle className="mt-1 text-tagline text-ink">RTS stress test</CardTitle>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md bg-canvas-parchment text-ink-muted-80">
          <Gamepad2Icon data-icon="inline-start" />
          setup
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-0 p-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-6 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {presetEntries.map(([id, preset]) => (
              <Button
                key={id}
                type="button"
                variant={activePreset === id ? "default" : "outline"}
                onClick={() => transition({ type: "GAME_CONFIG_CHANGED", payload: preset.config })}
                className="h-auto min-h-20 flex-col items-start rounded-lg px-4 py-3 text-left whitespace-normal"
              >
                <span className="text-body-strong">{preset.label}</span>
                <span className="text-caption opacity-75">{preset.description}</span>
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CountInput
              label="enemy count"
              min={0}
              value={config.enemyCount}
              onChange={(enemyCount) => transition({ type: "GAME_CONFIG_CHANGED", payload: { enemyCount } })}
            />
            <CountInput
              label="ally count"
              min={1}
              value={config.allyCount}
              onChange={(allyCount) => transition({ type: "GAME_CONFIG_CHANGED", payload: { allyCount } })}
            />
            <div className="sm:col-span-2">
              <SeedInput
                value={config.seed}
                onChange={(seed) => transition({ type: "GAME_CONFIG_CHANGED", payload: { seed } })}
              />
            </div>
          </div>

          <p className="text-caption text-ink-muted-48">
            Recommended: enemies 100-20,000; allies 1-1,000. Larger values are allowed and only warn before launch.
          </p>

          {isHeavyRun ? (
            <div className="rounded-lg border border-[#d9952b]/40 bg-[#fff2d8] px-4 py-3 text-caption text-[#5a3800]">
              High enemy counts are allowed; frame rate depends on local hardware.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => transition({ type: "GAME_START", payload: config })}
              className="h-11 min-w-36 rounded-pill px-5 text-button-large"
            >
              <PlayIcon data-icon="inline-start" />
              launch
            </Button>
            <span className="text-caption text-ink-muted-48">
              {formatCount(config.enemyCount + config.allyCount + 1)} entities including hero
            </span>
          </div>
        </section>

        <aside className="border-t border-hairline p-5 sm:p-6 lg:border-l lg:border-t-0">
          <TacticalPreview config={config} />
          <div className="mt-5 grid gap-3 text-caption text-ink-muted-48">
            <div className="flex items-center justify-between gap-3">
              <span>seed</span>
              <span className="max-w-44 truncate text-body-strong text-ink">{config.seed}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span>preset</span>
              <span className="text-body-strong text-ink">{activePreset ?? "custom"}</span>
            </div>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

function PhaserCanvas({ manager, metrics }: { manager: AppStore; metrics: MetricsAdapter }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let game: GameLike | undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const readContainerSize = () => ({
      width: Math.max(1, Math.floor(container.clientWidth || RTS_CANVAS.width)),
      height: Math.max(1, Math.floor(container.clientHeight || RTS_CANVAS.height)),
    });
    const resizeGame = () => {
      const size = readContainerSize();
      game?.scale?.resize?.(size.width, size.height);
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resizeGame);

    container.addEventListener("contextmenu", preventContextMenu);
    resizeObserver?.observe(container);
    window.addEventListener("resize", resizeGame);

    const mountGame = async () => {
      const Phaser = (await import("phaser")) as PhaserApi;
      if (disposed || !containerRef.current) return;
      const size = readContainerSize();

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: size.width,
        height: size.height,
        backgroundColor: "#101612",
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: false,
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
        },
        scene: createEntitiesRtsScene(Phaser, manager, metrics),
      }) as GameLike;
      resizeGame();
    };

    void mountGame();

    return () => {
      disposed = true;
      container.removeEventListener("contextmenu", preventContextMenu);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resizeGame);
      game?.destroy(true);
    };
  }, [manager, metrics]);

  return <div ref={containerRef} className="absolute inset-0 [&>canvas]:block" />;
}

function HudRow({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-[#253329] text-[#66f0a7] [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-caption text-[#b8c5bd]">{label}</span>
      <span className="text-right text-caption-strong text-[#f4faf5]">
        {value}
        {detail ? <span className="ml-2 text-caption font-normal text-[#b8c5bd]">{detail}</span> : null}
      </span>
    </div>
  );
}

function TimingRow({
  label,
  stats,
  format,
}: {
  label: string;
  stats: RtsTimingStats;
  format: (value: number) => string;
}) {
  return (
    <div className="grid gap-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-[#b8c5bd]">{label}</span>
        <span className="text-caption-strong text-[#f4faf5]">{format(stats.current)}</span>
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-caption text-[#819289]">
        <span>avg {format(stats.average)}</span>
        <span>max {format(stats.max)}</span>
      </div>
    </div>
  );
}

function MetricValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-caption text-[#b8c5bd]">{label}</span>
      <span className="text-caption-strong text-[#f4faf5]">{value}</span>
    </div>
  );
}

function OverlaySeparator() {
  return <div className="h-px bg-[#d7f6e0]/12" />;
}

function ArmedShell({ manager, metrics }: { manager: AppStore; metrics: MetricsAdapter }) {
  const transition = useTransition();
  const state = useSelector((snapshot) => snapshot.gameSession);
  const config = state.context.config;
  const isPaused = state.state === "PAUSED";
  const isGameOver = state.state === "GAME_OVER";
  const stats = useRtsEntityStats(manager, state.state !== "CONFIGURING");
  const performanceMetrics = useRtsPerformanceMetrics(metrics, state.state !== "CONFIGURING");
  const heroPercent = stats.heroMaxHp > 0 ? Math.max(0, Math.round((stats.heroHp / stats.heroMaxHp) * 100)) : 0;
  const statusLabel = isGameOver ? "GAME OVER" : isPaused ? "PAUSED" : "LIVE";

  return (
    <section className="relative min-h-[calc(100svh-6.5rem)] w-full overflow-hidden bg-[#101612]">
      <PhaserCanvas manager={manager} metrics={metrics} />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-3 p-3 sm:p-4 lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 px-3 py-2 text-[#f4faf5] shadow-product">
            <div className="min-w-0 pr-1">
              <p className="text-fine-print font-semibold tracking-[0.08em] text-[#66f0a7] uppercase">
                Entities + Phaser
              </p>
              <p className="truncate text-caption-strong text-[#f4faf5]">RTS stress test</p>
            </div>
            <span
              className={cn(
                "inline-flex h-7 items-center rounded-pill px-2.5 text-fine-print font-semibold",
                !isPaused && !isGameOver && "bg-[#66f0a7]/16 text-[#9cf4c3]",
                isPaused && "bg-[#f6e27a]/18 text-[#f6e27a]",
                isGameOver && "bg-[#ff786b]/18 text-[#ff9a90]",
              )}
            >
              {statusLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => transition({ type: isPaused ? "GAME_RESUME" : "GAME_PAUSE" })}
              disabled={isGameOver}
              className="h-9 rounded-pill bg-[#f4faf5] px-3 text-caption-strong text-[#151916] hover:bg-[#d8f4e4]"
            >
              {isPaused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
              {isPaused ? "resume" : "pause"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => transition({ type: "GAME_RESTART" })}
              className="h-9 rounded-pill border border-[#d7f6e0]/20 bg-[#1d241f] px-3 text-caption-strong text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5]"
            >
              <RotateCcwIcon data-icon="inline-start" />
              configure
            </Button>
            <div className="flex items-center gap-1 rounded-pill border border-[#d7f6e0]/16 bg-[#1d241f] p-1">
              <Button
                type="button"
                variant="ghost"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => dispatchCameraZoom("out")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <ZoomOutIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Reset zoom"
                title="Reset zoom"
                onClick={() => dispatchCameraZoom("reset")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <RotateCcwIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => dispatchCameraZoom("in")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <ZoomInIcon />
              </Button>
            </div>
          </div>

          <aside className="pointer-events-auto hidden max-h-[calc(100svh-8rem)] w-[21rem] overflow-y-auto rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 p-4 text-[#f4faf5] shadow-product md:block">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-caption-strong text-[#f4faf5]">Hero base</p>
                <span className="rounded-md border border-[#d7f6e0]/18 px-2 py-0.5 text-caption-strong text-[#f4faf5]">
                  {heroPercent}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-pill bg-[#253329]">
                <div
                  className={cn(
                    "h-full rounded-pill transition-all",
                    heroPercent <= 25 ? "bg-[#ff786b]" : "bg-[#66f0a7]",
                  )}
                  style={{ width: `${heroPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col">
              <HudRow
                icon={<HeartPulseIcon />}
                label="HP"
                value={`${formatCount(stats.heroHp)}/${formatCount(stats.heroMaxHp)}`}
                detail={stats.heroAlive ? "alive" : "down"}
              />
              <OverlaySeparator />
              <HudRow icon={<ActivityIcon />} label="entities" value={formatCount(stats.total)} />
              <OverlaySeparator />
              <HudRow icon={<SwordsIcon />} label="enemies" value={formatCount(stats.enemies)} />
              <OverlaySeparator />
              <HudRow icon={<UsersRoundIcon />} label="allies" value={formatCount(stats.allies)} />
              <OverlaySeparator />
              <HudRow icon={<ShieldIcon />} label="selected" value={formatCount(stats.selected)} />
            </div>

            <OverlaySeparator />

            <div className="mt-3 grid gap-1">
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-caption-strong text-[#f4faf5]">Metrics</p>
                <span className="rounded-md border border-[#d7f6e0]/18 px-2 py-0.5 text-caption text-[#b8c5bd]">
                  120 frames
                </span>
              </div>
              <TimingRow label="FPS" stats={performanceMetrics.fps} format={formatFps} />
              <OverlaySeparator />
              <TimingRow label="TICK transition" stats={performanceMetrics.tick} format={formatMs} />
              <OverlaySeparator />
              <TimingRow label="Phaser sync/render" stats={performanceMetrics.sync} format={formatMs} />
              <OverlaySeparator />
              <MetricValueRow label="flow field rebuild" value={formatMs(performanceMetrics.flowFieldRebuildMs)} />
              <OverlaySeparator />
              <MetricValueRow label="spatial grid build" value={formatMs(performanceMetrics.spatialGridBuildMs)} />
            </div>

            <OverlaySeparator />

            <div className="mt-3 grid gap-3 text-caption text-[#b8c5bd]">
              <div className="flex items-center justify-between gap-3">
                <span>seed</span>
                <span className="max-w-44 truncate text-caption-strong text-[#f4faf5]">{config.seed}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>configured enemies</span>
                <span className="text-caption-strong text-[#f4faf5]">{formatCount(config.enemyCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>runs</span>
                <span className="text-caption-strong text-[#f4faf5]">{state.context.startedRuns}</span>
              </div>
            </div>
          </aside>
        </div>

        <div className="pointer-events-auto grid gap-3 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 p-3 text-[#f4faf5] shadow-product md:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption-strong">Hero base</span>
            <span className="text-caption-strong">{heroPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-[#253329]">
            <div
              className={cn("h-full rounded-pill transition-all", heroPercent <= 25 ? "bg-[#ff786b]" : "bg-[#66f0a7]")}
              style={{ width: `${heroPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-fine-print text-[#819289]">units</p>
              <p className="text-caption-strong">{formatCount(stats.total)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">enemies</p>
              <p className="text-caption-strong">{formatCount(stats.enemies)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">allies</p>
              <p className="text-caption-strong">{formatCount(stats.allies)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">selected</p>
              <p className="text-caption-strong">{formatCount(stats.selected)}</p>
            </div>
          </div>
        </div>
      </div>

      {isPaused ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#101612]/72 px-4 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/94 px-8 py-7 text-[#f4faf5] shadow-product">
            <span className="rounded-md bg-[#f6e27a]/18 px-2.5 py-1 text-caption-strong text-[#f6e27a]">PAUSED</span>
            <p className="text-tagline text-[#f4faf5]">Simulation paused</p>
            <Button type="button" onClick={() => transition({ type: "GAME_RESUME" })} className="rounded-pill">
              <PlayIcon data-icon="inline-start" />
              resume
            </Button>
          </div>
        </div>
      ) : null}

      {isGameOver ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#101612]/78 px-4 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/94 px-8 py-7 text-[#f4faf5] shadow-product">
            <span className="rounded-md bg-[#ff786b]/18 px-2.5 py-1 text-caption-strong text-[#ff9a90]">GAME OVER</span>
            <p className="text-tagline text-[#f4faf5]">Hero base destroyed</p>
            <Button type="button" onClick={() => transition({ type: "GAME_RESTART" })} className="rounded-pill">
              <RotateCcwIcon data-icon="inline-start" />
              configure
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GameShell({ manager, metrics }: { manager: AppStore; metrics: MetricsAdapter }) {
  const status = useSelector((state) => state.gameSession.state);
  if (status === "CONFIGURING") return <StartScreen />;
  return <ArmedShell manager={manager} metrics={metrics} />;
}

export function Game() {
  const metrics = useMemo(() => createRtsMetricsAdapter(() => performance.now()), []);
  const manager = useMemo<AppStore>(
    () =>
      makeStore({
        metrics,
        random: Math.random,
        renderer: { reset: () => undefined },
      }),
    [metrics],
  );

  return (
    <FSMContextProvider machineManager={manager}>
      <GameShell manager={manager} metrics={metrics} />
    </FSMContextProvider>
  );
}
