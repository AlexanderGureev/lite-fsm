import { describe, expect, test } from "tstyche";
import { defineStorageRuntime } from "@lite-fsm/core";
import type {
  FSMEvent,
  LiteFsmStorageRuntimeDefinition,
  ReadonlyManagerAction,
  StorageReduceContext,
  StorageRuntimeExtension,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type ObservedEvent = FSMEvent<"OBSERVED", { readonly id: string }>;
type BoundaryStorageExtension = {
  readonly observedEvents: ObservedEvent;
  readonly routeMeta: { readonly shard: string };
  runtimeState: { writes: number };
  readonly templateData: { readonly key: string };
};

type PublicStorageDispatchRoute =
  | { readonly scope: "actor"; readonly key: "actorId"; readonly targetSet: string[] }
  | { readonly scope: "plugin"; readonly key: string; readonly targetSet: string[] }
  | { readonly scope: "group"; readonly key: "groupId"; readonly targetSet: string[] }
  | { readonly scope: "tag"; readonly key: "groupTag"; readonly targetSet: string[] }
  | { readonly scope: "unscoped"; readonly key: undefined; readonly targetSet: [] };

type MutableEvent = {
  type: "MUTABLE";
  payload: {
    ids: string[];
    tuple: [string, { count: number }];
    callback: (value: string) => number;
  };
};

// @ts-expect-error!
type _NoStorageDispatchContext = import("@lite-fsm/core").StorageDispatchContext;

describe("plugin system public API hardening — этап 1", () => {
  test("экспортирует ReadonlyManagerAction как deep readonly action view", () => {
    type _ReadonlyAction = Assert<
      Equal<
        ReadonlyManagerAction<MutableEvent, { routeIds: string[] }>,
        {
          readonly type: "MUTABLE";
          readonly payload: {
            readonly ids: readonly string[];
            readonly tuple: readonly [string, { readonly count: number }];
            readonly callback: (value: string) => number;
          };
          readonly meta?: { readonly routeIds: readonly string[] };
        }
      >
    >;
  });

  test("оставляет LiteFsmStorageRuntimeDefinition opaque без public payload contract", () => {
    const storage = defineStorageRuntime<BoundaryStorageExtension>().create({
      kind: "boundary-storage",
      routeMetaKeys: ["shard"],
      validateTemplate() {},
      compileTemplate(ctx) {
        return { data: { key: ctx.key } };
      },
      createRuntimeState() {
        return { writes: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent(ctx) {
        return ctx.action.type === "OBSERVED";
      },
      reduce(ctx) {
        expect(ctx.dispatch.route).type.toBe<PublicStorageDispatchRoute>();
        return { type: "skip" };
      },
      commit(ctx) {
        ctx.state.writes += 1;
      },
    });

    expect(storage).type.toBeAssignableTo<
      LiteFsmStorageRuntimeDefinition<
        "boundary-storage",
        { readonly storage: "boundary-storage" },
        { readonly shard: string }
      >
    >();
    type _VisibleStorageKeys = Assert<Equal<Extract<keyof typeof storage, string>, "kind">>;
  });

  test("типизирует public dispatch route без импорта internal kernel route type", () => {
    type _StorageExtensionContract = Assert<BoundaryStorageExtension extends StorageRuntimeExtension ? true : false>;
    type _ReduceRoute = Assert<
      Equal<StorageReduceContext<BoundaryStorageExtension>["dispatch"]["route"], PublicStorageDispatchRoute>
    >;

    const pluginRoute: StorageReduceContext<BoundaryStorageExtension>["dispatch"]["route"] = {
      scope: "plugin",
      key: "shard",
      targetSet: ["user/a"],
    };

    expect(pluginRoute).type.toBeAssignableTo<PublicStorageDispatchRoute>();
  });
});
