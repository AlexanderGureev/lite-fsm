import type {
  ManagerRuntimeContext,
  NormalizedManagerEntry,
  NormalizedRouteMetaEntry,
  RoutingRegistry,
} from "../../plugin";
import { LiteFsmError } from "../../utils";

const CORE_MANAGER_EXTENSION_KEYS = new Set([
  "getState",
  "getSnapshot",
  "getHydratedState",
  "hydrate",
  "dehydrate",
  "transition",
  "setDependencies",
  "onTransition",
  "replaceReducer",
]);

export const registerRouteMetaEntry = (routing: RoutingRegistry, { key, resolver }: NormalizedRouteMetaEntry) => {
  routing.registerRouteMeta(key, resolver);
};

export const createManagerExtensionRuntime = () => {
  const entries: NormalizedManagerEntry[] = [];
  const keys = new Set<string>();

  return {
    add({ owner, key, factory }: NormalizedManagerEntry) {
      if (CORE_MANAGER_EXTENSION_KEYS.has(key)) {
        throw new LiteFsmError(
          "LITE_FSM_MANAGER_EXTENSION_CORE_KEY",
          `[lite-fsm] plugin '${owner}' cannot register manager extension '${key}' because it is a core manager key.`,
        );
      }
      if (keys.has(key)) {
        throw new LiteFsmError(
          "LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY",
          `[lite-fsm] duplicate manager extension key '${key}'.`,
        );
      }

      keys.add(key);
      entries.push({ owner, key, factory });
    },
    attach<T extends Record<string, unknown>>(target: T, ctx: ManagerRuntimeContext): T {
      for (const { key, factory } of entries) {
        Object.defineProperty(target, key, {
          value: factory(ctx),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return target;
    },
  };
};
