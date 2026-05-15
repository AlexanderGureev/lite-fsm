export {
  appendConsoleEntries,
  clearConsoleScope,
  createInitialConsoleState,
  resetConsoleEntries,
  resetConsoleFilters,
  selectConsoleChannel,
  setConsoleFilter,
  setConsoleQuery,
  setConsoleScope,
} from "./state";
export {
  createConsoleEntryFromDiagnostic,
  createSystemConsoleEntry,
  DEFAULT_CONSOLE_FILTERS,
  EMPTY_CONSOLE_ENTRIES,
  machineIdForConsoleEntry,
} from "./types";
export type {
  ConsoleChannel,
  ConsoleChannelFilter,
  ConsoleChannelView,
  ConsoleDiagnosticScope,
  ConsoleEntry,
  ConsoleFacetOption,
  ConsoleFilterKey,
  ConsoleFilters,
  ConsoleHotspotView,
  ConsolePanelView,
  ConsoleScope,
  ConsoleSeverityFilter,
  ConsoleSeveritySummary,
  ConsoleState,
} from "./types";
