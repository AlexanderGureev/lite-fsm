import type { TypedCreateMachineFn } from "lite-fsm";
import { createMachine as baseCreateMachine } from "lite-fsm";

import type { AppDeps, AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = baseCreateMachine;
