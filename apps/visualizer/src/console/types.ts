import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import type { WorkbenchDiagnosticRef } from "../diagnostics";
import { formatSourceLocationLabel } from "../lib/source-location";

export type ConsoleChannel = "system" | "diagnostics" | "debug";
export type ConsoleChannelFilter = "all" | ConsoleChannel;
export type ConsoleSeverityFilter = "all" | WorkbenchDiagnosticRef["diagnostic"]["severity"];
export type ConsoleFacetFilter = "all" | string;
export type ConsoleFilterKey = "severity" | "origin" | "machineId" | "code";

export type ConsoleDiagnosticScope = {
  kind: "diagnostics";
  owner: {
    kind: "machine" | "topic";
    id: string;
    label: string;
  };
  diagnosticIds: readonly string[];
};

export type ConsoleScope = ConsoleDiagnosticScope;

export type ConsoleFilters = {
  query: string;
  severity: ConsoleSeverityFilter;
  origin: ConsoleFacetFilter;
  machineId: ConsoleFacetFilter;
  code: ConsoleFacetFilter;
};

export const DEFAULT_CONSOLE_FILTERS: ConsoleFilters = {
  query: "",
  severity: "all",
  origin: "all",
  machineId: "all",
  code: "all",
};

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
  machineId?: string;
  locationLabel?: string;
  sourceAnchor?: GraphSourceAnchor;
  target?: WorkbenchDiagnosticRef["primaryTarget"];
};

export type ConsoleState = {
  entries: readonly ConsoleEntry[];
  channels: readonly ConsoleChannel[];
  selectedChannel: ConsoleChannelFilter;
  filters: ConsoleFilters;
  scope?: ConsoleScope;
};

export type ConsoleChannelView = {
  channel: ConsoleChannelFilter;
  label: string;
  count: number;
  selected: boolean;
};

export type ConsoleFacetOption = {
  value: string;
  label: string;
  count: number;
  selected: boolean;
};

export type ConsoleSeveritySummary = {
  severity: Exclude<ConsoleSeverityFilter, "all">;
  count: number;
  selected: boolean;
};

export type ConsoleHotspotView = {
  filter: Exclude<ConsoleFilterKey, "severity">;
  value: string;
  label: string;
  count: number;
  selected: boolean;
};

export type ConsolePanelView = {
  open: boolean;
  scope?: ConsoleScope;
  selectedEntryId?: string;
  selectedChannel: ConsoleChannelFilter;
  channels: readonly ConsoleChannelView[];
  entries: readonly ConsoleEntry[];
  filters: ConsoleFilters;
  severitySummary: readonly ConsoleSeveritySummary[];
  originOptions: readonly ConsoleFacetOption[];
  machineOptions: readonly ConsoleFacetOption[];
  codeOptions: readonly ConsoleFacetOption[];
  hotspots: readonly ConsoleHotspotView[];
  channelEntryCount: number;
  totalEntries: number;
  activeFilterCount: number;
  emptyReason?: "no-entries" | "filtered";
};

export const EMPTY_CONSOLE_ENTRIES: readonly ConsoleEntry[] = [];

const machineIdFromGraphRef = (ref: WorkbenchDiagnosticRef["graphItemRef"]): string | undefined => {
  if (!ref) return undefined;
  if ("machineId" in ref) return ref.machineId;

  return undefined;
};

const machineIdFromTarget = (target: WorkbenchDiagnosticRef["primaryTarget"] | undefined): string | undefined => {
  if (target?.kind !== "graph") return undefined;

  return machineIdFromGraphRef(target.ref);
};

export const machineIdForConsoleEntry = (entry: Pick<ConsoleEntry, "machineId" | "target">): string | undefined =>
  entry.machineId ?? machineIdFromTarget(entry.target);

export const createConsoleEntryFromDiagnostic = (diagnostic: WorkbenchDiagnosticRef): ConsoleEntry => {
  const locationLabel = diagnosticLocationLabel(diagnostic);
  const machineId = machineIdFromGraphRef(diagnostic.graphItemRef) ?? machineIdFromTarget(diagnostic.primaryTarget);
  const sourceAnchor = diagnostic.sourceAnchors.find((anchor) => anchor.loc !== undefined);

  return {
    entryId: `diagnostic:${diagnostic.diagnosticId}`,
    sourceVersion: diagnostic.sourceVersion,
    channel: "diagnostics",
    title: diagnostic.diagnostic.code,
    message: diagnostic.diagnostic.message,
    diagnosticId: diagnostic.diagnosticId,
    origin: diagnostic.origin,
    severity: diagnostic.diagnostic.severity,
    ...(machineId ? { machineId } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(sourceAnchor ? { sourceAnchor } : {}),
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
