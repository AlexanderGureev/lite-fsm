import type { CreateProjectTemplate } from "../templates/types.js";
import { nextNoneCssAdapter, viteNoneCssAdapter } from "./none.js";
import { nextTailwindCssAdapter } from "./tailwind-next.js";
import { viteTailwindCssAdapter } from "./tailwind-vite.js";
import type { CreateProjectCss, CreateProjectCssAdapter } from "./types.js";

const cssRegistry: Readonly<Record<CreateProjectTemplate, Readonly<Record<CreateProjectCss, CreateProjectCssAdapter>>>> = {
  next: {
    tailwind: nextTailwindCssAdapter,
    none: nextNoneCssAdapter,
  },
  vite: {
    tailwind: viteTailwindCssAdapter,
    none: viteNoneCssAdapter,
  },
};

export const getCreateProjectCssAdapter = (
  template: CreateProjectTemplate,
  css: CreateProjectCss,
): CreateProjectCssAdapter => cssRegistry[template][css];

export const listCreateProjectCssAdapters = (): readonly CreateProjectCssAdapter[] => [
  nextTailwindCssAdapter,
  nextNoneCssAdapter,
  viteTailwindCssAdapter,
  viteNoneCssAdapter,
];
