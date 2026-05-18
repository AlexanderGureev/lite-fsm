import type { CliContext } from "../../cli/context.js";
import { createScaffoldCommand } from "../package-manager.js";
import { patchProjectTextFile, writeProjectFile } from "../write-files.js";
import type { PatchTextResult } from "../write-files.js";
import type { CreateProjectTemplateAdapter, CreateProjectTemplateInput } from "./types.js";

const providersSource = `"use client";

import type { PropsWithChildren } from "react";
import { FSMContextProvider } from "@lite-fsm/react";
import { manager } from "@/store";

export function Providers({ children }: PropsWithChildren) {
  return <FSMContextProvider machineManager={manager}>{children}</FSMContextProvider>;
}
`;

const ensureProvidersImport = (source: string): string => {
  if (source.includes('from "./providers"')) return source;

  return `import { Providers } from "./providers";\n${source}`;
};

export const patchNextLayout = (source: string): PatchTextResult => {
  if (!source.includes("{children}")) {
    return {
      ok: false,
      message: "Next layout patch failed: expected a {children} placeholder.",
    };
  }

  const withImport = ensureProvidersImport(source);

  return {
    ok: true,
    contents: withImport.replace("{children}", "<Providers>{children}</Providers>"),
  };
};

const applyNextTemplate = (
  context: CliContext,
  input: CreateProjectTemplateInput,
) => {
  const providers = writeProjectFile(context, input.targetPath, "src/app/providers.tsx", providersSource);
  if (!providers.ok) return providers;

  return patchProjectTextFile(context, input.targetPath, "src/app/layout.tsx", patchNextLayout);
};

export const nextTemplate: CreateProjectTemplateAdapter = {
  key: "next",
  createScaffoldCommand(input) {
    return createScaffoldCommand({ ...input, target: input.targetName, template: "next" });
  },
  apply: applyNextTemplate,
};
