type MaybePromise<T> = T | Promise<T>;

const TASK_CANCELLED = Symbol("lite-fsm.taskCancelled");

export type TaskCancelledError = Error & { readonly [TASK_CANCELLED]: true };

/**
 * Runtime-контекст одной логической task.
 *
 * `checkpoint()` бросает внутреннюю ошибку отмены, если task больше не актуальна
 * в своём канале задач или если родительский scope был отменён. `step()`
 * оборачивает одну sync/async операцию checkpoint-ами до и после выполнения.
 */
export type TaskContext = {
  isCurrent(): boolean;
  checkpoint(): void;
  step<T>(fn: () => MaybePromise<T>): Promise<T>;
};

/**
 * `takeLatest`-канал внутри task scope.
 *
 * Новый `run()` делает предыдущий run в этом канале устаревшим. Устаревшие runs
 * не отменяются на уровне IO; их следующий `checkpoint()` / `step()` отклоняется,
 * чтобы вызывающий код пропустил stale side-effects.
 */
export type LatestTask = {
  run<T>(fn: (task: TaskContext) => MaybePromise<T>): Promise<T>;
  isActive(): boolean;
};

/**
 * Группирует каналы задач под одним lifecycle.
 *
 * `latest()` создаёт независимые `takeLatest`-каналы. `cancelAll()` разом делает
 * все каналы устаревшими, например при stop/clear. Это только логическая отмена:
 * underlying promises продолжают выполняться, если их собственный API не
 * поддерживает cancellation.
 */
export type TaskScope = {
  latest(): LatestTask;
  cancelAll(): void;
};

const createTaskCancelledError = (): TaskCancelledError =>
  Object.assign(new Error("[lite-fsm] task was cancelled."), { [TASK_CANCELLED]: true as const });

export const isTaskCancelledError = (err: unknown): err is TaskCancelledError =>
  err instanceof Error && TASK_CANCELLED in err;

/**
 * Создаёт маленький scope логической отмены для async orchestration.
 *
 * Helper прячет generation-token checks за `run`, `checkpoint` и `step`, чтобы
 * вызывающий код описывал flow операции, а не ручные stale guards.
 */
export const createTaskScope = (): TaskScope => {
  let scopeVersion = 0;
  const clearActiveTasks = new Set<() => void>();

  const latest = (): LatestTask => {
    let taskVersion = 0;
    let activeScopeVersion = -1;
    let activeTaskVersion = -1;
    clearActiveTasks.add(() => {
      activeScopeVersion = -1;
      activeTaskVersion = -1;
    });

    const isActive = () => activeScopeVersion === scopeVersion && activeTaskVersion === taskVersion;

    const markActive = (runScopeVersion: number, runTaskVersion: number) => {
      activeScopeVersion = runScopeVersion;
      activeTaskVersion = runTaskVersion;
    };

    const clearActive = (runScopeVersion: number, runTaskVersion: number) => {
      if (activeScopeVersion !== runScopeVersion || activeTaskVersion !== runTaskVersion) return;
      activeScopeVersion = -1;
      activeTaskVersion = -1;
    };

    const run = async <T>(fn: (task: TaskContext) => MaybePromise<T>): Promise<T> => {
      const runScopeVersion = scopeVersion;
      const runTaskVersion = ++taskVersion;

      const isCurrent = () => runScopeVersion === scopeVersion && runTaskVersion === taskVersion;
      const checkpoint = () => {
        if (!isCurrent()) throw createTaskCancelledError();
      };
      const step = async <Value>(fn: () => MaybePromise<Value>) => {
        checkpoint();
        const result = await fn();
        checkpoint();
        return result;
      };

      markActive(runScopeVersion, runTaskVersion);
      try {
        return await fn({ isCurrent, checkpoint, step });
      } finally {
        clearActive(runScopeVersion, runTaskVersion);
      }
    };

    return {
      run,
      isActive,
    };
  };

  return {
    latest,
    cancelAll: () => {
      scopeVersion += 1;
      for (const clearActive of clearActiveTasks) clearActive();
    },
  };
};
