import { useMDXComponents as getDocsMDXComponents } from "nextra-theme-docs";
import { SandpackPreview } from "./components/SandpackPreview";
import { CodeSandboxEmbed } from "./components/CodeSandboxEmbed";
import { Tabs } from "nextra/components";

const docsComponents = getDocsMDXComponents();

export function useMDXComponents(components) {
  return {
    ...docsComponents,
    ...components,
    Sandpack: SandpackPreview,
    CodeSandbox: CodeSandboxEmbed,
    Tabs,
    Tab: Tabs.Tab,

    // Дополнительные пользовательские компоненты можно добавить здесь
  };
}
