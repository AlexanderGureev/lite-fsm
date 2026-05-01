import { ENEMY_SPAWN_INTERVAL } from "./constants";
import type { AppState } from ".";
import type { EnemyHitFeedbackContext, EnemyHealthContext, PlayerBodyContext } from "./types";

export type GameStatus = AppState["gameSession"]["context"]["status"];

const actorTemplates = ["playerBody", "enemyBody", "enemyHealth", "enemyHitFeedback", "projectileBody"] as const;
type ActorTemplateKey = (typeof actorTemplates)[number];

const groupTemplates: Record<string, ReadonlyArray<ActorTemplateKey>> = {
  player: ["playerBody"],
  enemy: ["enemyBody", "enemyHealth", "enemyHitFeedback"],
  projectile: ["projectileBody"],
};

type CountItem<TLabel extends string = string> = {
  label: TLabel;
  value: number;
};

export type GameView = {
  status: GameStatus;
  hp: {
    current: number;
    max: number;
    percent: number;
  };
  kills: number;
  shots: number;
  hits: number;
  spawnInterval: number;
  spawnBoost: string;
  groups: CountItem[];
  actors: Array<CountItem<ActorTemplateKey>>;
};

export const selectPlayerBody = (state: AppState): PlayerBodyContext | null =>
  Object.values(state.playerBody)[0]?.context ?? null;

export const selectEnemyHealthByEntity = (state: AppState, entityId: string): EnemyHealthContext | null =>
  Object.values(state.enemyHealth).find((slice) => slice.context.entityId === entityId)?.context ?? null;

export const selectEnemyHitFeedbackByEntity = (state: AppState, entityId: string): EnemyHitFeedbackContext | null => {
  let latest: EnemyHitFeedbackContext | null = null;

  for (const { context } of Object.values(state.enemyHitFeedback)) {
    if (context.entityId !== entityId) continue;
    if (latest === null || context.startedAt > latest.startedAt) latest = context;
  }

  return latest;
};

const countActors = (state: AppState, key: ActorTemplateKey) => Object.keys(state[key]).length;

const countGroup = (state: AppState, templates: ReadonlyArray<ActorTemplateKey>) =>
  templates.reduce((max, key) => Math.max(max, countActors(state, key)), 0);

export const selectGameView = (state: AppState): GameView => {
  const player = selectPlayerBody(state);
  const session = state.gameSession.context;
  const hpMax = player?.maxHp ?? 100;
  const hpCurrent = player ? Math.ceil(player.hp) : 0;
  const hpPercent = hpMax > 0 ? Math.round((hpCurrent / hpMax) * 100) : 0;
  const spawnInterval = Math.round(state.enemySpawner.context.interval);

  return {
    status: state.gameSession.context.status,
    hp: {
      current: hpCurrent,
      max: hpMax,
      percent: hpPercent,
    },
    kills: session.kills,
    shots: session.shots,
    hits: session.hits,
    spawnInterval,
    spawnBoost: `×${(ENEMY_SPAWN_INTERVAL / spawnInterval).toFixed(2)}`,
    groups: Object.entries(groupTemplates).map(([label, templates]) => ({
      label,
      value: countGroup(state, templates),
    })),
    actors: actorTemplates.map((label) => ({ label, value: countActors(state, label) })),
  };
};
