import type { StorageDispatchContext } from "./storage";

export const TRANSITION_TRACE_COLLECTOR_SYMBOL = Symbol.for("@lite-fsm/performance-trace");
export const TRANSITION_TRACE_RUNTIME_KEY = "@lite-fsm/core/transition-trace";

export type TransitionTraceStatus = "ok" | "error";

export type TransitionTracePhaseMetadata = {
  readonly runtimeKind?: string;
};

export type TransitionTracePhaseRecord = {
  readonly key: string;
  readonly durationMs: number;
  readonly runtimeKind?: string;
};

export type TransitionTraceCounterRecord = {
  readonly key: string;
  readonly value: number;
};

export type TransitionTraceRecord = {
  readonly actionType: string | undefined;
  readonly depth: number;
  readonly status: TransitionTraceStatus;
  readonly phases: readonly TransitionTracePhaseRecord[];
  readonly counters: readonly TransitionTraceCounterRecord[];
};

export type TransitionTraceCollector = {
  readonly records: TransitionTraceRecord[];
};

export type TransitionTraceSession = {
  readonly depth: number;
  now(): number;
  record(key: string, startedAt: number, metadata?: TransitionTracePhaseMetadata): void;
  count(key: string, value?: number): void;
  finish(status: TransitionTraceStatus): void;
};

let activeTraceDepth = 0;

const getTraceCollector = (): TransitionTraceCollector | undefined => {
  const value = (globalThis as Record<symbol, unknown>)[TRANSITION_TRACE_COLLECTOR_SYMBOL];
  if (!value || typeof value !== "object") return undefined;

  const records = (value as { readonly records?: unknown }).records;
  if (!Array.isArray(records)) return undefined;

  return value as TransitionTraceCollector;
};

export const createTransitionTraceSession = (actionType: string | undefined): TransitionTraceSession | undefined => {
  const collector = getTraceCollector();
  if (!collector) return undefined;

  const depth = activeTraceDepth;
  activeTraceDepth += 1;
  const phases: TransitionTracePhaseRecord[] = [];
  const counters: TransitionTraceCounterRecord[] = [];
  let finished = false;

  return {
    depth,
    now() {
      return performance.now();
    },
    record(key, startedAt, metadata) {
      if (finished) return;
      const durationMs = performance.now() - startedAt;
      if (metadata?.runtimeKind !== undefined) {
        phases.push({ key, durationMs, runtimeKind: metadata.runtimeKind });
        return;
      }
      phases.push({ key, durationMs });
    },
    count(key, value = 1) {
      if (finished) return;
      counters.push({ key, value });
    },
    finish(status) {
      if (finished) return;
      finished = true;
      activeTraceDepth -= 1;
      collector.records.push({
        actionType,
        depth,
        status,
        phases,
        counters,
      });
    },
  };
};

export const attachTransitionTraceSession = (
  dispatch: StorageDispatchContext,
  session: TransitionTraceSession | undefined,
): void => {
  if (!session) return;
  dispatch.runtime.set(TRANSITION_TRACE_RUNTIME_KEY, session);
};

export const readTransitionTraceSession = (dispatch: StorageDispatchContext): TransitionTraceSession | undefined => {
  const session = dispatch.runtime.get(TRANSITION_TRACE_RUNTIME_KEY);
  if (!session || typeof session !== "object") return undefined;

  const candidate = session as Partial<TransitionTraceSession>;
  if (
    typeof candidate.depth !== "number" ||
    typeof candidate.now !== "function" ||
    typeof candidate.record !== "function" ||
    typeof candidate.count !== "function" ||
    typeof candidate.finish !== "function"
  ) {
    return undefined;
  }

  return candidate as TransitionTraceSession;
};
