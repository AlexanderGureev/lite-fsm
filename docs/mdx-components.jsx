import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import { SandpackPreview } from "./components/SandpackPreview";
import { CodeSandboxEmbed } from "./components/CodeSandboxEmbed";

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(components) {
  return {
    ...docsComponents,
    ...components,
    Sandpack: SandpackPreview,
    CodeSandbox: CodeSandboxEmbed,

    // Дополнительные пользовательские компоненты можно добавить здесь
  };
}
