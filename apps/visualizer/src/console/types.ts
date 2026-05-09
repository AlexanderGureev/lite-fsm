import type { WorkbenchDiagnosticRef } from "../diagnostics";

export type ConsoleChannel = "system" | "diagnostics" | "debug";

export type ConsoleEntry = {
  entryId: string;
  sourceVersion: number;
  channel: ConsoleChannel;
  title: string;
  message: string;
  diagnosticId?: string;
};

export type ConsoleState = {
  entries: readonly ConsoleEntry[];
  channels: readonly ConsoleChannel[];
};

export type ConsolePanelView = {
  open: boolean;
  selectedEntryId?: string;
  entries: readonly ConsoleEntry[];
};

export const EMPTY_CONSOLE_ENTRIES: readonly ConsoleEntry[] = [];

export const createConsoleEntryFromDiagnostic = (diagnostic: WorkbenchDiagnosticRef): ConsoleEntry => ({
  entryId: `diagnostic:${diagnostic.diagnosticId}`,
  sourceVersion: diagnostic.sourceVersion,
  channel: "diagnostics",
  title: diagnostic.diagnostic.code,
  message: diagnostic.diagnostic.message,
  diagnosticId: diagnostic.diagnosticId,
});
