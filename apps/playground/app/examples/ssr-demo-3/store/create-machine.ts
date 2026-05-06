import type { TypedCreateMachineFn } from "@lite-fsm/core";
import { createMachine as baseCreateMachine } from "@lite-fsm/core";

import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = baseCreateMachine;
