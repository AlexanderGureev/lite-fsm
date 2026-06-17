"use client";

import { useEffect, useRef } from "react";

import type { RtsApp } from "../../app";
import { useSelector } from "../../store";
import { CommandBar } from "./command-bar";
import { formatCount } from "./format";
import type { GameStatus, SpawnSummary } from "./model";
import { BenchmarkReportOverlay, GameOverOverlay, MobileSummary, PausedOverlay, SpawningOverlay } from "./overlays";
import { StatsPanel } from "./stats-panel";
import { useRtsEntityStats, useRtsPerformanceMetrics } from "./telemetry";

function PhaserCanvas({ app }: { app: RtsApp }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    return app.mountScene(container);
  }, [app]);

  return <div ref={containerRef} className="absolute inset-0 [&>canvas]:block" />;
}

export function ArmedShell({ app }: { app: RtsApp }) {
  const session = useSelector((snapshot) => snapshot.gameSession);
  const spawnState = useSelector((snapshot) => snapshot.gameSpawn);
  const config = session.context.config;
  const enabled = session.state !== "CONFIGURING";
  const stats = useRtsEntityStats(app.store, enabled);
  const metrics = useRtsPerformanceMetrics(app.metrics, enabled);

  const isSpawning = session.state === "SPAWNING";
  const isPaused = session.state === "PAUSED";
  const isGameOver = session.state === "GAME_OVER";
  const isBenchmarkComplete = session.state === "BENCHMARK_COMPLETE";
  let statusLabel = "АКТИВНО";
  if (isSpawning) statusLabel = "СПАВН";
  if (isPaused) statusLabel = "ПАУЗА";
  if (isBenchmarkComplete) statusLabel = "БЕНЧ ГОТОВ";
  if (isGameOver) statusLabel = "ПОРАЖЕНИЕ";

  const status: GameStatus = {
    isSpawning,
    isPaused,
    isGameOver,
    isBenchmarkComplete,
    label: statusLabel,
  };

  const heroPercent = stats.heroMaxHp > 0 ? Math.max(0, Math.round((stats.heroHp / stats.heroMaxHp) * 100)) : 0;

  const spawnIdle = spawnState.state === "IDLE";
  const targetPlayerUnitCount = spawnState.context.targetPlayerUnitCount;
  const targetEnemyCount = spawnState.context.targetEnemyCount;
  const spawnedPlayerUnits = spawnState.context.spawnedPlayerUnitCount;
  const spawnedEnemies = spawnState.context.spawnedEnemyCount;
  const spawnedUnits = spawnedPlayerUnits + spawnedEnemies;
  const spawnTarget = targetPlayerUnitCount + targetEnemyCount;
  const spawn: SpawnSummary = {
    spawnedUnits,
    spawnTarget,
    spawnProgress: spawnTarget > 0 ? Math.min(100, Math.round((spawnedUnits / spawnTarget) * 100)) : 100,
    spawnedPlayerUnits,
    spawnedEnemies,
    targetPlayerUnitCount,
    targetEnemyCount,
    activeSpawnBatchSize:
      spawnedPlayerUnits < targetPlayerUnitCount
        ? spawnState.context.playerBatchSize
        : spawnState.context.enemyBatchSize,
    playerSpawnDetail: spawnIdle ? "готово" : `${formatCount(spawnState.context.playerBatchSize)}/батч`,
    enemySpawnDetail: spawnIdle ? "готово" : `${formatCount(spawnState.context.enemyBatchSize)}/батч`,
  };

  return (
    <section className="relative min-h-[calc(100svh-6.5rem)] w-full overflow-hidden bg-[#101612]">
      <PhaserCanvas app={app} />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-3 p-3 sm:p-4 lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <CommandBar status={status} />
          <StatsPanel
            heroPercent={heroPercent}
            stats={stats}
            metrics={metrics}
            spawn={spawn}
            config={config}
            startedRuns={session.context.startedRuns}
            report={session.context.report}
          />
        </div>

        <MobileSummary heroPercent={heroPercent} stats={stats} />
      </div>

      {isSpawning ? <SpawningOverlay spawn={spawn} /> : null}
      {isPaused ? <PausedOverlay /> : null}
      {isGameOver ? <GameOverOverlay /> : null}
      {isBenchmarkComplete ? <BenchmarkReportOverlay report={session.context.report} /> : null}
    </section>
  );
}
