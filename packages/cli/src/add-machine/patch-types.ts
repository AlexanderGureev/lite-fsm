import type { NormalizedMachineName } from "./name.js";
import type { AddMachinePatchResult } from "./patch-index.js";

type AppEventsAlias = {
  expression: string;
  start: number;
  end: number;
};

type SupportedMember =
  | { kind: "fsm-event"; text: string; eventTypes: string[] }
  | { kind: "machine-events"; text: string; namespace: string };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findAppEventsAlias = (source: string): AppEventsAlias | undefined => {
  const match = /export\s+type\s+AppEvents\s*=\s*(?<expression>[\s\S]*?);/.exec(source);
  if (!match?.groups) return undefined;

  return {
    expression: match.groups.expression,
    start: match.index,
    end: match.index + match[0].length,
  };
};

const stripLeadingUnion = (value: string): string => value.replace(/^\|\s*/, "").trim();

const splitTopLevelUnion = (expression: string): string[] => {
  const members: string[] = [];
  let current = "";
  let depth = 0;
  let quote: '"' | "'" | undefined;

  for (const char of expression.trim()) {
    if (quote) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "<") depth += 1;
    if (char === ">" && depth > 0) depth -= 1;

    if (char === "|" && depth === 0) {
      const member = stripLeadingUnion(current);
      if (member) members.push(member);
      current = "";
      continue;
    }

    current += char;
  }

  const last = stripLeadingUnion(current);
  /* v8 ignore next -- supported AppEvents aliases do not end with a dangling top-level union separator. */
  if (last) members.push(last);

  return members;
};

const parseFsmEventMember = (member: string): SupportedMember | undefined => {
  const match = /^FSMEvent<\s*(?<events>"[^"]+"(?:\s*\|\s*"[^"]+")*)\s*>$/.exec(member);
  if (!match?.groups) return undefined;

  const eventTypes = [...match.groups.events.matchAll(/"([^"]+)"/g)].map((eventMatch) => eventMatch[1]).filter(Boolean);

  return { kind: "fsm-event", text: member, eventTypes };
};

const parseMachineEventsMember = (member: string): SupportedMember | undefined => {
  const match = /^(?<namespace>[A-Za-z_$][A-Za-z0-9_$]*)\.Events$/.exec(member);
  if (!match?.groups) return undefined;

  return { kind: "machine-events", text: member, namespace: match.groups.namespace };
};

const parseSupportedMembers = (expression: string): SupportedMember[] | undefined => {
  const members = splitTopLevelUnion(expression);
  if (members.length === 0) return undefined;

  const parsed = members.map((member) => parseFsmEventMember(member) ?? parseMachineEventsMember(member));
  return parsed.every((member): member is SupportedMember => member !== undefined) ? parsed : undefined;
};

const readSupportedAppEvents = (source: string): SupportedMember[] | undefined => {
  const alias = findAppEventsAlias(source);
  if (!alias) return undefined;

  return parseSupportedMembers(alias.expression);
};

const lastImportEnd = (source: string, machineOnly: boolean): number | undefined => {
  const importRegex = machineOnly
    ? /^import\s+type\s+\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*\s+from\s+["']\.\/machines\/[^"']+["'];\n?/gm
    : /^import\s+[^;\n]+;\n?/gm;
  let lastEnd: number | undefined;

  for (const match of source.matchAll(importRegex)) {
    lastEnd = match.index + match[0].length;
  }

  return lastEnd;
};

const insertNamespaceImport = (source: string, machine: NormalizedMachineName): string => {
  const importLine = `import type * as ${machine.eventNamespace} from "./machines/${machine.fileName}";\n`;
  const insertAt = lastImportEnd(source, true) ?? lastImportEnd(source, false) ?? 0;

  return `${source.slice(0, insertAt)}${importLine}${source.slice(insertAt)}`;
};

export const storeTypesContainsEventNamespaceImport = (source: string, machine: NormalizedMachineName): boolean => {
  const namespace = escapeRegExp(machine.eventNamespace);
  return new RegExp(`^import\\s+type\\s+\\*\\s+as\\s+${namespace}\\s+from\\s+["'][^"']+["'];`, "m").test(source);
};

export const storeTypesContainsEventMember = (source: string, machine: NormalizedMachineName): boolean => {
  const appEvents = readSupportedAppEvents(source);
  if (!appEvents) return false;

  return appEvents.some((member) => member.kind === "machine-events" && member.namespace === machine.eventNamespace);
};

export const storeTypesContainsInlineEventLiteral = (source: string, machine: NormalizedMachineName): boolean => {
  const appEvents = readSupportedAppEvents(source);
  if (!appEvents) return false;

  return appEvents.some((member) => member.kind === "fsm-event" && member.eventTypes.includes(machine.eventType));
};

export const patchStoreTypes = (source: string, machine: NormalizedMachineName): AddMachinePatchResult => {
  const alias = findAppEventsAlias(source);
  if (!alias) {
    return {
      ok: false,
      message: "src/store/types.ts does not export AppEvents in a supported generated shape.",
    };
  }

  const appEvents = readSupportedAppEvents(source);
  if (!appEvents) {
    return {
      ok: false,
      message: "src/store/types.ts AppEvents is too complex to patch automatically. Add machine Events manually.",
    };
  }

  const withImport = insertNamespaceImport(source, machine);
  const shiftedAlias = findAppEventsAlias(withImport);
  /* v8 ignore next 6 -- inserting an import before an alias that was already found cannot remove that alias. */
  if (!shiftedAlias) {
    return {
      ok: false,
      message: "src/store/types.ts AppEvents could not be patched.",
    };
  }

  const nextMembers = [...appEvents.map((member) => member.text), `${machine.eventNamespace}.Events`];
  const nextAlias = `export type AppEvents =\n${nextMembers.map((member) => `  | ${member}`).join("\n")};`;

  return {
    ok: true,
    contents: `${withImport.slice(0, shiftedAlias.start)}${nextAlias}${withImport.slice(shiftedAlias.end)}`,
  };
};
