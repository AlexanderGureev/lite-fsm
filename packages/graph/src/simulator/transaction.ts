import { getSuggestedEmissionsForSnapshot } from "./emissions";
import { evaluateCandidate, type SimulationEvaluation, type SimulationRuntime } from "./evaluate";
import { resolveAvailableTransitions } from "./resolve";
import { blockedCode, followFailure, transitionFailure } from "./results";
import { cloneSnapshot } from "./state";
import type {
  GraphAvailableTransition,
  GraphChooseTransitionInput,
  GraphFollowEmissionInput,
  GraphFollowEmissionResult,
  GraphSendInput,
  GraphSendResult,
  GraphSimulationSnapshot,
  GraphSimulationStep,
  GraphSuggestedEmission,
} from "./types";

export type { SimulationRuntime } from "./evaluate";

type SimulationCommand =
  | { kind: "send"; input: GraphSendInput }
  | { kind: "choose"; input: GraphChooseTransitionInput }
  | { kind: "followEmission"; input: GraphFollowEmissionInput };

type TransactionContext = {
  runtime: SimulationRuntime;
  snapshot: GraphSimulationSnapshot;
  command: SimulationCommand;
  emission?: GraphSuggestedEmission;
};

type CommandFilter = {
  event?: string;
  transitionId?: string;
};

type TransactionOutcome = {
  result: GraphSendResult | GraphFollowEmissionResult;
  snapshot?: GraphSimulationSnapshot;
};

type FailureReason =
  | Exclude<GraphSendResult, { ok: true }>["reason"]
  | Exclude<GraphFollowEmissionResult, { ok: true }>["reason"];

const causeOf = (command: SimulationCommand): "external" | "effect" =>
  command.kind === "followEmission" ? "effect" : "external";

// FailureReason — это объединение reason'ов обоих result-типов; конкретный builder
// узок по типу. Ветвление по command.kind гарантирует, что в каждый builder придёт
// только подходящий reason — TypeScript этого не доказывает, поэтому два локальных каста.
const failure = (
  ctx: TransactionContext,
  reason: FailureReason,
  code: string,
  message: string,
  candidates?: GraphAvailableTransition[],
): GraphSendResult | GraphFollowEmissionResult => {
  if (ctx.command.kind === "followEmission") {
    return followFailure(
      ctx.runtime.machine,
      ctx.snapshot,
      reason as Exclude<GraphFollowEmissionResult, { ok: true }>["reason"],
      code,
      message,
      { emission: ctx.emission, candidates },
    );
  }

  return transitionFailure(
    ctx.runtime.machine,
    ctx.snapshot,
    reason as Exclude<GraphSendResult, { ok: true }>["reason"],
    code,
    message,
    candidates,
  );
};

const prepareCommand = (
  ctx: TransactionContext,
): { ctx: TransactionContext; filter: CommandFilter } | { result: GraphFollowEmissionResult } => {
  const command = ctx.command;
  if (command.kind === "send") return { ctx, filter: { event: command.input.event } };
  if (command.kind === "choose") return { ctx, filter: { transitionId: command.input.transitionId } };

  const emission = getSuggestedEmissionsForSnapshot(ctx.runtime.machine, ctx.runtime.index, ctx.snapshot).find(
    (candidate) => candidate.emissionId === command.input.emissionId,
  );

  if (!emission) {
    return {
      result: followFailure(
        ctx.runtime.machine,
        ctx.snapshot,
        "unknown-emission",
        "LFG_SIM_UNKNOWN_EMISSION",
        `Emission '${command.input.emissionId}' is not suggested from the current graph state.`,
      ),
    };
  }

  if (emission.routing.kind !== "default") {
    return {
      result: followFailure(
        ctx.runtime.machine,
        ctx.snapshot,
        "non-local-routing",
        "LFG_SIM_NON_LOCAL_ROUTING",
        `Emission '${command.input.emissionId}' is routed outside the local machine simulator.`,
        { emission },
      ),
    };
  }

  return {
    ctx: { ...ctx, emission },
    filter: { event: emission.event.type },
  };
};

