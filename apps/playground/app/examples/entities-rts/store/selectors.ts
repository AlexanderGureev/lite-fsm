import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from ".";
import { UNIT_FACTION, UNIT_KIND, UNIT_SELECTION } from "./unit-model";

type NumericColumn = ArrayLike<number> & {
  readonly [entity: EntityIndex]: number;
};

type EntityActorView<State extends string> = {
  readonly count: number;
  readonly version: number;
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): State | undefined;
};

export type UnitIdentityView = EntityActorView<"PRESENT" | "REMOVED" | "__RESOLVED"> & {
  readonly kind: NumericColumn;
  readonly faction: NumericColumn;
  readonly radius: NumericColumn;
};

export type UnitMovementView = EntityActorView<"ACTIVE" | "STOPPED" | "__RESOLVED"> & {
  readonly x: NumericColumn;
  readonly y: NumericColumn;
  readonly vx: NumericColumn;
  readonly vy: NumericColumn;
  readonly speed: NumericColumn;
};

export type UnitHealthView = EntityActorView<"ALIVE" | "DEAD" | "__RESOLVED"> & {
  readonly hp: NumericColumn;
  readonly maxHp: NumericColumn;
};

export type UnitCombatView = EntityActorView<"ACTIVE" | "DISABLED" | "__RESOLVED"> & {
  readonly attackRange: NumericColumn;
  readonly attackDamage: NumericColumn;
  readonly attackCooldownMs: NumericColumn;
  readonly attackTimerMs: NumericColumn;
};

export type UnitSelectionView = EntityActorView<"ACTIVE" | "DISABLED" | "__RESOLVED"> & {
  readonly selected: NumericColumn;
};

export type UnitCommandView = EntityActorView<"ACTIVE" | "DISABLED" | "__RESOLVED"> & {
  readonly command: NumericColumn;
  readonly targetX: NumericColumn;
  readonly targetY: NumericColumn;
  readonly formationOffsetX: NumericColumn;
  readonly formationOffsetY: NumericColumn;
};

export type UnitViews = {
  identity: UnitIdentityView;
  movement: UnitMovementView;
  health: UnitHealthView;
  combat: UnitCombatView;
  selection: UnitSelectionView;
  command: UnitCommandView;
};

export type RtsEntityStats = {
  total: number;
  allies: number;
  enemies: number;
  selected: number;
  heroHp: number;
  heroMaxHp: number;
  heroAlive: boolean;
};

export const asEntityIndex = (index: number) => index as EntityIndex;

export const readUnitViews = (manager: AppStore): UnitViews => {
  const entities = manager.entities();

  return {
    identity: entities.get("unitIdentity") as UnitIdentityView,
    movement: entities.get("unitMovement") as UnitMovementView,
    health: entities.get("unitHealth") as UnitHealthView,
    combat: entities.get("unitCombat") as UnitCombatView,
    selection: entities.get("unitSelection") as UnitSelectionView,
    command: entities.get("unitCommand") as UnitCommandView,
  };
};

export const unitColumnLength = (units: UnitViews) => units.movement.x.length;

export const unitSelected = (units: UnitViews, entity: EntityIndex) =>
  units.selection.has(entity) ? units.selection.selected[entity] : UNIT_SELECTION.UNSELECTED;

export const unitIsAlive = (units: UnitViews, entity: EntityIndex) =>
  units.identity.has(entity) &&
  units.movement.has(entity) &&
  units.health.has(entity) &&
  units.health.state(entity) === "ALIVE" &&
  units.health.hp[entity] > 0;

export const entityIdForUnitIndex = (units: UnitViews, entity: EntityIndex, allyCount: number): string | null => {
  const kind = units.identity.kind[entity];
  const index = Number(entity);

  if (kind === UNIT_KIND.HERO) return "unit/hero";
  if (kind === UNIT_KIND.ALLY && index > 0) return `unit/ally/${index - 1}`;
  if (kind === UNIT_KIND.ENEMY) return `unit/enemy/${index - allyCount - 1}`;

  return null;
};

export const readRtsEntityStats = (units: UnitViews): RtsEntityStats => {
  const stats: RtsEntityStats = {
    total: 0,
    allies: 0,
    enemies: 0,
    selected: 0,
    heroHp: 0,
    heroMaxHp: 0,
    heroAlive: false,
  };

  for (let index = 0; index < unitColumnLength(units); index += 1) {
    const entity = asEntityIndex(index);
    if (!unitIsAlive(units, entity)) continue;

    stats.total += 1;

    if (units.identity.kind[entity] === UNIT_KIND.HERO) {
      stats.heroHp = units.health.hp[entity];
      stats.heroMaxHp = units.health.maxHp[entity];
      stats.heroAlive = true;
    } else if (units.identity.faction[entity] === UNIT_FACTION.PLAYER) {
      stats.allies += 1;
    } else if (units.identity.faction[entity] === UNIT_FACTION.ENEMY) {
      stats.enemies += 1;
    }

    if (unitSelected(units, entity) === UNIT_SELECTION.SELECTED) stats.selected += 1;
  }

  return stats;
};
