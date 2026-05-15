import {
  DEFAULT_CONSOLE_FILTERS,
  type ConsoleChannelFilter,
  type ConsoleEntry,
  type ConsoleFilterKey,
  type ConsoleScope,
  type ConsoleState,
} from "./types";

export const createInitialConsoleState = (): ConsoleState => ({
  entries: [],
  channels: ["system", "diagnostics", "debug"],
  selectedChannel: "all",
  filters: DEFAULT_CONSOLE_FILTERS,
});

const withoutConsoleScope = (state: ConsoleState): ConsoleState => {
  if (!state.scope) return state;
  const { scope, ...unscoped } = state;
  void scope;

  return unscoped;
};

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
  if (state.entries.length === 0 && !state.scope) return state;
  const unscoped = withoutConsoleScope(state);

  return {
    ...unscoped,
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

export const setConsoleQuery = (state: ConsoleState, query: string): ConsoleState => {
  if (query === state.filters.query) return state;

  return {
    ...state,
    filters: {
      ...state.filters,
      query,
    },
  };
};

export const setConsoleFilter = (state: ConsoleState, filter: ConsoleFilterKey, value: string): ConsoleState => {
  if (state.filters[filter] === value) return state;

  return {
    ...state,
    filters: {
      ...state.filters,
      [filter]: value,
    },
  };
};

export const setConsoleScope = (state: ConsoleState, scope: ConsoleScope): ConsoleState => ({
  ...state,
  selectedChannel: "diagnostics",
  filters: DEFAULT_CONSOLE_FILTERS,
  scope,
});

export const clearConsoleScope = (state: ConsoleState): ConsoleState => {
  if (!state.scope) return state;

  return withoutConsoleScope(state);
};

export const resetConsoleFilters = (state: ConsoleState): ConsoleState => {
  if (state.selectedChannel === "all" && state.filters === DEFAULT_CONSOLE_FILTERS && !state.scope) return state;
  const unscoped = withoutConsoleScope(state);

  return {
    ...unscoped,
    selectedChannel: "all",
    filters: DEFAULT_CONSOLE_FILTERS,
  };
};
