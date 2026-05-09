import type { GraphItemRef, GraphSourceAnchor, GraphWorkbenchBadge, GraphWorkbenchRow } from "@lite-fsm/graph/view-model";
import type { SourceEditIntent } from "../codegen";

export type CardOrigin =
  | { kind: "ir"; ref: GraphItemRef; sourceAnchors: readonly GraphSourceAnchor[] }
  | { kind: "draft"; draftId: string; intent: SourceEditIntent };

export type EditableSupport =
  | { kind: "yes" }
  | { kind: "readonly"; reason: "derived-from-reducer" | "derived-from-effect" | "analysis-only" }
  | { kind: "unsupported-source-shape"; reason: string }
  | { kind: "dynamic"; reason: string }
  | { kind: "external"; reason: string };

export type CardAction =
  | { kind: "inspect"; ref: GraphItemRef }
  | { kind: "select-source"; anchors: readonly GraphSourceAnchor[] }
  | { kind: "send-event"; machineId: string; rowId: string }
  | { kind: "follow-emission"; machineId: string; rowId: string }
  | { kind: "propose-source-edit"; intent: SourceEditIntent; enabled: false };

export type CardSection = {
  sectionId: string;
  kind:
    | "accepted-events"
    | "reducer-decisions"
    | "effects"
    | "routed-emissions"
    | "global-behavior"
    | "diagnostics"
    | "unknown";
  title: string;
  rows: readonly GraphWorkbenchRow[];
};

export type WorkbenchCardModel = {
  cardId: string;
  origin: CardOrigin;
  title: string;
  badges: readonly GraphWorkbenchBadge[];
  sections: readonly CardSection[];
  actions: readonly CardAction[];
  editable: EditableSupport;
};
