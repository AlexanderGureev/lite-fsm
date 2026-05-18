import type { NormalizedMachineName } from "./name.js";

export type AddMachinePatchResult =
  | { ok: true; contents: string }
  | { ok: false; message: string };

type MachinesBlock = {
  body: string;
  bodyStart: number;
  bodyEnd: number;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findMachinesBlock = (source: string): MachinesBlock | undefined => {
  const match = /export\s+const\s+machines\s*=\s*\{\n(?<body>[\s\S]*?)\n\};/.exec(source);
  if (!match?.groups) return undefined;
  const bodyStart = match.index + match[0].indexOf("{\n") + 2;

  return {
    body: match.groups.body,
    bodyStart,
    bodyEnd: bodyStart + match.groups.body.length,
  };
};

const lastMachineImportEnd = (source: string): number | undefined => {
  const importRegex = /^import\s+\{\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\}\s+from\s+["']\.\/machines\/[^"']+["'];\n?/gm;
  let lastEnd: number | undefined;

  for (const match of source.matchAll(importRegex)) {
    lastEnd = match.index + match[0].length;
  }

  return lastEnd;
};

export const storeIndexContainsMachineKey = (source: string, machine: NormalizedMachineName): boolean => {
  const block = findMachinesBlock(source);
  if (!block) return false;

  const key = escapeRegExp(machine.exportName);
  return new RegExp(`(?:^|\\n)\\s*${key}(?:\\s*:|\\s*,)`).test(block.body);
};

export const storeIndexContainsMachineExport = (source: string, machine: NormalizedMachineName): boolean => {
  const exportName = escapeRegExp(machine.exportName);
  return new RegExp(`^import\\s+\\{\\s*${exportName}\\s*\\}\\s+from\\s+["']\\.\\/machines\\/[^"']+["'];`, "m").test(source);
};

export const patchStoreIndex = (source: string, machine: NormalizedMachineName): AddMachinePatchResult => {
  const importEnd = lastMachineImportEnd(source);
  const block = findMachinesBlock(source);

  if (importEnd === undefined || !block) {
    return {
      ok: false,
      message: "src/store/index.ts does not match the generated lite-fsm store shape.",
    };
  }

  const importLine = `import { ${machine.exportName} } from "./machines/${machine.fileName}";\n`;
  const withImport = `${source.slice(0, importEnd)}${importLine}${source.slice(importEnd)}`;
  const shiftedBlock = findMachinesBlock(withImport);
  /* v8 ignore next 6 -- inserting an import before a block that was already found cannot remove that block. */
  if (!shiftedBlock) {
    return {
      ok: false,
      message: "src/store/index.ts machines export could not be patched.",
    };
  }

  const insertion = shiftedBlock.body.trim() === "" ? `  ${machine.exportName},` : `${shiftedBlock.body}\n  ${machine.exportName},`;

  return {
    ok: true,
    contents: `${withImport.slice(0, shiftedBlock.bodyStart)}${insertion}${withImport.slice(shiftedBlock.bodyEnd)}`,
  };
};
