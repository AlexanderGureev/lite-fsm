import { resource, type EntityIndex } from "@lite-fsm/entities";

import { createMachine } from "../../create-machine";
import { RTS_MAP } from "../../spawn/placement";
import type { AppEvents, Point } from "../../types";
import { UNIT_FACTION, UNIT_KIND } from "../../unit-model";
import { createFlowField, flowCellIndexForPoint, readFlowDirectionAt, type FlowField } from "./flow-field";
import {
  buildSpatialGridForEntities,
  collectSpatialNeighborsAt,
  createSpatialGrid,
  resetSpatialGrid,
  type SpatialGrid,
} from "./spatial-grid";

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
  collectUnitNeighborsAt(x: number, y: number, out: Int32Array): number;
  collectEnemyNeighborsAt(x: number, y: number, out: Int32Array): number;
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
  collectUnitNeighborsAt: (x, y, out) => collectSpatialNeighborsAt(resource.unitGrid, x, y, out),
  collectEnemyNeighborsAt: (x, y, out) => collectSpatialNeighborsAt(resource.enemyGrid, x, y, out),
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

const columnLength = (column: ArrayLike<number>) => column.length;

const asEntityIndex = (index: number) => index as EntityIndex;

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
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    REMOVED: {
      ENTITY_DESPAWNED: "__RESOLVED",
    },
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
    const capacity = columnLength(movement.x as ArrayLike<number>);
    const aliveEntities: EntityIndex[] = [];
    const enemyEntities: EntityIndex[] = [];

    self.index.metrics.flowFieldRebuildMs = 0;
    self.index.metrics.spatialGridBuildMs = 0;
    self.index.hero = null;
    self.index.heroX = 0;
    self.index.heroY = 0;
    self.index.unitGrid = ensureGridCapacity(self.index.unitGrid, UNIT_GRID_CELL_SIZE, capacity);
    self.index.enemyGrid = ensureGridCapacity(self.index.enemyGrid, ENEMY_LOOKUP_CELL_SIZE, capacity);

    for (let index = 0; index < capacity; index += 1) {
      const entity = asEntityIndex(index);
      if (!identity.has(entity) || !movement.has(entity) || !health.has(entity)) continue;
      if (health.state(entity) !== "ALIVE" || health.hp[entity] <= 0) continue;

      aliveEntities.push(entity);

      if (identity.kind[entity] === UNIT_KIND.HERO) {
        self.index.hero = entity;
        self.index.heroX = movement.x[entity];
        self.index.heroY = movement.y[entity];
      }

      if (identity.faction[entity] === UNIT_FACTION.ENEMY) enemyEntities.push(entity);
    }

    const spatialStartedAt = now();
    buildSpatialGridForEntities(
      self.index.unitGrid,
      { x: movement.x as ArrayLike<number>, y: movement.y as ArrayLike<number> },
      aliveEntities,
    );
    buildSpatialGridForEntities(
      self.index.enemyGrid,
      { x: movement.x as ArrayLike<number>, y: movement.y as ArrayLike<number> },
      enemyEntities,
    );
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
