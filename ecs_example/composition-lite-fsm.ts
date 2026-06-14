import type { EntityId } from "@lite-fsm/entities";

import {
  createMemorySprites,
  createMemoryStorage,
  makeStore,
} from "./store";

export const runLiteFsmCompositionExample = () => {
  const sprites = createMemorySprites();
  const { manager } = makeStore({
    sprites,
    clock: { now: () => 1_000 },
    persistStorage: createMemoryStorage(),
  });
  const entityId: EntityId = "enemy/composition";

  manager.transition({ type: "START_GAME" });
  manager.transition({
    type: "START_BLINK_ACTOR",
    payload: { id: "hud", maxTicks: 30 },
  });
  manager.transition({
    type: "SPAWN_ENEMY",
    payload: {
      id: entityId,
      x: 10,
      y: 20,
      dx: 1,
      dy: 0,
      hp: 3,
      scoreValue: 100,
      spriteId: "slime-composition",
      faction: null,
    },
  });
  manager.transition({ type: "TICK", payload: { frame: 1, deltaMs: 16 } });
  manager.transition({
    type: "DAMAGE_ENTITY",
    payload: { amount: 1, source: "player" },
    meta: { entityId },
  });
  manager.transition({
    type: "BOOST_ENEMIES",
    payload: { dx: 0.25, dy: 0 },
    meta: { groupTag: "enemy" },
  });

  const enemies = manager.entities().get("enemyActor");

  return {
    enemyCount: enemies.count,
    enemyRows: manager.getState().enemyActor.count,
    spriteCommands: sprites.commands,
  };
};
