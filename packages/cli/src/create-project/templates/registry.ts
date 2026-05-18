import { nextTemplate } from "./next.js";
import type { CreateProjectTemplate, CreateProjectTemplateAdapter } from "./types.js";
import { viteTemplate } from "./vite.js";

const templateRegistry: Readonly<Record<CreateProjectTemplate, CreateProjectTemplateAdapter>> = {
  next: nextTemplate,
  vite: viteTemplate,
};

export const getCreateProjectTemplate = (template: CreateProjectTemplate): CreateProjectTemplateAdapter => {
  return templateRegistry[template];
};

export const listCreateProjectTemplates = (): readonly CreateProjectTemplate[] => Object.keys(templateRegistry) as CreateProjectTemplate[];
