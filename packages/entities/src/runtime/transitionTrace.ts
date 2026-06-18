type RuntimeCarrier = {
  readonly runtime: Map<string, unknown>;
};

type EntityTransitionTracePhaseMetadata = {
  readonly runtimeKind?: string;
};

export type EntityTransitionTraceSession = {
  readonly depth: number;
  now(): number;
  record(key: string, startedAt: number, metadata?: EntityTransitionTracePhaseMetadata): void;
  count(key: string, value?: number): void;
  finish(status: "ok" | "error"): void;
};

const TRANSITION_TRACE_RUNTIME_KEY = "@lite-fsm/core/transition-trace";

export const readEntityTransitionTraceSession = (
  carrier: RuntimeCarrier,
): EntityTransitionTraceSession | undefined => {
  const session = carrier.runtime.get(TRANSITION_TRACE_RUNTIME_KEY);
  if (!session || typeof session !== "object") return undefined;

  const candidate = session as Partial<EntityTransitionTraceSession>;
  if (
    typeof candidate.depth !== "number" ||
    typeof candidate.now !== "function" ||
    typeof candidate.record !== "function" ||
    typeof candidate.count !== "function" ||
    typeof candidate.finish !== "function"
  ) {
    return undefined;
  }

  return candidate as EntityTransitionTraceSession;
};

export const recordEntityTracePhase = (
  trace: EntityTransitionTraceSession | undefined,
  key: string,
  startedAt: number | undefined,
): void => {
  if (!trace || startedAt === undefined) return;
  trace.record(key, startedAt);
};

export const recordEntityTraceCounter = (
  trace: EntityTransitionTraceSession | undefined,
  key: string,
  value?: number,
): void => {
  if (!trace) return;
  trace.count(key, value);
};

export const tracePhase = <T>(
  trace: EntityTransitionTraceSession | undefined,
  key: string,
  fn: () => T,
): T => {
  if (!trace) return fn();

  const startedAt = trace.now();
  try {
    return fn();
  } finally {
    trace.record(key, startedAt);
  }
};

export const traceDispatchPhase = <T>(carrier: RuntimeCarrier, key: string, fn: () => T): T =>
  tracePhase(readEntityTransitionTraceSession(carrier), key, fn);
