import {
  LiteFsmError,
  Machine,
  MachineManager,
  createActorMeta,
  createConfig,
  createEffect,
  createMachine,
  createReducer,
  defineMachine,
} from "lite-fsm";
import type { FSMEvent, MachineConfig, MachinesState } from "lite-fsm";
import {
  FSMContext,
  FSMContextProvider,
  FSMHydrationBoundary,
  defineMachine as defineReactMachine,
  useHydrateSnapshot,
  useManager,
  useSelector,
  useTransition,
} from "lite-fsm/react";
import type { FSMContextType, FSMHydrationBoundaryProps } from "lite-fsm/react";
import { devToolsMiddleware as devToolsMiddlewareAll, immerMiddleware as immerMiddlewareAll } from "lite-fsm/middleware";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";

type SmokeEvent = FSMEvent<"START">;
type SmokeConfig = MachineConfig<any, any, SmokeEvent, {}>;

export type SmokeState = MachinesState<Record<string, SmokeConfig>>;
export type SmokeContext = FSMContextType<Record<string, SmokeConfig>, SmokeEvent>;

void Machine;
void MachineManager;
void createActorMeta;
void createConfig;
void createEffect;
void createMachine;
void createReducer;
void defineMachine;
void LiteFsmError;
void FSMContext;
void FSMContextProvider;
void FSMHydrationBoundary;
void defineReactMachine;
void useHydrateSnapshot;
void useManager;
void useSelector;
void useTransition;
void devToolsMiddlewareAll;
void immerMiddlewareAll;
void devToolsMiddleware;
void immerMiddleware;

export type SmokeHydrationBoundaryProps = FSMHydrationBoundaryProps<Record<string, SmokeConfig>>;
