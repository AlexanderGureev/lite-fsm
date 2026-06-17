import { RtsGame } from "../components/rts-game";
import { DEFAULT_GAME_CONFIG, normalizeGameConfig } from "../store/config";
import type { GameConfig } from "../store";

type SearchParams = Record<string, string | string[] | undefined>;

const firstParamValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const readNumberParam = (searchParams: SearchParams, keys: readonly string[]) => {
  for (const key of keys) {
    const value = firstParamValue(searchParams[key]);
    if (value === undefined) continue;

    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};

const readStringParam = (searchParams: SearchParams, keys: readonly string[]) => {
  for (const key of keys) {
    const value = firstParamValue(searchParams[key]);
    if (value !== undefined) return value;
  }

  return undefined;
};

const readDebugGameConfig = (searchParams: SearchParams): GameConfig => {
  const playerUnitHp = readNumberParam(searchParams, ["playerUnitHp", "playerHp", "allyHp", "hp"]);

  return normalizeGameConfig({
    enemyCount: readNumberParam(searchParams, ["enemyCount", "enemies"]) ?? DEFAULT_GAME_CONFIG.enemyCount,
    allyCount:
      readNumberParam(searchParams, ["allyCount", "allies", "playerUnitCount", "playerUnits"]) ??
      DEFAULT_GAME_CONFIG.allyCount,
    seed: readStringParam(searchParams, ["seed"]) ?? "entities-rts-debug",
    ...(playerUnitHp === undefined ? {} : { playerUnitHp }),
  });
};

export default async function EntitiesRtsDebugPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const initialConfig = readDebugGameConfig(await searchParams);

  return (
    <main className="min-h-[calc(100svh-6.5rem)] bg-canvas-parchment">
      <RtsGame autoStart initialConfig={initialConfig} />
    </main>
  );
}
