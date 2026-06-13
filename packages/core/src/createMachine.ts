// Публичный runtime entry для createMachine: identity-функция, чьи входной и результирующий
// тип формируются в createMachine.types.ts. Сам runtime не делает копирования или валидации —
// плоская passthrough к downstream factories (Machine, MachineManager).

import type { AnyEvent, AnyRecord, CFG } from "./types";
import type {
  ConfigKeys,
  ConfigTargetStates,
  CoreCreateMachineInput,
  CoreCreateMachineResult,
  CreateMachineFn,
} from "./createMachine.types";

export type { TypedCreateMachineFn } from "./createMachine.types";

const createMachineImpl = <
  P extends AnyEvent = AnyEvent,
  D extends AnyRecord = {},
  C extends CFG<C, P, ConfigKeys<C>, ConfigTargetStates<C>> = Record<string, never>,
  T extends AnyRecord = {},
  Snapshot = unknown,
  Persistence = undefined,
>(
  cfg: CoreCreateMachineInput<C, T, P, D, Snapshot, Persistence>,
): CoreCreateMachineResult<C, T, P, D, Snapshot, Persistence> =>
  cfg as CoreCreateMachineResult<C, T, P, D, Snapshot, Persistence>;

export const createMachine = createMachineImpl as CreateMachineFn;
