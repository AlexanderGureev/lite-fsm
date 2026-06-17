"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  ActivityIcon,
  GaugeIcon,
  Gamepad2Icon,
  HeartPulseIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
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

import { RTS_CAMERA_ZOOM_EVENT, type RtsCameraZoomAction } from "./phaser-scene";
import { GAME_PRESETS, useSelector, useTransition, type AppStore, type GameConfig } from "../store";
import type { RtsPresetId } from "../store";
import type { MetricsAdapter, RtsMetricsSnapshot, RtsTimingStats } from "../store/metrics";
import { readRtsEntityStats, readUnitViews, type RtsEntityStats } from "../store/selectors";
import type { RtsApp } from "../app";

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
  min: 0,
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

const formatCount = (value: number) => value.toLocaleString("ru-RU");

const formatFps = (value: number) => formatCount(Math.round(value));

const formatMs = (value: number) => {
  if (value >= 100) return `${value.toFixed(0)} мс`;
  if (value >= 10) return `${value.toFixed(1)} мс`;
  return `${value.toFixed(2)} мс`;
};

const readCountInput = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const activePresetFor = (config: GameConfig) =>
  presetEntries.find(([, preset]) => {
    const presetConfig: GameConfig = preset.config;

    return (
      presetConfig.enemyCount === config.enemyCount &&
      presetConfig.allyCount === config.allyCount &&
      presetConfig.seed === config.seed &&
      presetConfig.playerUnitHp === config.playerUnitHp
    );
  })?.[0];

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
        setStats(readRtsEntityStats(readUnitViews(manager)));
        lastRead = time;
      }

      frame = window.requestAnimationFrame(readStats);
    };

    setStats(readRtsEntityStats(readUnitViews(manager)));
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
      <span className="text-caption-strong text-ink-muted-80">Сид</span>
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
        <Badge className="rounded-md bg-[#59d6a3] text-[#09271a]">союзники {formatCount(config.allyCount)}</Badge>
        <Badge className="rounded-md bg-[#ff6f61] text-[#2d0906]">враги {formatCount(config.enemyCount)}</Badge>
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
          <CardTitle className="mt-1 text-tagline text-ink">Стресс-тест RTS</CardTitle>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md bg-canvas-parchment text-ink-muted-80">
          <Gamepad2Icon data-icon="inline-start" />
          настройка
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
              label="Враги"
              min={0}
              value={config.enemyCount}
              onChange={(enemyCount) => transition({ type: "GAME_CONFIG_CHANGED", payload: { enemyCount } })}
            />
            <CountInput
              label="Союзники"
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
            Рекомендуется: врагов 100–20 000, союзников 1–1 000. Большие значения допустимы и лишь предупреждают перед
            запуском.
          </p>

          {isHeavyRun ? (
            <div className="rounded-lg border border-[#d9952b]/40 bg-[#fff2d8] px-4 py-3 text-caption text-[#5a3800]">
              Большое число врагов допустимо; частота кадров зависит от вашего железа.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => transition({ type: "GAME_START", payload: config })}
              className="h-11 min-w-36 rounded-pill px-5 text-button-large"
            >
              <PlayIcon data-icon="inline-start" />
              Запустить
            </Button>
            <span className="text-caption text-ink-muted-48">
              {formatCount(config.enemyCount + config.allyCount + 1)} сущностей вместе с базой героя
            </span>
          </div>
        </section>

        <aside className="border-t border-hairline p-5 sm:p-6 lg:border-l lg:border-t-0">
          <TacticalPreview config={config} />
          <div className="mt-5 grid gap-3 text-caption text-ink-muted-48">
            <div className="flex items-center justify-between gap-3">
              <span>сид</span>
              <span className="max-w-44 truncate text-body-strong text-ink">{config.seed}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span>пресет</span>
              <span className="text-body-strong text-ink">{activePreset ?? "свой"}</span>
            </div>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

function PhaserCanvas({ app }: { app: RtsApp }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    return app.mountScene(container);
  }, [app]);

  return <div ref={containerRef} className="absolute inset-0 [&>canvas]:block" />;
}

