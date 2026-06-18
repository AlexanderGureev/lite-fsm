import { resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents, Point } from "../../types";
import { UNIT_FACTION, UNIT_KIND } from "../../unit-model";
import { createFlowField, flowCellIndexForPoint, readFlowDirectionAt, type FlowField } from "./flow-field";
import {
  collectSpatialNeighborsAroundAt,
  collectSpatialNeighborsAt,
  createSpatialGrid,
  insertSpatialGridEntityAt,
  resetSpatialGridHeads,
  resetSpatialGrid,
  type SpatialGrid,
} from "./spatial-grid";
import { slotCount } from "../column-slot-count";

const FLOW_CELL_SIZE = 96;
const UNIT_GRID_CELL_SIZE = 48;
const ENEMY_LOOKUP_CELL_SIZE = 128;

export type RtsSimulationMetrics = {
  flowFieldRebuildMs: number;
  spatialGridBuildMs: number;
};

export type RtsSpatialIndexView = {
  heroEntity(): EntityIndex | null;
  heroPosition(out: Point): Point | null;
  collectUnitNeighborsAt(x: number, y: number, out: Int32Array, limit?: number): number;
  collectEnemyNeighborsAt(x: number, y: number, out: Int32Array, limit?: number): number;
  collectEnemyNeighborsAroundAt(x: number, y: number, radius: number, out: Int32Array, limit?: number): number;
  readFlowDirectionAt(x: number, y: number, out: Point): Point;
  readMetrics(): RtsSimulationMetrics;
};

type RtsSpatialIndexResource = {
  unitGrid: SpatialGrid;
  enemyGrid: SpatialGrid;
  flowField: FlowField | null;
  hero: EntityIndex | null;
  heroX: number;
  heroY: number;
  metrics: RtsSimulationMetrics;
};

export type Events = AppEvents;

const now = () => globalThis.performance?.now() ?? Date.now();

const createGrid = (cellSize: number, maxEntities = 1) =>
  createSpatialGrid({
    width: RTS_MAP.width,
    height: RTS_MAP.height,
    cellSize,
    maxEntities,
  });

const createRtsSpatialIndexResource = (): RtsSpatialIndexResource => ({
  unitGrid: createGrid(UNIT_GRID_CELL_SIZE),
  enemyGrid: createGrid(ENEMY_LOOKUP_CELL_SIZE),
  flowField: null,
  hero: null,
  heroX: 0,
  heroY: 0,
  metrics: {
    flowFieldRebuildMs: 0,
    spatialGridBuildMs: 0,
  },
});

const exposeRtsSpatialIndexView = (resource: RtsSpatialIndexResource): RtsSpatialIndexView => ({
  heroEntity: () => resource.hero,
  heroPosition(out) {
    if (resource.hero === null) return null;

    out.x = resource.heroX;
    out.y = resource.heroY;
    return out;
  },
  collectUnitNeighborsAt: (x, y, out, limit) => collectSpatialNeighborsAt(resource.unitGrid, x, y, out, limit),
  collectEnemyNeighborsAt: (x, y, out, limit) => collectSpatialNeighborsAt(resource.enemyGrid, x, y, out, limit),
  collectEnemyNeighborsAroundAt: (x, y, radius, out, limit) =>
    collectSpatialNeighborsAroundAt(resource.enemyGrid, x, y, radius, out, limit),
  readFlowDirectionAt(x, y, out) {
    if (resource.hero === null || resource.flowField === null) {
      out.x = 0;
      out.y = 0;
      return out;
    }

    return readFlowDirectionAt(resource.flowField, x, y, out);
  },
  readMetrics: () => ({
    flowFieldRebuildMs: resource.metrics.flowFieldRebuildMs,
    spatialGridBuildMs: resource.metrics.spatialGridBuildMs,
  }),
});

const ensureGridCapacity = (grid: SpatialGrid, cellSize: number, capacity: number) => {
  const maxEntities = Math.max(1, capacity);
  if (grid.next.length >= maxEntities) return grid;
  return createGrid(cellSize, maxEntities);
};

const resetIndex = (resource: RtsSpatialIndexResource) => {
  resetSpatialGrid(resource.unitGrid);
  resetSpatialGrid(resource.enemyGrid);
  resource.flowField = null;
  resource.hero = null;
  resource.heroX = 0;
  resource.heroY = 0;
  resource.metrics.flowFieldRebuildMs = 0;
  resource.metrics.spatialGridBuildMs = 0;
};

export const rtsSpatialIndex = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      GAME_RESTART: "REMOVED",
    },
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: {
    index: resource(createRtsSpatialIndexResource, exposeRtsSpatialIndexView),
  },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    if (action.type === "ENTITY_SPAWNED" || action.type === "GAME_RESTART") {
      resetIndex(self.index);
      return;
    }

    if (action.type !== "TICK") return;

    const access = entities();
    const identity = access.get("unitIdentity");
    const movement = access.get("unitMovement");
    const health = access.get("unitHealth");
    const capacity = slotCount(movement.x);
    const healthHp = health.hp;
    const identityFaction = identity.faction;
    const identityKind = identity.kind;
    const movementX = movement.x;
    const movementY = movement.y;

    self.index.metrics.flowFieldRebuildMs = 0;
    self.index.metrics.spatialGridBuildMs = 0;
    self.index.hero = null;
    self.index.heroX = 0;
    self.index.heroY = 0;
    self.index.unitGrid = ensureGridCapacity(self.index.unitGrid, UNIT_GRID_CELL_SIZE, capacity);
    self.index.enemyGrid = ensureGridCapacity(self.index.enemyGrid, ENEMY_LOOKUP_CELL_SIZE, capacity);

    const spatialStartedAt = now();
    resetSpatialGridHeads(self.index.unitGrid);
    resetSpatialGridHeads(self.index.enemyGrid);

    for (let index = 0; index < capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!health.has(entity) || healthHp[entity] <= 0) continue;

      const x = movementX[entity];
      const y = movementY[entity];
      insertSpatialGridEntityAt(self.index.unitGrid, entity, x, y);

      if (identityKind[entity] === UNIT_KIND.HERO) {
        self.index.hero = entity;
        self.index.heroX = x;
        self.index.heroY = y;
      }

      if (identityFaction[entity] === UNIT_FACTION.ENEMY) {
        insertSpatialGridEntityAt(self.index.enemyGrid, entity, x, y);
      }
    }

    self.index.metrics.spatialGridBuildMs = now() - spatialStartedAt;

    if (self.index.hero === null) {
      self.index.flowField = null;
      return;
    }

    if (self.index.flowField) {
      const nextTargetCell = flowCellIndexForPoint(self.index.flowField, {
        x: self.index.heroX,
        y: self.index.heroY,
      });
      if (nextTargetCell === self.index.flowField.targetCell) return;
    }

    const flowStartedAt = now();
    self.index.flowField = createFlowField(
      {
        width: RTS_MAP.width,
        height: RTS_MAP.height,
        cellSize: FLOW_CELL_SIZE,
      },
      { x: self.index.heroX, y: self.index.heroY },
    );
    self.index.metrics.flowFieldRebuildMs = now() - flowStartedAt;
  },
});
