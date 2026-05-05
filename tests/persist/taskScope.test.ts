import { describe, expect, it } from "vitest";

import { createTaskScope, isTaskCancelledError } from "../../src/persist/taskScope";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const expectCancelled = async (promise: Promise<unknown>) => {
  const err = await promise.catch((caught: unknown) => caught);
  expect(isTaskCancelledError(err)).toBe(true);
};

describe("createTaskScope", () => {
  it("выполняет task и возвращает результат", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();

    await expect(latest.run(() => "done")).resolves.toBe("done");

    expect(latest.isActive()).toBe(false);
  });

  it("step выполняет sync и async шаги только пока task актуален", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();

    const result = await latest.run(async (task) => {
      const first = await task.step(() => 1);
      const second = await task.step(async () => first + 1);
      return second + 1;
    });

    expect(result).toBe(3);
  });

  it("checkpoint проходит для актуального task и отменяет stale task", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const allowFirstToContinue = deferred<void>();

    const first = latest.run(async (task) => {
      task.checkpoint();
      await allowFirstToContinue.promise;
      task.checkpoint();
      return "stale";
    });

    await expect(latest.run(() => "fresh")).resolves.toBe("fresh");

    allowFirstToContinue.resolve();
    await expectCancelled(first);
  });

  it("cancelAll отменяет активный task после await и сразу скрывает active count", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const pending = deferred<number>();

    const run = latest.run((task) => task.step(() => pending.promise));
    expect(latest.isActive()).toBe(true);

    scope.cancelAll();
    expect(latest.isActive()).toBe(false);

    pending.resolve(1);
    await expectCancelled(run);
    expect(latest.isActive()).toBe(false);
  });

  it("cancelAll запрещает следующий step без запуска callback", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    let called = false;

    const run = latest.run((task) => {
      scope.cancelAll();
      return task.step(() => {
        called = true;
        return "stale";
      });
    });

    await expectCancelled(run);
    expect(called).toBe(false);
  });

  it("новый run в latest отменяет предыдущий run той же lane", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const pendingFirst = deferred<number>();

    const first = latest.run((task) => task.step(() => pendingFirst.promise));
    expect(latest.isActive()).toBe(true);

    await expect(latest.run((task) => task.step(() => 2))).resolves.toBe(2);
    expect(latest.isActive()).toBe(false);

    pendingFirst.resolve(1);
    await expectCancelled(first);
    expect(latest.isActive()).toBe(false);
  });

  it("старый latest run не запускает следующий side-effect после замены", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const allowFirstToContinue = deferred<void>();
    let called = false;

    const first = latest.run(async (task) => {
      await allowFirstToContinue.promise;
      return task.step(() => {
        called = true;
        return 1;
      });
    });

    await expect(latest.run(() => 2)).resolves.toBe(2);
    allowFirstToContinue.resolve();
    await expectCancelled(first);

    expect(called).toBe(false);
  });

  it("isCurrent сразу отражает замену latest run и cancelAll", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const pendingFirst = deferred<void>();
    const pendingSecond = deferred<void>();
    let firstIsCurrent = () => false;
    let secondIsCurrent = () => false;

    const first = latest.run(async (task) => {
      firstIsCurrent = task.isCurrent;
      await pendingFirst.promise;
    });
    expect(firstIsCurrent()).toBe(true);

    const second = latest.run(async (task) => {
      secondIsCurrent = task.isCurrent;
      await pendingSecond.promise;
    });
    expect(firstIsCurrent()).toBe(false);
    expect(secondIsCurrent()).toBe(true);

    scope.cancelAll();
    expect(secondIsCurrent()).toBe(false);

    pendingFirst.resolve();
    pendingSecond.resolve();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it("latest считает активным только актуальный run", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const firstPending = deferred<number>();
    const secondPending = deferred<number>();

    const first = latest.run((task) => task.step(() => firstPending.promise));
    const second = latest.run((task) => task.step(() => secondPending.promise));

    expect(latest.isActive()).toBe(true);

    secondPending.resolve(2);
    await expect(second).resolves.toBe(2);
    expect(latest.isActive()).toBe(false);

    firstPending.resolve(1);
    await expectCancelled(first);
    expect(latest.isActive()).toBe(false);
  });

  it("latest lanes независимы друг от друга", async () => {
    const scope = createTaskScope();
    const firstLane = scope.latest();
    const secondLane = scope.latest();
    const secondPending = deferred<string>();
    let isSecondCurrent = false;

    const second = secondLane.run((task) => {
      isSecondCurrent = task.isCurrent();
      return task.step(() => secondPending.promise);
    });

    await expect(firstLane.run(() => "first")).resolves.toBe("first");

    expect(isSecondCurrent).toBe(true);
    expect(secondLane.isActive()).toBe(true);

    secondPending.resolve("second");
    await expect(second).resolves.toBe("second");
  });

  it("cancelAll отменяет все lanes, но следующие runs стартуют в новом lifecycle", async () => {
    const scope = createTaskScope();
    const firstLane = scope.latest();
    const secondLane = scope.latest();
    const firstPending = deferred<number>();
    const secondPending = deferred<number>();

    const first = firstLane.run((task) => task.step(() => firstPending.promise));
    const second = secondLane.run((task) => task.step(() => secondPending.promise));

    scope.cancelAll();
    expect(firstLane.isActive()).toBe(false);
    expect(secondLane.isActive()).toBe(false);

    await expect(firstLane.run(() => 3)).resolves.toBe(3);

    firstPending.resolve(1);
    secondPending.resolve(2);
    await expectCancelled(first);
    await expectCancelled(second);
  });

  it("обычные ошибки пробрасываются и очищают active count", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const error = new Error("failed");

    await expect(
      latest.run((task) =>
        task.step(() => {
          throw error;
        }),
      ),
    ).rejects.toBe(error);

    expect(latest.isActive()).toBe(false);
  });

  it("ошибка из run callback без step тоже пробрасывается и очищает active count", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const error = new Error("callback failed");

    await expect(
      latest.run(() => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(latest.isActive()).toBe(false);
  });

  it("ошибка async шага после cancelAll остаётся исходной ошибкой", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const pending = deferred<number>();
    const error = new Error("late failure");

    const run = latest.run((task) => task.step(() => pending.promise));
    scope.cancelAll();
    pending.reject(error);

    await expect(run).rejects.toBe(error);
    expect(latest.isActive()).toBe(false);
  });

  it("isTaskCancelledError отличает внутреннюю отмену от обычной ошибки", async () => {
    const scope = createTaskScope();
    const latest = scope.latest();
    const pending = deferred<void>();

    const run = latest.run((task) => task.step(() => pending.promise));
    scope.cancelAll();
    pending.resolve();

    const err = await run.catch((caught: unknown) => caught);
    expect(isTaskCancelledError(err)).toBe(true);
    expect(isTaskCancelledError(new Error("regular"))).toBe(false);
    expect(isTaskCancelledError(null)).toBe(false);
  });
});
