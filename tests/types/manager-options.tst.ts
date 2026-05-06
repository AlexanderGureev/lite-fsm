import { describe, expect, test } from "tstyche";
import type {
  FSMEvent,
  GenerateSpawnIdFn,
  MachineConfig,
  MachineManagerOptions,
  ManagerAction,
  SpawnIdContext,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type LikeEvent = FSMEvent<"LIKE", { id: string }> | FSMEvent<"OK">;
type LikeCfg = { __INIT: { LIKE: "PENDING" }; PENDING: { OK: "__RESOLVED" } };
type LikeCtx = { id: string };
type LikeMachine = MachineConfig<LikeCfg, LikeCtx, LikeEvent>;

const likeMachine = {
  config: { __INIT: { LIKE: "PENDING" }, PENDING: { OK: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
} satisfies LikeMachine;

type Store = { likeSync: typeof likeMachine };
type Options = MachineManagerOptions<Store, LikeEvent>;

describe("SpawnIdContext<P>", () => {
  test("содержит templateKey, groupTag, counter, originId и action типа ManagerAction<P>", () => {
    type Ctx = SpawnIdContext<LikeEvent>;
    type _Shape = Assert<
      Equal<
        Ctx,
        {
          templateKey: string;
          groupTag: string;
          counter: number;
          originId: string | undefined;
          action: ManagerAction<LikeEvent>;
        }
      >
    >;
  });
});

describe("GenerateSpawnIdFn<P>", () => {
  test("принимает SpawnIdContext<P> и возвращает string", () => {
    type Fn = GenerateSpawnIdFn<LikeEvent>;
    type _Shape = Assert<Equal<Fn, (ctx: SpawnIdContext<LikeEvent>) => string>>;
  });
});

describe("MachineManagerOptions<S, P>", () => {
  test("originId — опциональная string", () => {
    expect<Options["originId"]>().type.toBe<string | undefined>();
  });

  test("generateActorId типизирует SpawnIdContext<P> по action", () => {
    expect<Options["generateActorId"]>().type.toBe<GenerateSpawnIdFn<LikeEvent> | undefined>();

    const generate: NonNullable<Options["generateActorId"]> = (ctx) => {
      expect(ctx.action).type.toBe<ManagerAction<LikeEvent>>();
      expect(ctx.templateKey).type.toBe<string>();
      expect(ctx.groupTag).type.toBe<string>();
      expect(ctx.counter).type.toBe<number>();
      expect(ctx.originId).type.toBe<string | undefined>();
      return `${ctx.templateKey}/${ctx.counter}`;
    };
    void generate;
  });

  test("generateGroupId имеет ту же сигнатуру что и generateActorId", () => {
    expect<Options["generateGroupId"]>().type.toBe<GenerateSpawnIdFn<LikeEvent> | undefined>();
  });

  test("action в generator-callback узко сужается через discriminated union", () => {
    const generate: NonNullable<Options["generateActorId"]> = (ctx) => {
      if (ctx.action.type === "LIKE") {
        expect(ctx.action.payload).type.toBe<{ id: string }>();
        return ctx.action.payload.id;
      }
      return "fallback";
    };
    void generate;
  });
});
