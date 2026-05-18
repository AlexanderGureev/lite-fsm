import { dirname } from "node:path";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic, hasBlockingCliDiagnostics } from "../cli/diagnostics.js";
import type { CommandResult } from "../cli/result.js";
import type { AddMachineOptions } from "./options.js";
import { normalizeMachineName, type NormalizedMachineName } from "./name.js";
import {
  ADD_MACHINE_STORE_PATHS,
  addMachineProjectPath,
  readAddMachineStore,
  type AddMachineStoreSnapshot,
} from "./store-shape.js";
import { createMachineFileContents } from "./template.js";
import {
  patchStoreIndex,
  storeIndexContainsMachineExport,
  storeIndexContainsMachineKey,
} from "./patch-index.js";
import {
  patchStoreTypes,
  storeTypesContainsEventMember,
  storeTypesContainsEventNamespaceImport,
  storeTypesContainsInlineEventLiteral,
} from "./patch-types.js";

export type AddMachinePlan = {
  machine: NormalizedMachineName;
  files: {
    create: { relativePath: string; contents: string }[];
    update: { relativePath: string; contents: string }[];
  };
};

export type CreateAddMachinePlanResult =
  | { ok: true; plan: AddMachinePlan }
  | { ok: false; diagnostics: CliDiagnostic[] };

const createRunResult = (diagnostics: readonly CliDiagnostic[]): CommandResult => ({
  exitCode: hasBlockingCliDiagnostics(diagnostics) ? 1 : 0,
  diagnostics: [...diagnostics],
});

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const conflict = (message: string, file: string): CliDiagnostic => {
  return cliDiagnostic("LFC_ADD_MACHINE_CONFLICT", "error", message, {
    file,
  });
};

const patchFailed = (message: string, file: string): CliDiagnostic => {
  return cliDiagnostic("LFC_ADD_MACHINE_PATCH_FAILED", "error", message, {
    file,
    hint: "Update the store manually or restore the generated lite-fsm store shape before running add-machine.",
  });
};

const writeFailed = (relativePath: string, file: string, error: unknown): CommandResult => {
  return createRunResult([
    cliDiagnostic("LFC_WRITE_FAILED", "error", `Failed to write ${relativePath}: ${errorMessage(error)}`, { file }),
  ]);
};

const machineRelativePath = (machine: NormalizedMachineName): string => {
  return `${ADD_MACHINE_STORE_PATHS.machinesDirectory}/${machine.fileName}.ts`;
};

const collectConflicts = (
  context: CliContext,
  store: AddMachineStoreSnapshot,
  machine: NormalizedMachineName,
): CliDiagnostic[] => {
  const relativeMachinePath = machineRelativePath(machine);
  const absoluteMachinePath = addMachineProjectPath(context.cwd, relativeMachinePath);
  const diagnostics: CliDiagnostic[] = [];

  if (context.fs.fileExists(absoluteMachinePath)) {
    diagnostics.push(conflict(`${relativeMachinePath} already exists.`, absoluteMachinePath));
  }

  if (storeIndexContainsMachineKey(store.index.source, machine)) {
    diagnostics.push(conflict(`src/store/index.ts machines already contains ${machine.exportName}.`, store.index.absolutePath));
  }

  if (storeIndexContainsMachineExport(store.index.source, machine)) {
    diagnostics.push(conflict(`src/store/index.ts already imports ${machine.exportName}.`, store.index.absolutePath));
  }

  if (storeTypesContainsEventNamespaceImport(store.types.source, machine)) {
    diagnostics.push(conflict(`src/store/types.ts already imports namespace ${machine.eventNamespace}.`, store.types.absolutePath));
  }

  if (storeTypesContainsEventMember(store.types.source, machine)) {
    diagnostics.push(conflict(`src/store/types.ts AppEvents already contains ${machine.eventNamespace}.Events.`, store.types.absolutePath));
  }

  if (storeTypesContainsInlineEventLiteral(store.types.source, machine)) {
    diagnostics.push(conflict(`src/store/types.ts AppEvents already contains ${machine.eventType}.`, store.types.absolutePath));
  }

  return diagnostics;
};

export const createAddMachinePlan = (context: CliContext, options: AddMachineOptions): CreateAddMachinePlanResult => {
  const normalized = normalizeMachineName(options.name);
  if (!normalized.ok) return normalized;

  const store = readAddMachineStore(context);
  if (!store.ok) return store;

  const conflictDiagnostics = collectConflicts(context, store.store, normalized.machine);
  if (conflictDiagnostics.length > 0) return { ok: false, diagnostics: conflictDiagnostics };

  const patchedIndex = patchStoreIndex(store.store.index.source, normalized.machine);
  const patchedTypes = patchStoreTypes(store.store.types.source, normalized.machine);
  if (!patchedIndex.ok || !patchedTypes.ok) {
    return {
      ok: false,
      diagnostics: [
        ...(patchedIndex.ok ? [] : [patchFailed(patchedIndex.message, store.store.index.absolutePath)]),
        ...(patchedTypes.ok ? [] : [patchFailed(patchedTypes.message, store.store.types.absolutePath)]),
      ],
    };
  }

  return {
    ok: true,
    plan: {
      machine: normalized.machine,
      files: {
        create: [
          {
            relativePath: machineRelativePath(normalized.machine),
            contents: createMachineFileContents(normalized.machine),
          },
        ],
        update: [
          { relativePath: store.store.index.relativePath, contents: patchedIndex.contents },
          { relativePath: store.store.types.relativePath, contents: patchedTypes.contents },
        ],
      },
    },
  };
};

export const applyAddMachinePlan = (context: CliContext, plan: AddMachinePlan): CommandResult => {
  for (const file of plan.files.create) {
    const absolutePath = addMachineProjectPath(context.cwd, file.relativePath);

    try {
      context.fs.mkdir(dirname(absolutePath), { recursive: true });
      context.fs.writeFile(absolutePath, file.contents);
    } catch (error) {
      return writeFailed(file.relativePath, absolutePath, error);
    }
  }

  for (const file of plan.files.update) {
    const absolutePath = addMachineProjectPath(context.cwd, file.relativePath);

    try {
      context.fs.writeFile(absolutePath, file.contents);
    } catch (error) {
      return writeFailed(file.relativePath, absolutePath, error);
    }
  }

  return createRunResult([]);
};

const printSuccess = (context: CliContext, plan: AddMachinePlan): void => {
  const files = [...plan.files.create, ...plan.files.update].map((file) => file.relativePath);

  context.stdout.write(`Added machine ${plan.machine.exportName}.

Files:
${files.map((file) => `  ${file}`).join("\n")}

Use:
  transition({ type: "${plan.machine.eventType}" })
`);
};

export const runAddMachine = async (context: CliContext, options: AddMachineOptions): Promise<CommandResult> => {
  const plan = createAddMachinePlan(context, options);
  if (!plan.ok) return createRunResult(plan.diagnostics);

  const result = applyAddMachinePlan(context, plan.plan);
  if (result.exitCode === 0) printSuccess(context, plan.plan);

  return result;
};
