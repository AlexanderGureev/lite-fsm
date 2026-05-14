import type { LiteFsmGraphProjectHost } from "@lite-fsm/graph";
import type { ProjectModuleResolver } from "./module-resolver.js";
import type { SourceCache } from "./source-cache.js";

export const createProjectHost = (
  sourceCache: SourceCache,
  resolver: ProjectModuleResolver,
): LiteFsmGraphProjectHost => ({
  readSource(fileName) {
    return sourceCache.readSource(fileName);
  },
  resolveModule(input) {
    return resolver.resolveModule(input);
  },
});
