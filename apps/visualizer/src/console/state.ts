import type { ConsoleEntry, ConsoleState } from "./types";

export const createInitialConsoleState = (): ConsoleState => ({
  entries: [],
  channels: ["system", "diagnostics", "debug"],
});

export const appendConsoleEntries = (
  state: ConsoleState,
  entries: readonly ConsoleEntry[],
): ConsoleState => {
  if (entries.length === 0) return state;

  return {
    ...state,
    entries: [...state.entries, ...entries],
  };
};
