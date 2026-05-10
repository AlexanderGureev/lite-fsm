import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";

export type SourceActionView = {
  title: string;
  anchors: readonly GraphSourceAnchor[];
  available: boolean;
};

const normalizedQuery = (query: string): string => query.trim().toLocaleLowerCase();

export const matchesQuery = (query: string, values: readonly (string | undefined)[]): boolean => {
  const normalized = normalizedQuery(query);
  if (!normalized) return true;

  return values.some((value) => value?.toLocaleLowerCase().includes(normalized));
};

export const sourceAction = (title: string, anchors: readonly GraphSourceAnchor[]): SourceActionView => ({
  title,
  anchors,
  available: anchors.some((anchor) => anchor.loc),
});
