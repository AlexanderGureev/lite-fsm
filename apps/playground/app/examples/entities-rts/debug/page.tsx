"use client";

import { Suspense } from "react";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";

import { RtsGame } from "../components/rts-game";
import { DEFAULT_GAME_CONFIG, normalizeGameConfig } from "../store/config";
import type { GameConfig } from "../store";

const readNumberParam = (params: ReadonlyURLSearchParams, keys: readonly string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value === null) continue;

    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};

const readStringParam = (params: ReadonlyURLSearchParams, keys: readonly string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) return value;
  }

  return undefined;
};

const readDebugGameConfig = (params: ReadonlyURLSearchParams): GameConfig => {
  const playerUnitHp = readNumberParam(params, ["playerUnitHp", "playerHp", "allyHp", "hp"]);

  return normalizeGameConfig({
    enemyCount: readNumberParam(params, ["enemyCount", "enemies"]) ?? DEFAULT_GAME_CONFIG.enemyCount,
    allyCount:
      readNumberParam(params, ["allyCount", "allies", "playerUnitCount", "playerUnits"]) ??
      DEFAULT_GAME_CONFIG.allyCount,
    seed: readStringParam(params, ["seed"]) ?? "entities-rts-debug",
    ...(playerUnitHp === undefined ? {} : { playerUnitHp }),
  });
};

function EntitiesRtsDebugGame() {
  const initialConfig = readDebugGameConfig(useSearchParams());

  return <RtsGame autoStart initialConfig={initialConfig} />;
}

export default function EntitiesRtsDebugPage() {
  return (
    <main className="min-h-[calc(100svh-6.5rem)] bg-canvas-parchment">
      <Suspense fallback={null}>
        <EntitiesRtsDebugGame />
      </Suspense>
    </main>
  );
}
