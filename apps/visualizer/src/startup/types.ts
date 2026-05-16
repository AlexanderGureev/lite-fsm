import type { LiteFsmGraphDocument } from "@lite-fsm/graph";
import type { SourceSession } from "../source";
import type { VisualizerHostCapabilities } from "../services";
import type { VisualizerInputMode } from "../workbench";
import type { ProjectGraphExportParseIssue } from "../project-export";

export type StartupEntryKind = "pasted-source" | "project-export" | "local-session";

export type StartupLoadIssue = ProjectGraphExportParseIssue | {
  code: string;
  message: string;
  path?: string;
};

export type StartupResolvedInput =
  | { kind: "pasted-source"; key: "pasted-source" }
  | {
      kind: "project-export";
      key: string;
      configValue: string;
      fileName: string;
      url?: URL;
      issue?: ProjectGraphExportParseIssue;
    }
  | { kind: "local-session"; key: string; token: string };

export type StartupLoadInput = {
  startup: StartupResolvedInput;
  fetch: typeof fetch;
  origin: string;
};

export type StartupLoadResult =
  | {
      kind: "source-input";
      inputMode: Extract<VisualizerInputMode, { kind: "pasted-source" }>;
    }
  | {
      kind: "graph-document-input";
      inputMode: Exclude<VisualizerInputMode, { kind: "pasted-source" }>;
      document: LiteFsmGraphDocument;
      hostCapabilities: VisualizerHostCapabilities;
      consoleTitle: string;
      consoleMessage: string;
    };

export type StartupEntry = {
  kind: StartupEntryKind;
  load(input: StartupLoadInput): Promise<StartupLoadResult>;
};

export type PastedSourceStartupInput = {
  source: SourceSession;
};
