import type { EntityAccess } from "@lite-fsm/entities";

import type { AppState } from ".";

export type SpritePosition = {
  x: number;
  y: number;
};

export type SpriteCommand =
  | { type: "syncEnemy"; entityId: string; spriteId: string; position: SpritePosition; hp: number }
  | { type: "removeEnemy"; entityId: string; spriteId: string }
  | { type: "flash"; source: string; intensity: number };

export type SpriteAdapter = {
  syncEnemy(entityId: string, spriteId: string, position: SpritePosition, hp: number): void;
  removeEnemy(entityId: string, spriteId: string): void;
  flash(source: string, intensity: number): void;
};

export type ClockAdapter = {
  now(): number;
};

export type JsonStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AppDeps = {
  getState: () => AppState;
  entities?: EntityAccess<AppState>;
  sprites: SpriteAdapter;
  clock: ClockAdapter;
};

export type RuntimeDeps = Omit<AppDeps, "getState" | "entities"> & {
  persistStorage?: JsonStorageLike;
};

export const createMemorySprites = (): SpriteAdapter & { readonly commands: readonly SpriteCommand[] } => {
  const commands: SpriteCommand[] = [];

  return {
    commands,
    syncEnemy: (entityId, spriteId, position, hp) => {
      commands.push({ type: "syncEnemy", entityId, spriteId, position, hp });
    },
    removeEnemy: (entityId, spriteId) => {
      commands.push({ type: "removeEnemy", entityId, spriteId });
    },
    flash: (source, intensity) => {
      commands.push({ type: "flash", source, intensity });
    },
  };
};

export const createMemoryStorage = (): JsonStorageLike & { dump(): Record<string, string> } => {
  const records: Record<string, string> = {};

  return {
    getItem: (key) => records[key] ?? null,
    setItem: (key, value) => {
      records[key] = value;
    },
    removeItem: (key) => {
      delete records[key];
    },
    dump: () => ({ ...records }),
  };
};
