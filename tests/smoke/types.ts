import { Machine, MachineManager, createConfig, createEffect, createMachine, createReducer, defineMachine } from "lite-fsm";
import type { FSMEvent, MachineConfig, MachinesState } from "lite-fsm";
import { FSMContext, FSMContextProvider, defineMachine as defineReactMachine, useManager, useSelector, useTransition } from "lite-fsm/react";
import type { FSMContextType } from "lite-fsm/react";
import { devToolsMiddleware as devToolsMiddlewareAll, immerMiddleware as immerMiddlewareAll } from "lite-fsm/middleware";
import { devToolsMiddleware } from "lite-fsm/middleware/devTools";
import { immerMiddleware } from "lite-fsm/middleware/immer";

type SmokeEvent = FSMEvent<"START">;
type SmokeConfig = MachineConfig<any, any, SmokeEvent, {}>;

export type SmokeState = MachinesState<Record<string, SmokeConfig>>;
export type SmokeContext = FSMContextType<Record<string, SmokeConfig>, SmokeEvent>;

void Machine;
void MachineManager;
void createConfig;
void createEffect;
void createMachine;
void createReducer;
void defineMachine;
void FSMContext;
void FSMContextProvider;
void defineReactMachine;
void useManager;
void useSelector;
void useTransition;
void devToolsMiddlewareAll;
void immerMiddlewareAll;
void devToolsMiddleware;
void immerMiddleware;
