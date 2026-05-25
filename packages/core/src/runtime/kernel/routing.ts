import type { RouteResolver, RouteResolverResult, RoutingRegistry } from "../../plugin";
import type { AnyEvent, FSMEventMeta, ManagerAction } from "../../types";
import { LiteFsmError } from "../../utils";

const CORE_ROUTE_KEYS = ["actorId", "groupId", "groupTag"] as const;
const SENDER_KEYS = ["senderActorId", "senderGroupId", "senderGroupTag"] as const;
const RESERVED_META_KEYS = new Set<string>([...CORE_ROUTE_KEYS, ...SENDER_KEYS]);

type MetaRecord = FSMEventMeta & Record<string, unknown>;

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

const arrayify = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

const toBuiltInTargetSet = (value: unknown): string[] => dedupe(arrayify(value as string | string[]));

const toPluginTargetSet = (key: string, result: RouteResolverResult): string[] => {
  if (typeof result === "string") return [result];
  if (Array.isArray(result) && result.every((item) => typeof item === "string")) {
    return dedupe([...result]);
  }

  throw new LiteFsmError(
    "LITE_FSM_INVALID_ROUTE_RESOLVER_RESULT",
    `[lite-fsm] route resolver for meta key '${key}' must return a string or an array of strings.`,
  );
};

export const createRoutingRuntime = (): RoutingRuntime => {
  const resolvers = new Map<string, RouteResolver<string>>();

  const stripMeta = (
    meta: FSMEventMeta | undefined,
    options: { readonly routing: "keep" | "drop"; readonly sender: "keep" | "drop" },
  ): FSMEventMeta => {
    const source = meta as MetaRecord | undefined;
    const next: MetaRecord = {};
    if (!source) return next;

    if (options.routing === "keep") {
      if (source.actorId !== undefined) next.actorId = source.actorId;
      if (source.groupId !== undefined) next.groupId = source.groupId;
      if (source.groupTag !== undefined) next.groupTag = source.groupTag;
    }
    if (options.sender === "keep") {
      if (source.senderActorId !== undefined) next.senderActorId = source.senderActorId;
      if (source.senderGroupId !== undefined) next.senderGroupId = source.senderGroupId;
      if (source.senderGroupTag !== undefined) next.senderGroupTag = source.senderGroupTag;
    }

    for (const key of resolvers.keys()) {
      if (source[key] !== undefined) next[key] = source[key];
    }

    return next;
  };

  const resolveRoute = (action: ManagerAction<AnyEvent>): RouteConstraint => {
    const meta = action.meta as MetaRecord | undefined;
    if (!meta) return unscopedRoute;

    if (meta.actorId !== undefined) {
      return { scope: "actor", key: "actorId", targetSet: toBuiltInTargetSet(meta.actorId) };
    }

    for (const [key, resolver] of resolvers) {
      const value = meta[key];
      if (value === undefined) continue;

      const result = resolver(value, { key, action, meta });
      return { scope: "plugin", key, targetSet: toPluginTargetSet(key, result) };
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
    registerRouteMeta(key, resolver) {
      if (RESERVED_META_KEYS.has(key) || resolvers.has(key)) {
        throw new LiteFsmError("LITE_FSM_DUPLICATE_ROUTE_META_KEY", `[lite-fsm] duplicate route meta key '${key}'.`);
      }
      resolvers.set(key, resolver as RouteResolver<string>);
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
      return stripMeta(meta, { routing: "keep", sender: "drop" });
    },
    stripRouting(meta) {
      return stripMeta(meta, { routing: "drop", sender: "keep" });
    },
    hasRoute(meta) {
      const source = meta as MetaRecord | undefined;
      if (!source) return false;
      if (source.actorId !== undefined) return true;
      for (const key of resolvers.keys()) {
        if (source[key] !== undefined) return true;
      }
      return source.groupId !== undefined || source.groupTag !== undefined;
    },
    resolveRoute,
  };
};
