import { describe, expect, it } from "vitest";

import { runEcsExample } from "../../ecs_example/run-example";

type SnapshotActor = {
  readonly columns: Record<string, readonly unknown[]>;
};

type EntityStorageSnapshot = {
  readonly entityStore: {
    readonly ids: readonly unknown[];
    readonly alive: readonly unknown[];
    readonly groupTagByIndex: readonly unknown[];
  };
  readonly actors: Record<string, SnapshotActor>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  expect(isRecord(value), `${label} должен быть object`).toBe(true);
  return value as Record<string, unknown>;
};

const readArray = (value: unknown, label: string): readonly unknown[] => {
  expect(Array.isArray(value), `${label} должен быть array`).toBe(true);
  return value as readonly unknown[];
};

const readColumns = (value: unknown, label: string): Record<string, readonly unknown[]> => {
  const record = readRecord(value, label);
  const columns: Record<string, readonly unknown[]> = {};

  for (const [column, columnValue] of Object.entries(record)) {
    columns[column] = readArray(columnValue, `${label}.${column}`);
  }

  return columns;
};

const readEntityStorage = (snapshot: unknown): EntityStorageSnapshot => {
  const root = readRecord(snapshot, "snapshot");
  const storage = readRecord(root.storage, "snapshot.storage");
  const entity = readRecord(storage.entity, "snapshot.storage.entity");
  const entityStore = readRecord(entity.entityStore, "snapshot.storage.entity.entityStore");
  const actors = readRecord(entity.actors, "snapshot.storage.entity.actors");

  return {
    entityStore: {
      ids: readArray(entityStore.ids, "entityStore.ids"),
      alive: readArray(entityStore.alive, "entityStore.alive"),
      groupTagByIndex: readArray(entityStore.groupTagByIndex, "entityStore.groupTagByIndex"),
    },
    actors: Object.fromEntries(
      Object.entries(actors).map(([key, value]) => {
        const actor = readRecord(value, `actors.${key}`);
      return [
        key,
        {
          columns: readColumns(actor.columns, `actors.${key}.columns`),
        },
      ];
    }),
    ),
  };
};

const findLiveEntityIndex = (storage: EntityStorageSnapshot, entityId: string): number => {
  const index = storage.entityStore.ids.findIndex((value) => value === entityId);

  expect(index).toBeGreaterThanOrEqual(0);
  expect(storage.entityStore.alive[index]).toBe(1);

  return index;
};

const readNumberColumn = (actor: SnapshotActor, column: string, index: number): number => {
  const values = readArray(actor.columns[column], `columns.${column}`);
  const value = values[index];

  expect(typeof value).toBe("number");
  return value as number;
};

describe("ecs_example — финальный gate", () => {
  it("выполняет spawn, routing, TICK, snapshot, hydrate, persist и sprite adapter команды", async () => {
    const result = await runEcsExample();
    const storage = readEntityStorage(result.snapshot);
    const entityIndex = findLiveEntityIndex(storage, "enemy/slime-1");
    const enemyActor = storage.actors.enemyActor;
    const blinkActor = Object.values(result.state.blinkActor)[0];
    const persistedRecords = Object.values(result.persisted);
    const commandTypes = result.spriteCommands.map((command) => command.type);

    expect(enemyActor).toBeDefined();
    expect(result.enemyCount).toBe(1);
    expect(result.state.enemyActor.count).toBe(1);
    expect(result.gate.enemyRows).toBe(1);
    expect(result.gate.frame).toBe(1);
    expect(blinkActor?.context.ticks).toBe(1);
    expect(readNumberColumn(enemyActor, "x", entityIndex)).toBeCloseTo(11.6);
    expect(readNumberColumn(enemyActor, "hp", entityIndex)).toBe(2);
    expect(readNumberColumn(enemyActor, "dx", entityIndex)).toBeCloseTo(0.15);
    expect(storage.entityStore.groupTagByIndex[entityIndex]).toBe("enemy");
    expect(result.gate.alerts).toBe(1);
    expect(result.previewEnemyCount).toBe(1);
    expect(result.hydratedEnemyCount).toBe(1);
    expect(persistedRecords).toHaveLength(1);
    expect(result.restoreStatus).toEqual({ phase: "ready", restored: true });
    expect(result.restoredBlinkActors).toBe(1);
    expect(commandTypes).toContain("syncEnemy");
    expect(commandTypes).toContain("flash");
  });
});
