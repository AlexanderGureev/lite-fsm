import { createControlledDiagnostic } from "../diagnostics";
import type { VisualizerInternalCommand, WorkbenchEffectDescriptor, WorkbenchStore } from "../workbench";
import type { EffectRunnerServices } from "./types";

type CodegenPlanEffect = Extract<WorkbenchEffectDescriptor, { kind: "codegen.plan" }>;

const sourceVersionFromEffect = (effect: WorkbenchEffectDescriptor): number =>
  effect.kind === "compile" ? effect.source.version : effect.sourceVersion;

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
