import { createControlledDiagnostic } from "../diagnostics";
import {
  buildSimulationOverlayInput,
  simulatorDiagnostics,
  type VisualizerInternalCommand,
  type WorkbenchEffectDescriptor,
  type WorkbenchStore,
} from "../workbench";
import type { GraphSimulationPendingChoice } from "@lite-fsm/graph/simulator";
import type { WorkbenchDiagnosticRef } from "../diagnostics";
import type { EffectRunnerServices, GraphSimulationSession } from "./types";

type CodegenPlanEffect = Extract<WorkbenchEffectDescriptor, { kind: "codegen.plan" }>;
type SimulationEffect = Extract<WorkbenchEffectDescriptor, { kind: `simulation.${string}` | "create-simulation-session" }>;

const simulationSessions = new WeakMap<EffectRunnerServices, GraphSimulationSession>();

const sourceVersionFromEffect = (effect: WorkbenchEffectDescriptor): number =>
  effect.kind === "compile" ? effect.source.version : effect.sourceVersion;

const simulationSnapshotCommand = (
  sourceVersion: number,
  session: GraphSimulationSession | undefined,
  status: "idle" | "running" | "blocked",
  diagnostics: readonly WorkbenchDiagnosticRef[] = [],
  pendingChoice?: GraphSimulationPendingChoice,
): VisualizerInternalCommand => {
  const snapshot = session?.getSnapshot();

  return {
    type: "simulation.snapshot.changed",
    sourceVersion,
    snapshot,
    status,
    pendingChoice,
    diagnostics,
    overlay: buildSimulationOverlayInput({
      snapshot,
      availableTransitions: session?.getAvailableTransitions() ?? [],
      suggestedEmissions: session?.getSuggestedEmissions() ?? [],
    }),
  };
};

const disposeSimulationSession = (services: EffectRunnerServices): void => {
  const current = simulationSessions.get(services);
  if (!current) return;

  current.dispose();
  simulationSessions.delete(services);
};

const activeSimulationSession = (
  services: EffectRunnerServices,
  sourceVersion: number,
): GraphSimulationSession | undefined => {
  const session = simulationSessions.get(services);
  if (!session) return undefined;
  if (session.sourceVersion === sourceVersion) return session;

  session.dispose();
  simulationSessions.delete(services);
  return undefined;
};

const missingSimulationSession = (sourceVersion: number): VisualizerInternalCommand =>
  simulationSnapshotCommand(sourceVersion, undefined, "blocked", [
    createControlledDiagnostic(sourceVersion, "simulator", "missing-simulation-session", "Graph simulation session is not active."),
  ]);

const runSimulationEffect = (
  effect: SimulationEffect,
  services: EffectRunnerServices,
): VisualizerInternalCommand | undefined => {
  if (effect.kind === "simulation.dispose") {
    disposeSimulationSession(services);
    return undefined;
  }

  if (effect.kind === "create-simulation-session") {
    disposeSimulationSession(services);
    const session = services.simulation.createSession({
      document: effect.document,
      sourceVersion: effect.sourceVersion,
      scope: effect.scope,
      initialStateOverrides: effect.initialStateOverrides,
      initialContextOverrides: effect.initialContextOverrides,
    });
    simulationSessions.set(services, session);

    const started = session.start();
    if (started.ok) {
      return simulationSnapshotCommand(effect.sourceVersion, session, "running");
    }

    return simulationSnapshotCommand(
      effect.sourceVersion,
      session,
      "blocked",
      simulatorDiagnostics(effect.sourceVersion, started.diagnostics, started.reason),
    );
  }

  const session = activeSimulationSession(services, effect.sourceVersion);
  if (!session) return missingSimulationSession(effect.sourceVersion);

  if (effect.kind === "simulation.reset") {
    const reset = session.reset({
      initialStateOverrides: effect.initialStateOverrides,
      initialContextOverrides: effect.initialContextOverrides,
    });
    if (reset.ok) return simulationSnapshotCommand(effect.sourceVersion, session, "running");

    return simulationSnapshotCommand(
      effect.sourceVersion,
      session,
      "blocked",
      simulatorDiagnostics(effect.sourceVersion, reset.diagnostics, reset.reason),
    );
  }

  const result =
    effect.kind === "simulation.send"
      ? session.send({ event: effect.event })
      : effect.kind === "simulation.send-from-transition"
        ? session.sendFromTransition({
            slice: effect.target.slice,
            transitionId: effect.target.transitionId,
            ...(effect.payload === undefined ? {} : { payload: effect.payload }),
          })
        : session.sendFromEmission({
            slice: effect.target.slice,
            emissionId: effect.target.emissionId,
            ...(effect.payload === undefined ? {} : { payload: effect.payload }),
          });

  if (result.ok) return simulationSnapshotCommand(effect.sourceVersion, session, "running");

  return simulationSnapshotCommand(
    effect.sourceVersion,
    session,
    "blocked",
    simulatorDiagnostics(effect.sourceVersion, result.diagnostics, result.reason),
    result.pendingChoice,
  );
};

