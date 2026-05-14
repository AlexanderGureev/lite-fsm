import type { WorkbenchDiagnosticRef } from "../diagnostics";
import { formatSourceLocationLabel } from "../lib/source-location";

export type ConsoleChannel = "system" | "diagnostics" | "debug";
export type ConsoleChannelFilter = "all" | ConsoleChannel;

const diagnosticLocationLabel = (diagnostic: WorkbenchDiagnosticRef): string | undefined => {
  const loc = diagnostic.sourceAnchors.find((anchor) => anchor.loc)?.loc ?? diagnostic.diagnostic.loc;
  if (!loc) return undefined;

  return formatSourceLocationLabel(loc);
};

export type ConsoleEntry = {
  entryId: string;
  sourceVersion: number;
  channel: ConsoleChannel;
  title: string;
  message: string;
  diagnosticId?: string;
  origin?: WorkbenchDiagnosticRef["origin"];
  severity?: WorkbenchDiagnosticRef["diagnostic"]["severity"];
  locationLabel?: string;
  target?: WorkbenchDiagnosticRef["primaryTarget"];
};

export type ConsoleState = {
  entries: readonly ConsoleEntry[];
  channels: readonly ConsoleChannel[];
  selectedChannel: ConsoleChannelFilter;
};

export type ConsoleChannelView = {
  channel: ConsoleChannelFilter;
  label: string;
  count: number;
  selected: boolean;
};

export type ConsolePanelView = {
  open: boolean;
  selectedEntryId?: string;
  selectedChannel: ConsoleChannelFilter;
  channels: readonly ConsoleChannelView[];
  entries: readonly ConsoleEntry[];
  totalEntries: number;
};

export const EMPTY_CONSOLE_ENTRIES: readonly ConsoleEntry[] = [];

export const createConsoleEntryFromDiagnostic = (diagnostic: WorkbenchDiagnosticRef): ConsoleEntry => {
  const locationLabel = diagnosticLocationLabel(diagnostic);

  return {
    entryId: `diagnostic:${diagnostic.diagnosticId}`,
    sourceVersion: diagnostic.sourceVersion,
    channel: "diagnostics",
    title: diagnostic.diagnostic.code,
    message: diagnostic.diagnostic.message,
    diagnosticId: diagnostic.diagnosticId,
    origin: diagnostic.origin,
    severity: diagnostic.diagnostic.severity,
    ...(locationLabel ? { locationLabel } : {}),
    target: diagnostic.primaryTarget,
  };
};

export const createSystemConsoleEntry = (
  sourceVersion: number,
  key: string,
  title: string,
  message: string,
): ConsoleEntry => ({
  entryId: `system:${sourceVersion}:${key}`,
  sourceVersion,
  channel: "system",
  title,
  message,
});
