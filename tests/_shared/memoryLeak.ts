// Общие хелперы для тестов утечек памяти.
// Используются `tests/core/memoryLeak.weakref.test.ts` и `tests/persist/memoryLeak.weakref.test.ts`.
// Без `--expose-gc` describe помечается skip.

import { describe } from "vitest";

// Минимальный shim для WeakRef: ts lib зафиксирован на ES2020, Node 14+ уже его имеет.
type WeakRefCtor = new <T extends object>(target: T) => { deref(): T | undefined };
declare const WeakRef: WeakRefCtor;
export type WeakRefLike<T extends object> = InstanceType<WeakRefCtor> & { deref(): T | undefined };

const gc: (() => void) | undefined = (globalThis as { gc?: () => void }).gc;

export const describeIfGc = gc ? describe : describe.skip;

// 5 итераций с setImmediate — нужен и для closure из Promise-цепочек condition()/persist save.
export const forceGc = async (): Promise<void> => {
  if (!gc) return;
  for (let i = 0; i < 5; i++) {
    gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
};

// Создаёт heavy объект, регистрирует WeakRef в общем массиве и возвращает объект.
// Heavy специально аллоцируется как Array, чтобы держать заметный объём heap и не быть inlined V8.
export const allocHeavy = (holders: WeakRefLike<object>[], size = 5_000): object => {
  const heavy = { payload: new Array(size).fill("x") };
  holders.push(new WeakRef(heavy));
  return heavy;
};

export const countLive = (holders: readonly WeakRefLike<object>[]): number =>
  holders.filter((ref) => ref.deref() !== undefined).length;