const selectCandidate = (
  ctx: TransactionContext,
  candidates: GraphAvailableTransition[],
  filter: CommandFilter,
): { selected: GraphAvailableTransition } | { result: GraphSendResult | GraphFollowEmissionResult } => {
  if (filter.transitionId !== undefined) {
    const selected = candidates.find((candidate) => candidate.transitionId === filter.transitionId);
    if (selected) return { selected };

    return {
      result: failure(
        ctx,
        "unknown-transition",
        "LFG_SIM_UNKNOWN_TRANSITION",
        `Transition '${filter.transitionId}' is not available from the current graph state.`,
      ),
    };
  }

  if (candidates.length === 0) {
    return {
      result: failure(
        ctx,
        "event-not-accepted",
        "LFG_SIM_EVENT_NOT_ACCEPTED",
        `Event '${filter.event}' is not accepted by the current graph state.`,
      ),
    };
  }

  if (candidates.length > 1) {
    return {
      result: failure(
        ctx,
        "ambiguous-transition",
        "LFG_SIM_AMBIGUOUS_TRANSITION",
        `Event '${filter.event}' has multiple symbolic transition branches.`,
        candidates,
      ),
    };
  }

  return { selected: candidates[0]! };
};

const commit = (
  ctx: TransactionContext,
  selected: GraphAvailableTransition,
  evaluation: Extract<SimulationEvaluation, { ok: true }>,
): { snapshot: GraphSimulationSnapshot; step: GraphSimulationStep } => {
  const step: GraphSimulationStep = {
    event: selected.event.type,
    acceptedTransitionId: selected.acceptedTransitionId,
    effectiveTransitionId: selected.effectiveTransitionId,
    transitionId: selected.transitionId,
    emissionId: ctx.command.kind === "followEmission" ? ctx.command.input.emissionId : undefined,
    cause: causeOf(ctx.command),
    from: ctx.snapshot.stateKey,
    to: evaluation.nextState.stateKey,
    guard: selected.guard?.text,
  };

  return {
    step,
    snapshot: {
      machineId: ctx.runtime.machine.id,
      stateId: evaluation.nextState.stateId,
      stateKey: evaluation.nextState.stateKey,
      history: [...ctx.snapshot.history, step],
    },
  };
};

const success = (
  ctx: TransactionContext,
  committed: { snapshot: GraphSimulationSnapshot; step: GraphSimulationStep },
): TransactionOutcome => ({
  result: {
    ok: true,
    snapshot: cloneSnapshot(committed.snapshot),
    step: { ...committed.step },
    suggestedEmissions: getSuggestedEmissionsForSnapshot(ctx.runtime.machine, ctx.runtime.index, committed.snapshot),
  },
  snapshot: committed.snapshot,
});

export function runSimulationTransaction(
  runtime: SimulationRuntime,
  snapshot: GraphSimulationSnapshot,
  command: Extract<SimulationCommand, { kind: "send" | "choose" }>,
): { result: GraphSendResult; snapshot?: GraphSimulationSnapshot };
export function runSimulationTransaction(
  runtime: SimulationRuntime,
  snapshot: GraphSimulationSnapshot,
  command: Extract<SimulationCommand, { kind: "followEmission" }>,
): { result: GraphFollowEmissionResult; snapshot?: GraphSimulationSnapshot };
export function runSimulationTransaction(
  runtime: SimulationRuntime,
  snapshot: GraphSimulationSnapshot,
  command: SimulationCommand,
): TransactionOutcome {
  const prepared = prepareCommand({ runtime, snapshot, command });
  if ("result" in prepared) return { result: prepared.result };

  const candidates = resolveAvailableTransitions(runtime.machine, runtime.index, snapshot, prepared.filter.event);

  const selection = selectCandidate(prepared.ctx, candidates, prepared.filter);
  if ("result" in selection) return { result: selection.result };

  const evaluation = evaluateCandidate(runtime, snapshot, selection.selected);
  if (!evaluation.ok) {
    return {
      result: failure(
        prepared.ctx,
        evaluation.reason,
        blockedCode(evaluation.reason),
        "Selected transition cannot be committed to a stable graph state.",
      ),
    };
  }

  return success(prepared.ctx, commit(prepared.ctx, selection.selected, evaluation));
}
