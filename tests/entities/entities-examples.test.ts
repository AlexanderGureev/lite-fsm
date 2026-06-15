import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runEntitiesCompositionExample } from "../../packages/entities/examples/composition-lite-fsm-entities";

const rootDir = join(__dirname, "../..");

describe("@lite-fsm/entities — этап 13 README и examples", () => {
  it("package example выполняет spawn events, TICK, sprite reaction и despawnOn cleanup", () => {
    const result = runEntitiesCompositionExample();

    expect(result.movementCount).toBe(1);
    expect(result.healthCount).toBe(1);
    expect(result.targetingCount).toBe(1);
    expect(result.hasRootEntityAccessor).toBe(true);
    expect(result.unitPosition).toEqual({ x: 11, y: 22 });
    expect(result.unitFrameReports).toEqual([
      {
        frameState: "reportA",
        reportedUnits: 1,
        totalUnits: 1,
        checksum: 333.125,
      },
    ]);
    expect(result.projectileVisible).toBe(false);
    expect(result.removedSprites).toEqual(["sprite/projectile-p1"]);
  });

  it("package example и README закрепляют финальные public contracts", () => {
    const example = readFileSync(
      join(rootDir, "packages/entities/examples/composition-lite-fsm-entities.ts"),
      "utf8",
    );
    const readme = readFileSync(join(rootDir, "packages/entities/README.md"), "utf8");

    expect(example).toContain("EntitiesPlugin<AppDeps>");
    expect(example).toContain("defineSpawnEvents");
    expect(example).toContain("spawnEvent");
    expect(example).toContain("SpawnEventsFrom");
    expect(example).toContain("defineEntitySpawn");
    expect(example).toContain("entitiesPlugin({ spawn })");
    expect(example).toContain("manager.entities()");
    expect(example).toContain('groupTag: "unit"');
    expect(example).toContain('entities().get("movementActor")');
    expect(example).toContain('entities().get("targetingActor")');
    expect(example).toContain("getState()");
    expect(example).toContain("publishUnitFrame");
    expect(example).toContain("optional(entityString())");
    expect(example).not.toContain("manager.spawn");
    expect(example).not.toContain("actorId");

    expect(readme).toContain("entities: () => EntityAccess<AppMachines>");
    expect(readme).toContain("scoped");
    expect(readme).toContain("manager.setDependencies");
  });
});
