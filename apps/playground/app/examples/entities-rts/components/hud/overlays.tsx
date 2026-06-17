"use client";

import { PlayIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useTransition } from "../../store";
import type { RtsEntityStats } from "../../store/selectors";
import { formatCount } from "./format";
import type { SpawnSummary } from "./model";

export function MobileSummary({ heroPercent, stats }: { heroPercent: number; stats: RtsEntityStats }) {
  return (
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
  );
}

export function SpawningOverlay({ spawn }: { spawn: SpawnSummary }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#101612]/82 px-4 text-center backdrop-blur-[2px]">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-[#d7f6e0]/16 bg-[#151916]/96 px-6 py-6 text-[#f4faf5] shadow-product sm:px-8 sm:py-7">
        <div className="grid gap-1">
          <span className="text-fine-print font-semibold tracking-[0.08em] text-[#8fd4ff] uppercase">СПАВН</span>
          <p className="text-tagline text-[#f4faf5]">Загрузка войск</p>
        </div>
        <div className="w-full">
          <div className="mb-2 flex items-center justify-between gap-3 text-caption text-[#b8c5bd]">
            <span>{formatCount(spawn.spawnedUnits)} юнитов</span>
            <span>{formatCount(spawn.spawnTarget)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-pill bg-[#253329]">
            <div
              className="h-full rounded-pill bg-[#8fd4ff] transition-all duration-150"
              style={{ width: `${spawn.spawnProgress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-caption text-[#819289]">
            <span>{spawn.spawnProgress}%</span>
            <span>
              {formatCount(spawn.spawnedPlayerUnits)}/{formatCount(spawn.targetPlayerUnitCount)} игроков
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-caption text-[#819289]">
            <span>
              {formatCount(spawn.spawnedEnemies)}/{formatCount(spawn.targetEnemyCount)} врагов
            </span>
            <span>{formatCount(spawn.activeSpawnBatchSize)}/батч</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PausedOverlay() {
  const transition = useTransition();

  return (
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
  );
}

export function GameOverOverlay() {
  const transition = useTransition();

  return (
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
  );
}
