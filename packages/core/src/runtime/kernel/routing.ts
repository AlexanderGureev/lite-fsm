import type { RouteResolver, RouteResolverResult, RoutingRegistry } from "../../plugin";
import type { AnyEvent, FSMEventMeta, ManagerAction } from "../../types";
import { LiteFsmError } from "../../utils";
import { createReadonlyActionView } from "./actionView";

const ROUTING_KEYS = ["actorId", "groupId", "groupTag"] as const;
const SENDER_KEYS = ["senderActorId", "senderGroupId", "senderGroupTag"] as const;
const RESERVED_META_KEYS = new Set<string>([...ROUTING_KEYS, ...SENDER_KEYS]);

type MetaRecord = FSMEventMeta & Record<string, unknown>;
type RouteResolverEntry = {
  readonly owner: string | undefined;
  readonly resolver: RouteResolver<string>;
};

export type RouteConstraint =
  | { readonly scope: "actor"; readonly key: "actorId"; readonly targetSet: string[] }
  | { readonly scope: "plugin"; readonly key: string; readonly targetSet: string[] }
  | { readonly scope: "group"; readonly key: "groupId"; readonly targetSet: string[] }
  | { readonly scope: "tag"; readonly key: "groupTag"; readonly targetSet: string[] }
  | { readonly scope: "unscoped"; readonly key: undefined; readonly targetSet: [] };

export type RoutingRuntime = {
  readonly registry: RoutingRegistry;
  readonly registeredMetaKeys: readonly string[];
  hasMetaKey(key: string): boolean;
  stripSenderFields(meta: FSMEventMeta | undefined): FSMEventMeta;
  stripRouting(meta: FSMEventMeta | undefined): FSMEventMeta;
  hasRoute(meta: FSMEventMeta | undefined): boolean;
  resolveRoute(action: ManagerAction<AnyEvent>): RouteConstraint;
};

const unscopedRoute: RouteConstraint = { scope: "unscoped", key: undefined, targetSet: [] };

const toBuiltInTargetSet = (value: unknown): string[] => {
  const items = Array.isArray(value) ? (value as string[]) : [value as string];
  return [...new Set(items)];
};

const toPluginTargetSet = (key: string, result: RouteResolverResult): string[] => {
  if (typeof result === "string") return [result];
  if (Array.isArray(result) && result.every((item) => typeof item === "string")) {
    return [...new Set(result)];
  }

  throw new LiteFsmError(
    "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    `[lite-fsm] route resolver for meta key '${key}' must return a string or an array of strings.`,
  );
};

const ownerLabel = (owner: string | undefined): string =>
  owner === undefined ? "unowned registration" : `plugin '${owner}'`;

export const createRoutingRuntime = (): RoutingRuntime => {
  const resolvers = new Map<string, RouteResolverEntry>();

  const getActiveRoutingKeys = (meta: MetaRecord): string[] => {
    const keys: string[] = [];
    if (meta.actorId !== undefined) keys.push("actorId");
    for (const key of resolvers.keys()) {
      if (meta[key] !== undefined) keys.push(key);
    }
    if (meta.groupId !== undefined) keys.push("groupId");
    if (meta.groupTag !== undefined) keys.push("groupTag");
    return keys;
  };

  const copyDefinedKeys = (source: MetaRecord, target: MetaRecord, keys: readonly string[]) => {
    for (const key of keys) {
      if (source[key] !== undefined) target[key] = source[key];
    }
  };

  const stripExcept = (meta: FSMEventMeta | undefined, kept: readonly string[]): FSMEventMeta => {
    const source = meta as MetaRecord | undefined;
    const next: MetaRecord = {};
    if (!source) return next;

    copyDefinedKeys(source, next, kept);
    copyDefinedKeys(source, next, [...resolvers.keys()]);
    return next;
  };

  const resolveRoute = (action: ManagerAction<AnyEvent>): RouteConstraint => {
    const meta = action.meta as MetaRecord | undefined;
    if (!meta) return unscopedRoute;

    const activeKeys = getActiveRoutingKeys(meta);
    if (activeKeys.length === 0) return unscopedRoute;
    if (activeKeys.length > 1) {
      throw new LiteFsmError(
        "LITE_FSM_AMBIGUOUS_ROUTE_META",
        `[lite-fsm] action meta contains multiple route keys: ${activeKeys.join(", ")}. Use one route key per transition or dispatch separate actions.`,
      );
    }

    if (meta.actorId !== undefined) {
      return { scope: "actor", key: "actorId", targetSet: toBuiltInTargetSet(meta.actorId) };
    }

    for (const [key, entry] of resolvers) {
      const value = meta[key];
      if (value === undefined) continue;

      return {
        scope: "plugin",
        key,
        targetSet: toPluginTargetSet(key, entry.resolver(value, { key, action: createReadonlyActionView(action), meta })),
      };
    }

    if (meta.groupId !== undefined) {
      return { scope: "group", key: "groupId", targetSet: toBuiltInTargetSet(meta.groupId) };
    }
    if (meta.groupTag !== undefined) {
      return { scope: "tag", key: "groupTag", targetSet: toBuiltInTargetSet(meta.groupTag) };
    }

    return unscopedRoute;
  };

  const registry: RoutingRegistry = Object.freeze({
    registerRouteMeta(key, resolver, owner) {
      if (RESERVED_META_KEYS.has(key)) {
        throw new LiteFsmError(
          "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
          `[lite-fsm] duplicate routeMeta key '${key}': ${ownerLabel(owner)} conflicts with core reserved routeMeta key '${key}'.`,
        );
      }

      const registered = resolvers.get(key);
      if (registered) {
        throw new LiteFsmError(
          "LITE_FSM_DUPLICATE_ROUTE_META_KEY",
          `[lite-fsm] duplicate routeMeta key '${key}': ${ownerLabel(registered.owner)} conflicts with ${ownerLabel(owner)}.`,
        );
      }
      resolvers.set(key, { owner, resolver: resolver as RouteResolver<string> });
    },
  });

  return {
    registry,
    get registeredMetaKeys() {
      return [...resolvers.keys()];
    },
    hasMetaKey(key) {
      return resolvers.has(key);
    },
    stripSenderFields(meta) {
      return stripExcept(meta, ROUTING_KEYS);
    },
    stripRouting(meta) {
      return stripExcept(meta, SENDER_KEYS);
    },
    hasRoute(meta) {
      const source = meta as MetaRecord | undefined;
      if (!source) return false;
      return getActiveRoutingKeys(source).length > 0;
    },
    resolveRoute,
  };
};
