import { describe, expect, it } from "vitest";

import {
  buildReplacementReconcilePlan,
  createSidecarState,
  type SidecarState,
  type SidecarValidationDeps,
} from "@lite-fsm/core/internal/sidecar";
import { addActorToGroupIndexes } from "@lite-fsm/core/internal/sidecar";
import { createActorMeta, type ActorRuntime } from "@lite-fsm/core/internal/actor";
import { LiteFsmError } from "@lite-fsm/core/internal/utils";

const PUBLIC_STATES = new Set(["PENDING", "ACTIVE"]);

const createDeps = (overrides: Partial<SidecarValidationDeps> = {}): SidecarValidationDeps => ({
  actorTemplateKeys: ["likeSync"],
  groupTagForTemplate: (templateKey) => templateKey,
  isPublicActorState: (_templateKey, state) => PUBLIC_STATES.has(state),
  originId: undefined,
  ...overrides,
});

const seedActor = (
  sidecar: SidecarState,
  templateKey: string,
  actorId: string,
  groupId = actorId,
  groupTag = templateKey,
): ActorRuntime => {
  const actor: ActorRuntime = {
    templateKey,
    meta: createActorMeta({ actorId, groupId, groupTag }),
    bag: new Map(),
  };
  sidecar.actorById.set(actorId, actor);
  addActorToGroupIndexes(sidecar, actor);
  return actor;
};

const validSlice = (actorId: string, state = "PENDING") => ({
  state,
  context: { id: actorId },
  meta: { actorId, groupId: actorId, groupTag: "likeSync" },
});