export const runWorkbenchEffect = async (
  effect: WorkbenchEffectDescriptor,
  services: EffectRunnerServices,
): Promise<VisualizerInternalCommand | undefined> => {
  try {
    if (effect.kind === "compile") {
      const response = await services.compiler.compile({
        requestId: effect.requestId,
        sourceVersion: effect.source.version,
        source: effect.source,
      });

      if (response.ok) {
        return {
          type: "compile.succeeded",
          requestId: effect.requestId,
          sourceVersion: response.sourceVersion,
          document: response.document,
        };
      }

      return {
        type: "compile.failed",
        requestId: effect.requestId,
        sourceVersion: response.sourceVersion,
        diagnostics: response.diagnostics,
      };
    }

    if (effect.kind === "analyze") {
      const response = await services.analyzer.analyze({
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        document: effect.document,
      });

      if (response.ok) {
        return {
          type: "analysis.succeeded",
          requestId: effect.requestId,
          sourceVersion: response.sourceVersion,
          diagnostics: response.diagnostics,
        };
      }

      return {
        type: "analysis.failed",
        requestId: effect.requestId,
        sourceVersion: response.sourceVersion,
        diagnostics: response.diagnostics,
      };
    }

    if (effect.kind === "build-model") {
      const response = await services.visualizerModel.build({
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        document: effect.document,
        analysisDiagnostics: effect.analysisDiagnostics,
        simulation: effect.simulation,
      });

      if (response.ok) {
        return {
          type: "model.succeeded",
          requestId: effect.requestId,
          sourceVersion: response.sourceVersion,
          purpose: effect.purpose ?? "pipeline",
          model: response.model,
        };
      }

      return {
        type: "model.failed",
        requestId: effect.requestId,
        sourceVersion: response.sourceVersion,
        diagnostics: response.diagnostics,
      };
    }

    if (effect.kind === "create-simulation-session" || effect.kind.startsWith("simulation.")) {
      return runSimulationEffect(effect as SimulationEffect, services);
    }

    if (effect.kind === "run-validation") {
      const diagnostics = await services.validation.run({
        sourceVersion: effect.sourceVersion,
        document: effect.document,
        model: effect.model,
      });

      return {
        type: "validation.succeeded",
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        diagnostics,
      };
    }

    /* v8 ignore next -- non-codegen simulation descriptors are no-op in 12a and cannot throw before this branch. */
    if (effect.kind === "codegen.plan") {
      const result = await services.codegen.plan({
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        sourceHash: effect.sourceHash,
        intent: effect.intent,
      });

      return {
        type: "codegen.plan.completed",
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        result,
      };
    }

    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown visualizer service failure.";
    const diagnostic = createControlledDiagnostic(sourceVersionFromEffect(effect), "host", "effect-runner-failed", message);

    if (effect.kind === "compile") {
      return {
        type: "compile.failed",
        requestId: effect.requestId,
        sourceVersion: effect.source.version,
        diagnostics: [diagnostic],
      };
    }

    if (effect.kind === "analyze") {
      return {
        type: "analysis.failed",
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        diagnostics: [diagnostic],
      };
    }

    if (effect.kind === "build-model") {
      return {
        type: "model.failed",
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        diagnostics: [diagnostic],
      };
    }

    if (effect.kind === "run-validation") {
      return {
        type: "validation.failed",
        requestId: effect.requestId,
        sourceVersion: effect.sourceVersion,
        diagnostics: [diagnostic],
      };
    }

    if (effect.kind === "create-simulation-session" || effect.kind.startsWith("simulation.")) {
      return {
        type: "simulation.snapshot.changed",
        sourceVersion: sourceVersionFromEffect(effect),
        status: "blocked",
        diagnostics: [diagnostic],
      };
    }

    const codegenEffect = effect as CodegenPlanEffect;

    return {
      type: "codegen.plan.failed",
      requestId: codegenEffect.requestId,
      sourceVersion: codegenEffect.sourceVersion,
      diagnostics: [diagnostic],
    };
  }
};

export const runWorkbenchEffects = (
  effects: readonly WorkbenchEffectDescriptor[],
  services: EffectRunnerServices,
  store: WorkbenchStore,
): void => {
  for (const effect of effects) {
    void runWorkbenchEffect(effect, services).then((command) => {
      if (!command) return;

      const output = store.dispatch(command);
      runWorkbenchEffects(output.effects, services, store);
    });
  }
};
