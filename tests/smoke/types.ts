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
import {
  devToolsMiddleware as devToolsMiddlewareAll,
  immerMiddleware as immerMiddlewareAll,
} from "lite-fsm/middleware";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";
import { createJsonStorage, persistManager } from "lite-fsm/persist";
import type { PersistController, PersistStorage } from "lite-fsm/persist";
import { useIsPersistRestoring, usePersistStatus } from "lite-fsm/persist/react";

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
void createJsonStorage;
void persistManager;
void useIsPersistRestoring;
void usePersistStatus;

export type SmokeHydrationBoundaryProps = FSMHydrationBoundaryProps<Record<string, SmokeConfig>>;
export type SmokePersistStorage = PersistStorage<Record<string, SmokeConfig>>;
export type SmokePersistController = PersistController;