describe("buildReplacementReconcilePlan — unit", () => {
  it("пустой changedTemplateKeys: пустой план, counters идентичны", () => {
    const sidecar = createSidecarState();
    sidecar.counters.actor = 3;
    sidecar.counters.groupByTag.set("likeSync", 7);

    const plan = buildReplacementReconcilePlan(sidecar, createDeps(), [], {});

    expect(plan.canonicalActorRecords.size).toBe(0);
    expect(plan.actorsToCleanup).toEqual([]);
    expect(plan.touchedTemplateKeys).toEqual([]);
    expect(plan.nextCounters.actor).toBe(3);
    expect(plan.nextCounters.groupByTag.get("likeSync")).toBe(7);
  });

  it("новый actor с валидным meta: создаётся runtime с пустым bag, counters сдвигаются", () => {
    const sidecar = createSidecarState();

    const plan = buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
      likeSync: { "likeSync/2": validSlice("likeSync/2") },
    });

    const runtime = plan.nextActorById.get("likeSync/2");
    expect(runtime).toBeDefined();
    expect(runtime!.bag.size).toBe(0);
    expect(runtime!.templateKey).toBe("likeSync");
    expect(runtime!.meta).toEqual({ actorId: "likeSync/2", groupId: "likeSync/2", groupTag: "likeSync" });
    expect(plan.nextCounters.actor).toBe(3);
    expect(plan.nextCounters.groupByTag.get("likeSync")).toBe(3);
  });

  it("existing actor с другим templateKey: throw LITE_FSM_INVALID_ACTOR_SLICE", () => {
    const sidecar = createSidecarState();
    seedActor(sidecar, "templateA", "shared/0", "shared/0", "templateA");

    const deps = createDeps({
      actorTemplateKeys: ["templateA", "templateB"],
      groupTagForTemplate: (key) => key,
    });

    expect(() =>
      buildReplacementReconcilePlan(sidecar, deps, ["templateB"], {
        templateB: {
          "shared/0": {
            state: "PENDING",
            context: {},
            meta: { actorId: "shared/0", groupId: "shared/0", groupTag: "templateB" },
          },
        },
      }),
    ).toThrow(/between actor template records/);
  });

  it("duplicate actorId между changed-records разных templates: throw 'Duplicate actorId'", () => {
    const sidecar = createSidecarState();
    const deps = createDeps({
      actorTemplateKeys: ["templateA", "templateB"],
      groupTagForTemplate: (key) => key,
    });

    expect(() =>
      buildReplacementReconcilePlan(sidecar, deps, ["templateA", "templateB"], {
        templateA: {
          "shared/0": {
            state: "PENDING",
            context: {},
            meta: { actorId: "shared/0", groupId: "shared/0", groupTag: "templateA" },
          },
        },
        templateB: {
          "shared/0": {
            state: "PENDING",
            context: {},
            meta: { actorId: "shared/0", groupId: "shared/0", groupTag: "templateB" },
          },
        },
      }),
    ).toThrow(/Duplicate actorId/);
  });

  it("пустой actorId: throw 'must be non-empty'", () => {
    const sidecar = createSidecarState();

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
        likeSync: {
          "": { state: "PENDING", context: {}, meta: { actorId: "", groupId: "", groupTag: "likeSync" } },
        },
      }),
    ).toThrow(/must be non-empty/);
  });

  it("новый actorId без meta: throw 'without actor meta'", () => {
    const sidecar = createSidecarState();

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
        likeSync: {
          "likeSync/0": { state: "PENDING", context: {} },
        },
      }),
    ).toThrow(/without actor meta/);
  });

  it("groupTag != groupTagForTemplate(templateKey): throw 'invalid actor meta'", () => {
    const sidecar = createSidecarState();

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
        likeSync: {
          "likeSync/0": {
            state: "PENDING",
            context: {},
            meta: { actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "wrongTag" },
          },
        },
      }),
    ).toThrow(/invalid actor meta/);
  });

  it("actor исчез из record: попадает в actorsToCleanup и удалён из nextActorById", () => {
    const sidecar = createSidecarState();
    const existing = seedActor(sidecar, "likeSync", "likeSync/0");
    seedActor(sidecar, "likeSync", "likeSync/1");

    const plan = buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
      likeSync: { "likeSync/0": validSlice("likeSync/0") },
    });

    expect(plan.actorsToCleanup).toHaveLength(1);
    expect(plan.actorsToCleanup[0].meta.actorId).toBe("likeSync/1");
    expect(plan.nextActorById.has("likeSync/1")).toBe(false);
    expect(plan.nextActorById.get("likeSync/0")).toBe(existing);
  });

  it("originId mismatch: counters НЕ инкрементятся от чужого id", () => {
    const sidecar = createSidecarState();

    const plan = buildReplacementReconcilePlan(
      sidecar,
      createDeps({ originId: "bob" }),
      ["likeSync"],
      {
        likeSync: {
          "alice#likeSync/5": {
            state: "PENDING",
            context: {},
            meta: { actorId: "alice#likeSync/5", groupId: "alice#likeSync/5", groupTag: "likeSync" },
          },
        },
      },
    );

    expect(plan.nextActorById.has("alice#likeSync/5")).toBe(true);
    expect(plan.nextCounters.actor).toBe(0);
    expect(plan.nextCounters.groupByTag.size).toBe(0);
  });

  it("validation throw НЕ мутирует live sidecar (ref-equality)", () => {
    const sidecar = createSidecarState();
    seedActor(sidecar, "likeSync", "likeSync/0");
    const beforeActorById = sidecar.actorById;
    const beforeGroupById = sidecar.groupById;
    const beforeCounters = sidecar.counters;

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
        likeSync: {
          "bad-id": { state: "PENDING", context: {} },
        },
      }),
    ).toThrow(LiteFsmError);

    expect(sidecar.actorById).toBe(beforeActorById);
    expect(sidecar.groupById).toBe(beforeGroupById);
    expect(sidecar.counters).toBe(beforeCounters);
    expect(sidecar.actorById.get("likeSync/0")).toBeDefined();
  });

  it("canonicalRecord сохраняет ссылочную идентичность meta существующего actor", () => {
    const sidecar = createSidecarState();
    const existing = seedActor(sidecar, "likeSync", "likeSync/0");

    const plan = buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
      likeSync: {
        "likeSync/0": { state: "ACTIVE", context: { changed: true } },
      },
    });

    const canonical = plan.canonicalActorRecords.get("likeSync");
    expect(canonical).toBeDefined();
    expect(canonical!["likeSync/0"].meta).toBe(existing.meta);
    expect(canonical!["likeSync/0"].state).toBe("ACTIVE");
    expect(canonical!["likeSync/0"].context).toEqual({ changed: true });
  });

  it("invalid record (не object) в nextRoot: throw 'Invalid actor record'", () => {
    const sidecar = createSidecarState();

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], { likeSync: "string" }),
    ).toThrow(/Invalid actor record/);
  });

  it("публичный state неизвестен для template: throw 'Invalid actor slice'", () => {
    const sidecar = createSidecarState();

    expect(() =>
      buildReplacementReconcilePlan(sidecar, createDeps(), ["likeSync"], {
        likeSync: {
          "likeSync/0": {
            state: "UNKNOWN_STATE",
            context: {},
            meta: { actorId: "likeSync/0", groupId: "likeSync/0", groupTag: "likeSync" },
          },
        },
      }),
    ).toThrow(/Invalid actor slice/);
  });
});
