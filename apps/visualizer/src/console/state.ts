import type { ConsoleChannelFilter, ConsoleEntry, ConsoleState } from "./types";

export const createInitialConsoleState = (): ConsoleState => ({
  entries: [],
  channels: ["system", "diagnostics", "debug"],
  selectedChannel: "all",
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

export const resetConsoleEntries = (state: ConsoleState): ConsoleState => {
  if (state.entries.length === 0) return state;

  return {
    ...state,
    entries: [],
  };
};

export const selectConsoleChannel = (
  state: ConsoleState,
  selectedChannel: ConsoleChannelFilter,
): ConsoleState => {
  if (selectedChannel === state.selectedChannel) return state;

  return {
    ...state,
    selectedChannel,
  };
};
