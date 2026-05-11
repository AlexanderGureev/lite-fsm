import { createGraphSimulator } from "@lite-fsm/graph/simulator";
import type {
  CreateSimulationSessionRequest,
  GraphSimulationService,
  GraphSimulationSession,
} from "./types";

export type LocalSimulationServiceDependencies = {
  createSimulator?: typeof createGraphSimulator;
};

export const createLocalSimulationService = (
  dependencies: LocalSimulationServiceDependencies = {},
): GraphSimulationService => ({
  createSession(input: CreateSimulationSessionRequest): GraphSimulationSession {
    const simulator = (dependencies.createSimulator ?? createGraphSimulator)(input.document, {
      ...input.simulatorOptions,
      scope: input.scope,
      initialStateOverrides: input.initialStateOverrides,
      initialContextOverrides: input.initialContextOverrides,
    });

    return {
      sourceVersion: input.sourceVersion,
      scope: input.scope,
      start: () => simulator.start(),
      reset: (resetInput) => simulator.reset(resetInput),
      getSnapshot: () => simulator.getSnapshot(),
      getAvailableTransitions: (availableInput) => simulator.getAvailableTransitions(availableInput),
      getSuggestedEmissions: (emissionInput) => simulator.getSuggestedEmissions(emissionInput),
      send: (sendInput) => simulator.send(sendInput),
      sendFromTransition: (sendInput) => simulator.sendFromTransition(sendInput),
      sendFromEmission: (sendInput) => simulator.sendFromEmission(sendInput),
      choose: (chooseInput) => simulator.choose(chooseInput),
      dispose: () => {
        // The graph simulator is currently headless and owns no external handles.
      },
    };
  },
});
