import type { NormalizedMachineName } from "./name.js";

export const createMachineFileContents = (machine: NormalizedMachineName): string => `import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

export type Events = FSMEvent<"${machine.eventType}">;

export const ${machine.exportName} = createMachine({
  config: {
    IDLE: { ${machine.eventType}: "READY" },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
});
`;