function HudRow({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 py-1">
      <span className="flex size-6 items-center justify-center rounded-md bg-[#253329] text-[#66f0a7] [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="text-caption text-[#b8c5bd]">{label}</span>
      <span className="text-right text-caption-strong text-[#f4faf5]">
        {value}
        {detail ? <span className="ml-1.5 text-fine-print font-normal text-[#819289]">{detail}</span> : null}
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
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-[#b8c5bd]">{label}</span>
        <span className="text-caption-strong text-[#f4faf5]">{format(stats.current)}</span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-fine-print text-[#819289]">
        <span>мин {format(stats.min)}</span>
        <span className="text-center">сред {format(stats.average)}</span>
        <span className="text-right">макс {format(stats.max)}</span>
      </div>
    </div>
  );
}

function MetricValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-caption text-[#b8c5bd]">{label}</span>
      <span className="text-caption-strong text-[#f4faf5]">{value}</span>
    </div>
  );
}

function ArmedShell({ app }: { app: RtsApp }) {
  const manager = app.store;
  const metrics = app.metrics;
  const transition = useTransition();
  const state = useSelector((snapshot) => snapshot.gameSession);
  const spawnState = useSelector((snapshot) => snapshot.gameSpawn);
  const config = state.context.config;
  const isSpawning = state.state === "SPAWNING";
  const isPaused = state.state === "PAUSED";
  const isGameOver = state.state === "GAME_OVER";
  const [statsOpen, setStatsOpen] = useState(false);
  const stats = useRtsEntityStats(manager, state.state !== "CONFIGURING");
  const performanceMetrics = useRtsPerformanceMetrics(metrics, state.state !== "CONFIGURING");
  const heroPercent = stats.heroMaxHp > 0 ? Math.max(0, Math.round((stats.heroHp / stats.heroMaxHp) * 100)) : 0;
  const spawnTarget = spawnState.context.targetPlayerUnitCount + spawnState.context.targetEnemyCount;
  const spawnedPlayerUnits = spawnState.context.spawnedPlayerUnitCount;
  const spawnedEnemies = spawnState.context.spawnedEnemyCount;
  const spawnedUnits = spawnedPlayerUnits + spawnedEnemies;
  const spawnProgress = spawnTarget > 0 ? Math.min(100, Math.round((spawnedUnits / spawnTarget) * 100)) : 100;
  const statusLabel = isGameOver ? "ПОРАЖЕНИЕ" : isPaused ? "ПАУЗА" : isSpawning ? "СПАВН" : "АКТИВНО";
  const enemySpawnDetail =
    spawnState.state === "IDLE" ? "готово" : `${formatCount(spawnState.context.enemyBatchSize)}/батч`;
  const playerSpawnDetail =
    spawnState.state === "IDLE" ? "готово" : `${formatCount(spawnState.context.playerBatchSize)}/батч`;
  const activeSpawnBatchSize =
    spawnedPlayerUnits < spawnState.context.targetPlayerUnitCount
      ? spawnState.context.playerBatchSize
      : spawnState.context.enemyBatchSize;

  return (
    <section className="relative min-h-[calc(100svh-6.5rem)] w-full overflow-hidden bg-[#101612]">
      <PhaserCanvas app={app} />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-3 p-3 sm:p-4 lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 px-3 py-2 text-[#f4faf5] shadow-product">
            <div className="min-w-0 pr-1">
              <p className="text-fine-print font-semibold tracking-[0.08em] text-[#66f0a7] uppercase">
                Entities + Phaser
              </p>
              <p className="truncate text-caption-strong text-[#f4faf5]">Стресс-тест RTS</p>
            </div>
            <span
              className={cn(
                "inline-flex h-7 items-center rounded-pill px-2.5 text-fine-print font-semibold",
                !isPaused && !isGameOver && !isSpawning && "bg-[#66f0a7]/16 text-[#9cf4c3]",
                isSpawning && "bg-[#8fd4ff]/16 text-[#b7e6ff]",
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
              disabled={isGameOver || isSpawning}
              className="h-9 rounded-pill bg-[#f4faf5] px-3 text-caption-strong text-[#151916] hover:bg-[#d8f4e4]"
            >
              {isPaused ? <PlayIcon data-icon="inline-start" /> : <PauseIcon data-icon="inline-start" />}
              {isPaused ? "Продолжить" : "Пауза"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => transition({ type: "GAME_RESTART" })}
              className="h-9 rounded-pill border border-[#d7f6e0]/20 bg-[#1d241f] px-3 text-caption-strong text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5]"
            >
              <RotateCcwIcon data-icon="inline-start" />
              Настроить
            </Button>
            <div className="flex items-center gap-1 rounded-pill border border-[#d7f6e0]/16 bg-[#1d241f] p-1">
              <Button
                type="button"
                variant="ghost"
                aria-label="Отдалить"
                title="Отдалить"
                onClick={() => dispatchCameraZoom("out")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <ZoomOutIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Сбросить масштаб"
                title="Сбросить масштаб"
                onClick={() => dispatchCameraZoom("reset")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <RotateCcwIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Приблизить"
                title="Приблизить"
                onClick={() => dispatchCameraZoom("in")}
                className="size-7 rounded-pill text-[#f4faf5] hover:bg-[#29332c] hover:text-[#f4faf5] [&_svg]:size-4"
              >
                <ZoomInIcon />
              </Button>
            </div>
          </div>

          {statsOpen ? (
            <aside className="pointer-events-auto hidden max-h-[calc(100svh-7rem)] w-72 overflow-y-auto rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 p-3 text-[#f4faf5] shadow-product md:block">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <p className="text-caption-strong text-[#f4faf5]">Сводка</p>
                <button
                  type="button"
                  onClick={() => setStatsOpen(false)}
                  aria-label="Свернуть панель"
                  title="Свернуть панель"
                  className="flex size-6 items-center justify-center rounded-md border border-[#d7f6e0]/18 text-[#b8c5bd] transition hover:bg-[#1d241f] hover:text-[#f4faf5] [&_svg]:size-3.5"
                >
                  <PanelRightCloseIcon />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-caption text-[#b8c5bd]">База героя</p>
                <span className="text-caption-strong text-[#f4faf5]">{heroPercent}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-[#253329]">
                <div
                  className={cn(
                    "h-full rounded-pill transition-all",
                    heroPercent <= 25 ? "bg-[#ff786b]" : "bg-[#66f0a7]",
                  )}
                  style={{ width: `${heroPercent}%` }}
                />
              </div>

              <div className="mt-2.5 flex flex-col divide-y divide-[#d7f6e0]/8">
                <HudRow
                  icon={<HeartPulseIcon />}
                  label="HP"
                  value={`${formatCount(stats.heroHp)}/${formatCount(stats.heroMaxHp)}`}
                  detail={stats.heroAlive ? "жив" : "пал"}
                />
                <HudRow icon={<ActivityIcon />} label="сущности" value={formatCount(stats.total)} />
                <HudRow icon={<SwordsIcon />} label="враги" value={formatCount(stats.enemies)} />
                <HudRow icon={<UsersRoundIcon />} label="союзники" value={formatCount(stats.allies)} />
                <HudRow icon={<ShieldIcon />} label="выбрано" value={formatCount(stats.selected)} />
              </div>

              <div className="mt-2.5 border-t border-[#d7f6e0]/12 pt-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-caption-strong text-[#f4faf5]">Метрики</p>
                  <span className="text-fine-print text-[#819289]">окно 120 кадров</span>
                </div>

                <p className="mt-2 text-fine-print uppercase tracking-[0.08em] text-[#6f8378]">тайминги кадра</p>
                <div className="flex flex-col divide-y divide-[#d7f6e0]/8">
                  <TimingRow label="FPS" stats={performanceMetrics.fps} format={formatFps} />
                  <TimingRow label="Тик-переход" stats={performanceMetrics.tick} format={formatMs} />
                  <TimingRow label="Phaser синх/рендер" stats={performanceMetrics.sync} format={formatMs} />
                </div>

                <p className="mt-2 text-fine-print uppercase tracking-[0.08em] text-[#6f8378]">пересборка структур</p>
                <div className="flex flex-col divide-y divide-[#d7f6e0]/8">
                  <MetricValueRow
                    label="перестройка flow field"
                    value={formatMs(performanceMetrics.flowFieldRebuildMs)}
                  />
                  <MetricValueRow label="сборка spatial grid" value={formatMs(performanceMetrics.spatialGridBuildMs)} />
                </div>
              </div>

              <div className="mt-2.5 grid gap-1.5 border-t border-[#d7f6e0]/12 pt-2.5 text-caption text-[#b8c5bd]">
                <div className="flex items-center justify-between gap-3">
                  <span>сид</span>
                  <span className="max-w-44 truncate text-caption-strong text-[#f4faf5]">{config.seed}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>врагов задано</span>
                  <span className="text-caption-strong text-[#f4faf5]">{formatCount(config.enemyCount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>юниты игрока</span>
                  <span className="text-caption-strong text-[#f4faf5]">
                    {formatCount(spawnedPlayerUnits)}/{formatCount(spawnState.context.targetPlayerUnitCount)}
                    <span className="ml-1.5 text-fine-print font-normal text-[#819289]">{playerSpawnDetail}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>враги</span>
                  <span className="text-caption-strong text-[#f4faf5]">
                    {formatCount(spawnState.context.spawnedEnemyCount)}/
                    {formatCount(spawnState.context.targetEnemyCount)}
                    <span className="ml-1.5 text-fine-print font-normal text-[#819289]">{enemySpawnDetail}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>запуски</span>
                  <span className="text-caption-strong text-[#f4faf5]">{state.context.startedRuns}</span>
                </div>
              </div>
            </aside>
          ) : (
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              aria-label="Показать панель"
              title="Показать панель"
              className="pointer-events-auto hidden items-center gap-2 rounded-pill border border-[#d7f6e0]/14 bg-[#151916]/92 px-3 py-2 text-caption-strong text-[#f4faf5] shadow-product transition hover:bg-[#1d241f] md:inline-flex [&_svg]:size-4"
            >
              <GaugeIcon className="text-[#66f0a7]" />
              <span>{formatFps(performanceMetrics.fps.current)} FPS</span>
              <PanelRightOpenIcon className="text-[#b8c5bd]" />
            </button>
          )}
        </div>

        <div className="pointer-events-auto grid gap-3 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/92 p-3 text-[#f4faf5] shadow-product md:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption-strong">База героя</span>
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
              <p className="text-fine-print text-[#819289]">юниты</p>
              <p className="text-caption-strong">{formatCount(stats.total)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">враги</p>
              <p className="text-caption-strong">{formatCount(stats.enemies)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">союзники</p>
              <p className="text-caption-strong">{formatCount(stats.allies)}</p>
            </div>
            <div>
              <p className="text-fine-print text-[#819289]">выбрано</p>
              <p className="text-caption-strong">{formatCount(stats.selected)}</p>
            </div>
          </div>
        </div>
      </div>

      {isSpawning ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#101612]/82 px-4 text-center backdrop-blur-[2px]">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/16 bg-[#151916]/96 px-6 py-6 text-[#f4faf5] shadow-product sm:px-8 sm:py-7">
            <div className="grid gap-1">
              <span className="text-fine-print font-semibold tracking-[0.08em] text-[#8fd4ff] uppercase">СПАВН</span>
              <p className="text-tagline text-[#f4faf5]">Загрузка войск</p>
            </div>
            <div className="w-full">
              <div className="mb-2 flex items-center justify-between gap-3 text-caption text-[#b8c5bd]">
                <span>{formatCount(spawnedUnits)} юнитов</span>
                <span>{formatCount(spawnTarget)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-pill bg-[#253329]">
                <div
                  className="h-full rounded-pill bg-[#8fd4ff] transition-all duration-150"
                  style={{ width: `${spawnProgress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-caption text-[#819289]">
                <span>{spawnProgress}%</span>
                <span>
                  {formatCount(spawnedPlayerUnits)}/{formatCount(spawnState.context.targetPlayerUnitCount)} игроков
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-caption text-[#819289]">
                <span>
                  {formatCount(spawnedEnemies)}/{formatCount(spawnState.context.targetEnemyCount)} врагов
                </span>
                <span>{formatCount(activeSpawnBatchSize)}/батч</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isPaused ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#101612]/72 px-4 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/94 px-8 py-7 text-[#f4faf5] shadow-product">
            <span className="rounded-md bg-[#f6e27a]/18 px-2.5 py-1 text-caption-strong text-[#f6e27a]">ПАУЗА</span>
            <p className="text-tagline text-[#f4faf5]">Симуляция на паузе</p>
            <Button type="button" onClick={() => transition({ type: "GAME_RESUME" })} className="rounded-pill">
              <PlayIcon data-icon="inline-start" />
              Продолжить
            </Button>
          </div>
        </div>
      ) : null}

      {isGameOver ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#101612]/78 px-4 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/14 bg-[#151916]/94 px-8 py-7 text-[#f4faf5] shadow-product">
            <span className="rounded-md bg-[#ff786b]/18 px-2.5 py-1 text-caption-strong text-[#ff9a90]">ПОРАЖЕНИЕ</span>
            <p className="text-tagline text-[#f4faf5]">База героя уничтожена</p>
            <Button type="button" onClick={() => transition({ type: "GAME_RESTART" })} className="rounded-pill">
              <RotateCcwIcon data-icon="inline-start" />
              Настроить
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function GameView({ app }: { app: RtsApp }) {
  const status = useSelector((state) => state.gameSession.state);
  if (status === "CONFIGURING") return <StartScreen />;
  return <ArmedShell app={app} />;
}
