"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIcon,
  GaugeIcon,
  HeartPulseIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  ShieldIcon,
  SwordsIcon,
  UsersRoundIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { GameConfig, RtsBenchmarkReport } from "../../store";
import type { RtsMetricsSnapshot, RtsTimingStats } from "../../store/metrics";
import type { RtsEntityStats } from "../../store/selectors";
import { formatCount, formatFps, formatMs, formatRate, formatSeconds } from "./format";
import type { SpawnSummary } from "./model";

type StatsPanelProps = {
  heroPercent: number;
  stats: RtsEntityStats;
  metrics: RtsMetricsSnapshot;
  spawn: SpawnSummary;
  config: GameConfig;
  startedRuns: number;
  report: RtsBenchmarkReport | null;
};

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

export function StatsPanel({ heroPercent, stats, metrics, spawn, config, startedRuns, report }: StatsPanelProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const displayedMetrics = report?.metrics ?? metrics;

  if (!statsOpen) {
    return (
      <button
        type="button"
        onClick={() => setStatsOpen(true)}
        aria-label="Показать панель"
        title="Показать панель"
        className="pointer-events-auto hidden items-center gap-2 rounded-pill border border-[#d7f6e0]/14 bg-[#151916]/92 px-3 py-2 text-caption-strong text-[#f4faf5] shadow-product transition hover:bg-[#1d241f] md:inline-flex [&_svg]:size-4"
      >
        <GaugeIcon className="text-[#66f0a7]" />
        <span>{report ? "отчет" : `${formatFps(displayedMetrics.fps.current)} FPS`}</span>
        <PanelRightOpenIcon className="text-[#b8c5bd]" />
      </button>
    );
  }

  return (
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
          className={cn("h-full rounded-pill transition-all", heroPercent <= 25 ? "bg-[#ff786b]" : "bg-[#66f0a7]")}
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
          <span className="text-fine-print text-[#819289]">{report ? "итог" : "за игру"}</span>
        </div>

        {report ? (
          <div className="mt-2 flex flex-col divide-y divide-[#d7f6e0]/8">
            <MetricValueRow label="длительность" value={formatSeconds(report.elapsedMs)} />
            <MetricValueRow
              label="уничтожено"
              value={`${formatCount(report.enemiesKilled)}/${formatCount(report.enemyCount)}`}
            />
            <MetricValueRow label="скорость" value={formatRate(report.killsPerSecond)} />
            <MetricValueRow label="тики" value={formatCount(report.tickCount)} />
          </div>
        ) : null}

        <p className="mt-2 text-fine-print uppercase tracking-[0.08em] text-[#6f8378]">тайминги кадра</p>
        <div className="flex flex-col divide-y divide-[#d7f6e0]/8">
          <TimingRow label="FPS" stats={displayedMetrics.fps} format={formatFps} />
          <TimingRow label="Тик-переход" stats={displayedMetrics.tick} format={formatMs} />
          <TimingRow label="Phaser синх/рендер" stats={displayedMetrics.sync} format={formatMs} />
        </div>

        <p className="mt-2 text-fine-print uppercase tracking-[0.08em] text-[#6f8378]">пересборка структур</p>
        <div className="flex flex-col divide-y divide-[#d7f6e0]/8">
          <MetricValueRow label="перестройка flow field" value={formatMs(displayedMetrics.flowFieldRebuildMs)} />
          <MetricValueRow label="сборка spatial grid" value={formatMs(displayedMetrics.spatialGridBuildMs)} />
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
            {formatCount(spawn.spawnedPlayerUnits)}/{formatCount(spawn.targetPlayerUnitCount)}
            <span className="ml-1.5 text-fine-print font-normal text-[#819289]">{spawn.playerSpawnDetail}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>враги</span>
          <span className="text-caption-strong text-[#f4faf5]">
            {formatCount(spawn.spawnedEnemies)}/{formatCount(spawn.targetEnemyCount)}
            <span className="ml-1.5 text-fine-print font-normal text-[#819289]">{spawn.enemySpawnDetail}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>запуски</span>
          <span className="text-caption-strong text-[#f4faf5]">{startedRuns}</span>
        </div>
      </div>
    </aside>
  );
}
