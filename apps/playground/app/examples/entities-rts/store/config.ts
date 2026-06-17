import type { GameConfig, GameConfigPatch, RtsPresetId } from "./types";

type Preset = {
  label: string;
  description: string;
  config: GameConfig;
};

export const GAME_PRESETS = {
  small: {
    label: "Малый",
    description: "500 врагов, 50 союзников",
    config: { enemyCount: 500, allyCount: 50, seed: "small-500" },
  },
  medium: {
    label: "Средний",
    description: "3 000 врагов, 120 союзников",
    config: { enemyCount: 3_000, allyCount: 120, seed: "medium-3000" },
  },
  stress: {
    label: "Стресс",
    description: "10 000 врагов, 400 союзников",
    config: { enemyCount: 10_000, allyCount: 400, seed: "stress-10000" },
  },
} as const satisfies Record<RtsPresetId, Preset>;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  enemyCount: 3_000,
  allyCount: 120,
  seed: "medium-3000",
};

const sanitizeCount = (value: number | undefined, fallback: number, min: number) => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.trunc(value));
};

const sanitizeOptionalCount = (value: number | undefined, fallback: number | undefined, min: number) => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.trunc(value));
};

export const normalizeGameConfig = (config: GameConfig): GameConfig => {
  const playerUnitHp = sanitizeOptionalCount(config.playerUnitHp, undefined, 1);

  return {
    enemyCount: sanitizeCount(config.enemyCount, DEFAULT_GAME_CONFIG.enemyCount, 0),
    allyCount: sanitizeCount(config.allyCount, DEFAULT_GAME_CONFIG.allyCount, 1),
    seed: config.seed.trim() || DEFAULT_GAME_CONFIG.seed,
    ...(playerUnitHp === undefined ? {} : { playerUnitHp }),
  };
};

export const applyGameConfigPatch = (current: GameConfig, patch: GameConfigPatch): GameConfig => {
  const playerUnitHp = sanitizeOptionalCount(patch.playerUnitHp, current.playerUnitHp, 1);

  return normalizeGameConfig({
    enemyCount: sanitizeCount(patch.enemyCount, current.enemyCount, 0),
    allyCount: sanitizeCount(patch.allyCount, current.allyCount, 1),
    seed: patch.seed ?? current.seed,
    ...(playerUnitHp === undefined ? {} : { playerUnitHp }),
  });
};
