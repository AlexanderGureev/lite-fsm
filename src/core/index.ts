import { TypedCreateMachineFn } from "./types";

export { Machine } from "./Machine";
export { MachineManager } from "./MachineManager";
export type * from "./types";

export const createMachine: TypedCreateMachineFn = (cfg) => cfg;
