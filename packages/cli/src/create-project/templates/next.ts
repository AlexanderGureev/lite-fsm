import type { CliContext } from "../../cli/context.js";
import { createScaffoldCommand } from "../package-manager.js";
import { patchProjectTextFile, writeProjectFile } from "../write-files.js";
import type { PatchTextResult } from "../write-files.js";
import type { CreateProjectTemplateAdapter, CreateProjectTemplateInput } from "./types.js";

const providersSource = `"use client";

import type { PropsWithChildren } from "react";
import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";
import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: PropsWithChildren) {
  const storeRef = useRef<AppStore | null>(null);

  const manager = storeRef.current ?? makeStore();
  storeRef.current = manager;

  return <FSMContextProvider machineManager={manager}>{children}</FSMContextProvider>;
}
`;

const pageSource = `"use client";

import { useAppSelector, useAppTransition } from "@/store";

export default function Home() {
  const appState = useAppSelector((state) => state.app.state);
  const transition = useAppTransition();
  const isReady = appState === "READY";

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "#f4f7fb",
      color: "#102033",
    }}>
      <section style={{
        width: "min(100%, 420px)",
        border: "1px solid #c9d3df",
        borderRadius: 8,
        padding: 24,
        background: "#ffffff",
        boxShadow: "0 18px 45px rgba(21, 21, 20, 0.08)",
      }}>
        <p style={{ margin: "0 0 8px", color: "#5d6775", fontSize: 14 }}>lite-fsm starter</p>
        <h1 style={{ margin: "0 0 16px", fontSize: 28, lineHeight: 1.1 }}>State: {appState}</h1>
        <button
          type="button"
          onClick={() => transition({ type: "DO_INIT" })}
          disabled={isReady}
          style={{
            width: "100%",
            border: 0,
            borderRadius: 6,
            padding: "12px 16px",
            background: isReady ? "#c9d3df" : "#102033",
            color: isReady ? "#5d6775" : "#ffffff",
            cursor: isReady ? "default" : "pointer",
            fontWeight: 700,
          }}
        >
          Run DO_INIT
        </button>
        {isReady ? (
          <p style={{ margin: "16px 0 0", color: "#0f7b4f", fontWeight: 700 }}>READY UI is visible.</p>
        ) : (
          <p style={{ margin: "16px 0 0", color: "#5d6775" }}>Waiting for DO_INIT.</p>
        )}
      </section>
    </main>
  );
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

  const page = writeProjectFile(context, input.targetPath, "src/app/page.tsx", pageSource);
  if (!page.ok) return page;

  return patchProjectTextFile(context, input.targetPath, "src/app/layout.tsx", patchNextLayout);
};

export const nextTemplate: CreateProjectTemplateAdapter = {
  key: "next",
  createScaffoldCommand(input) {
    return createScaffoldCommand({ ...input, target: input.targetName, template: "next" });
  },
  apply: applyNextTemplate,
};
