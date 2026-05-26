import { describe, expect, test } from "tstyche";
import { defineStorageRuntime } from "@lite-fsm/core";
import type { StorageHydrateContext } from "@lite-fsm/core/internal/pluginStorageTypes";

import type { Assert, Equal } from "./_helpers";

type RuntimeState = { commits: number };
type SnapshotData = { readonly commits: number };
type StageFiveExtension = {
  readonly runtimeState: RuntimeState;
  readonly snapshotData: SnapshotData;
};

const storage = defineStorageRuntime<StageFiveExtension>().create({
  kind: "stage-five-snapshot-api",
  validateTemplate() {},
  compileTemplate() {},
  createRuntimeState() {
    return { commits: 0 };
  },
  createPublicInitialState() {
    return {};
  },
  acceptsEvent() {
    return false;
  },
  reduce() {},
  commit() {},
  snapshot: {
    dehydrate(ctx) {
      const result: { readonly snapshot: SnapshotData } = { snapshot: { commits: ctx.state.commits } };
      expect(result.snapshot).type.toBe<SnapshotData>();
      return result;
    },
    hydrate(ctx) {
      expect(ctx.snapshot).type.toBe<SnapshotData | undefined>();
      expect(ctx.machines).type.toBe<Readonly<Record<string, unknown>>>();
      return { nextState: ctx.baseState, changed: false };
    },
  },
});

describe("plugin system — этап 5 storage snapshot API types", () => {
  test("dehydrate и hydrate используют public snapshot payload", () => {
    expect(storage.kind).type.toBe<"stage-five-snapshot-api">();
  });

  test("hydrate context aliases сохраняют payload и machines contract", () => {
    type HydrateContext = StorageHydrateContext<StageFiveExtension>;

    type _Snapshot = Assert<Equal<HydrateContext["snapshot"], SnapshotData | undefined>>;
    type _Machines = Assert<Equal<HydrateContext["machines"], Readonly<Record<string, unknown>>>>;
  });

  test("legacy storage field не является public dehydrate result", () => {
    defineStorageRuntime<StageFiveExtension>().create({
      kind: "stage-five-legacy-storage-result",
      validateTemplate() {},
      compileTemplate() {},
      createRuntimeState() {
        return { commits: 0 };
      },
      createPublicInitialState() {
        return {};
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
      snapshot: {
        // @ts-expect-error!
        dehydrate() {
          return { storage: { commits: 1 } };
        },
        hydrate(ctx) {
          return { nextState: ctx.baseState, changed: false };
        },
      },
    });
  });
});
