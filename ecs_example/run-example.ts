import type { EntityId } from "@lite-fsm/entities";

import { createMemorySprites, createMemoryStorage, makeStore } from "./store";
import { selectGameGateStatus } from "./store/selectors";

export const runEcsExample = async () => {
  const sprites = createMemorySprites();
  const persistStorage = createMemoryStorage();
  const store = makeStore({
    sprites,
    clock: { now: () => 1_000 },
    persistStorage,
  });
  const { manager } = store;
  const enemyId = "enemy/slime-1" as EntityId;

  await store.persist[0].restore();

  manager.transition({ type: "START_GAME" });
  manager.transition({ type: "START_BLINK_ACTOR", payload: { id: "hud", maxTicks: 30 } });
  manager.transition({
    type: "SPAWN_ENEMY",
    payload: {
      id: enemyId,
      x: 10,
      y: 20,
      dx: 0.1,
      dy: 0,
      hp: 3,
      scoreValue: 100,
      spriteId: "slime-1",
      faction: null,
    },
  });

  manager.transition({ type: "TICK", payload: { frame: 1, deltaMs: 16 } });
  manager.transition({
    type: "DAMAGE_ENTITY",
    payload: { amount: 1, source: "player" },
    meta: { entityId: enemyId },
  });
  manager.transition({
    type: "BOOST_ENEMIES",
    payload: { dx: 0.05, dy: 0 },
    meta: { groupTag: "enemy" },
  });

  const enemyStore = manager.entities.get("enemyActor");
  const snapshot = manager.dehydrate();
  const preview = manager.getHydratedState(snapshot);

  manager.hydrate(snapshot, { strategy: "replace" });
  await store.persist[0].save();

  return {
    state: manager.getState(),
    gate: selectGameGateStatus(manager.getState()),
    enemyCount: enemyStore.count,
    previewEnemyCount: preview.enemyActor.count,
    snapshot,
    spriteCommands: sprites.commands,
    persisted: persistStorage.dump(),
  };
};

export type EcsExampleResult = Awaited<ReturnType<typeof runEcsExample>>;
