import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from "../store";
import type { MetricsAdapter } from "../store/metrics";
import {
  asEntityIndex,
  entityIdForUnitIndex,
  unitColumnLength,
  type UnitActorView,
  unitIsAlive,
} from "../store/selectors";
import { readRtsSimulationMetrics } from "../store/sim/runtime";
import { RTS_MAP } from "../store/sim/spawn-placement";
import type { Point } from "../store/types";
import { UNIT_FACTION, UNIT_KIND } from "../store/unit-model";

export type PhaserApi = typeof import("phaser");

type PhaserImage = import("phaser").GameObjects.Image;
type PhaserGraphics = import("phaser").GameObjects.Graphics;
type PhaserPointer = import("phaser").Input.Pointer;

export const RTS_CANVAS = {
  width: 1280,
  height: 720,
} as const;

export const RTS_CAMERA_ZOOM_EVENT = "entities-rts-camera-zoom";

export type RtsCameraZoomAction = "in" | "out" | "reset";

const TEXTURES = {
  hero: "entities-rts-hero",
  ally: "entities-rts-ally",
  enemy: "entities-rts-enemy",
  selected: "entities-rts-selected",
  hpBg: "entities-rts-hp-bg",
  hpFill: "entities-rts-hp-fill",
} as const;

const CLICK_DRAG_THRESHOLD = 12;
const ATTACK_MOVE_RADIUS = 96;
const CAMERA_ZOOM_STEP = 1.18;
const CAMERA_MAX_ZOOM_MULTIPLIER = 3;
const CAMERA_INITIAL_VIEW_WIDTH = 4_096;
const CAMERA_KEYBOARD_PAN_SPEED = 760;
const MAP_GRID_MINOR_STEP = 128;
const MAP_GRID_MAJOR_STEP = 512;
const MAP_GRID_MINOR_WIDTH = 4;
const MAP_GRID_MAJOR_WIDTH = 8;
const HP_BAR_MIN_WIDTH = 76;
const HP_BAR_WIDTH_SCALE = 1.8;
const HP_BAR_OFFSET_SCALE = 0.9;
const HP_BAR_BG_HEIGHT = 24;
const HP_BAR_FILL_HEIGHT = 16;
const HP_BAR_HORIZONTAL_PADDING = 14;

type DragState = {
  start: Point;
  current: Point;
};

type UnitView = {
  sprite: PhaserImage;
};

type HpBarView = {
  bg: PhaserImage;
  fill: PhaserImage;
};

const clampToMap = (point: Point): Point => ({
  x: Math.min(RTS_MAP.width, Math.max(0, point.x)),
  y: Math.min(RTS_MAP.height, Math.max(0, point.y)),
});

const squaredDistance = (left: Point, right: Point) => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return dx * dx + dy * dy;
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const keyboardTargetIsEditable = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
};

const cameraPanVectorForCode = (code: string) => {
  switch (code) {
    case "KeyA":
      return { x: -1, y: 0 };
    case "KeyD":
      return { x: 1, y: 0 };
    case "KeyW":
      return { x: 0, y: -1 };
    case "KeyS":
      return { x: 0, y: 1 };
    default:
      return null;
  }
};

const displaySizeForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return 96;
  if (kind === UNIT_KIND.ALLY) return 48;
  return 38;
};

const textureForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return TEXTURES.hero;
  if (kind === UNIT_KIND.ALLY) return TEXTURES.ally;
  return TEXTURES.enemy;
};

const depthForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return 5;
  if (kind === UNIT_KIND.ALLY) return 4;
  return 3;
};

const addGeneratedTexture = (
  scene: import("phaser").Scene,
  key: string,
  data: string[],
  palette: Record<string, string>,
  pixelWidth = 4,
) => {
  if (scene.textures.exists(key)) return;

  const width = Math.max(...data.map((row) => row.length)) * pixelWidth;
  const height = data.length * pixelWidth;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;

  const context = texture.getContext();
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);

  for (let row = 0; row < data.length; row += 1) {
    for (let column = 0; column < data[row].length; column += 1) {
      const color = palette[data[row][column]];
      if (!color || color === "rgba(0,0,0,0)") continue;

      context.fillStyle = color;
      context.fillRect(column * pixelWidth, row * pixelWidth, pixelWidth, pixelWidth);
    }
  }

  texture.refresh();
};

const ensureGeneratedTextures = (scene: import("phaser").Scene) => {
  const transparent = "rgba(0,0,0,0)";

  addGeneratedTexture(
    scene,
    TEXTURES.hero,
    ["...YYYY...", "..YFFFFY..", ".YFYYYYFY.", "YFYYFFYYFY", "YFYFFFFYFY", ".YFYYYYFY.", "..YFFFFY..", "...YYYY..."],
    {
      ".": transparent,
      Y: "#f6e27a",
      F: "#fff7b0",
    },
  );
  addGeneratedTexture(scene, TEXTURES.ally, ["..GG..", ".GLLG.", "GLLLLG", "GLLLLG", ".GLLG.", "..GG.."], {
    ".": transparent,
    G: "#1b7a54",
    L: "#59d6a3",
  });
  addGeneratedTexture(scene, TEXTURES.enemy, ["..RR..", ".RDDR.", "RDRRDR", "RDRRDR", ".RDDR.", "..RR.."], {
    ".": transparent,
    R: "#ff6f61",
    D: "#7c211b",
  });
  addGeneratedTexture(
    scene,
    TEXTURES.selected,
    ["..SSSS..", ".S....S.", "S......S", "S......S", "S......S", "S......S", ".S....S.", "..SSSS.."],
    {
      ".": transparent,
      S: "#e8f8ff",
    },
    3,
  );
  addGeneratedTexture(scene, TEXTURES.hpBg, ["B"], { B: "#151916" }, 1);
  addGeneratedTexture(scene, TEXTURES.hpFill, ["H"], { H: "#66f0a7" }, 1);
};

class UnitSpriteRenderer {
  private readonly sprites = new Map<number, UnitView>();
  private readonly selected = new Map<number, PhaserImage>();
  private readonly hpBars = new Map<number, HpBarView>();
  private readonly liveEntities = new Set<number>();

  constructor(
    private readonly scene: import("phaser").Scene,
    private readonly manager: AppStore,
  ) {}

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    for (const view of this.selected.values()) view.destroy();
    for (const view of this.hpBars.values()) {
      view.bg.destroy();
      view.fill.destroy();
    }

    this.sprites.clear();
    this.selected.clear();
    this.hpBars.clear();
    this.liveEntities.clear();
  }

  sync() {
    const units = this.manager.entities().get("unitActor");
    this.liveEntities.clear();

    for (let index = 0; index < unitColumnLength(units); index += 1) {
      const entity = asEntityIndex(index);
      if (!unitIsAlive(units, entity)) continue;

      this.liveEntities.add(index);
      this.syncUnit(units, entity);
    }

    this.cleanupMissing();
  }

  private syncUnit(units: UnitActorView, entity: EntityIndex) {
    const key = Number(entity);
    const kind = units.kind[entity];
    const size = displaySizeForKind(kind);
    const texture = textureForKind(kind);
    const view = this.sprites.get(key) ?? this.createUnitView(key, units, entity, texture);
    const hpRate = Math.max(0, Math.min(1, units.hp[entity] / units.maxHp[entity]));

    view.sprite.setTexture(texture);
    view.sprite.setPosition(units.x[entity], units.y[entity]);
    view.sprite.setDepth(depthForKind(kind));
    view.sprite.setDisplaySize(size, size);
    view.sprite.setAlpha(0.74 + hpRate * 0.26);

    if (kind === UNIT_KIND.ENEMY && hpRate < 0.5) {
      view.sprite.setTint(0xffc05b);
    } else if (kind === UNIT_KIND.HERO && hpRate < 0.25) {
      view.sprite.setTint(0xff786b);
    } else {
      view.sprite.clearTint();
    }

    this.syncSelection(units, entity, size);
    this.syncHpBar(units, entity, size, hpRate);
  }

  private createUnitView(key: number, units: UnitActorView, entity: EntityIndex, texture: string) {
    const view = {
      sprite: this.scene.add.image(units.x[entity], units.y[entity], texture).setOrigin(0.5, 0.5),
    };

    this.sprites.set(key, view);
    return view;
  }

  private syncSelection(units: UnitActorView, entity: EntityIndex, size: number) {
    const key = Number(entity);
    const shouldShow = units.selected[entity] === 1 || units.kind[entity] === UNIT_KIND.HERO;

    if (!shouldShow) {
      const stale = this.selected.get(key);
      if (stale) {
        stale.destroy();
        this.selected.delete(key);
      }
      return;
    }

    const highlight =
      this.selected.get(key) ??
      this.scene.add.image(units.x[entity], units.y[entity], TEXTURES.selected).setOrigin(0.5, 0.5).setDepth(7);

    this.selected.set(key, highlight);
    highlight.setPosition(units.x[entity], units.y[entity]);
    highlight.setDisplaySize(size * 1.5, size * 1.5);
    highlight.setAlpha(units.selected[entity] === 1 ? 0.95 : 0.34);
  }

  private syncHpBar(units: UnitActorView, entity: EntityIndex, size: number, hpRate: number) {
    const key = Number(entity);
    const shouldShow =
      units.kind[entity] === UNIT_KIND.HERO ||
      units.selected[entity] === 1 ||
      (units.kind[entity] === UNIT_KIND.ENEMY && hpRate < 1);

    if (!shouldShow) {
      const stale = this.hpBars.get(key);
      if (stale) {
        stale.bg.destroy();
        stale.fill.destroy();
        this.hpBars.delete(key);
      }
      return;
    }

    const width = Math.max(HP_BAR_MIN_WIDTH, size * HP_BAR_WIDTH_SCALE);
    const y = units.y[entity] - size * HP_BAR_OFFSET_SCALE;
    const bar =
      this.hpBars.get(key) ??
      ({
        bg: this.scene.add.image(units.x[entity], y, TEXTURES.hpBg).setOrigin(0.5, 0.5).setDepth(8),
        fill: this.scene.add
          .image(units.x[entity] - width / 2, y, TEXTURES.hpFill)
          .setOrigin(0, 0.5)
          .setDepth(9),
      } satisfies HpBarView);

    this.hpBars.set(key, bar);
    bar.bg.setPosition(units.x[entity], y);
    bar.bg.setDisplaySize(width + HP_BAR_HORIZONTAL_PADDING, HP_BAR_BG_HEIGHT);
    bar.fill.setPosition(units.x[entity] - width / 2, y);
    bar.fill.setDisplaySize(Math.max(1, width * hpRate), HP_BAR_FILL_HEIGHT);
  }

  private cleanupMissing() {
    for (const [key, view] of this.sprites) {
      if (this.liveEntities.has(key)) continue;
      view.sprite.destroy();
      this.sprites.delete(key);
    }

    for (const [key, view] of this.selected) {
      if (this.liveEntities.has(key)) continue;
      view.destroy();
      this.selected.delete(key);
    }

    for (const [key, view] of this.hpBars) {
      if (this.liveEntities.has(key)) continue;
      view.bg.destroy();
      view.fill.destroy();
      this.hpBars.delete(key);
    }
  }
}

const findUnitAt = (
  units: UnitActorView,
  point: Point,
  options: { faction?: number; radiusMultiplier?: number; minimumRadius?: number } = {},
) => {
  let nearest: EntityIndex | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < unitColumnLength(units); index += 1) {
    const entity = asEntityIndex(index);
    if (!unitIsAlive(units, entity)) continue;
    if (options.faction !== undefined && units.faction[entity] !== options.faction) continue;

    const hitRadius = Math.max(
      options.minimumRadius ?? 0,
      Math.max(units.radius[entity], displaySizeForKind(units.kind[entity]) * 0.5) * (options.radiusMultiplier ?? 1),
    );
    const distance = squaredDistance(point, { x: units.x[entity], y: units.y[entity] });

    if (distance > hitRadius * hitRadius || distance >= nearestDistance) continue;

    nearest = entity;
    nearestDistance = distance;
  }

  return nearest;
};

const hasSelectedPlayerUnits = (units: UnitActorView) => {
  for (let index = 0; index < unitColumnLength(units); index += 1) {
    const entity = asEntityIndex(index);
    if (!unitIsAlive(units, entity)) continue;
    if (units.faction[entity] === UNIT_FACTION.PLAYER && units.selected[entity] === 1) return true;
  }

  return false;
};

export const createEntitiesRtsScene = (Phaser: PhaserApi, manager: AppStore, metrics: MetricsAdapter) =>
  class EntitiesRtsScene extends Phaser.Scene {
    private unitRenderer?: UnitSpriteRenderer;
    private selectionGraphics?: PhaserGraphics;
    private drag: DragState | null = null;
    private cameraViewport = { width: 0, height: 0 };
    private baseZoom = 1;
    private minZoom = 1;
    private maxZoom = 1;
    private zoomMultiplier = 1;
    private startupCenterFrames = 8;
    private readonly pressedCameraKeys = new Set<string>();

    private readonly handleCameraZoomCommand = (event: Event) => {
      const action = (event as CustomEvent<{ action?: RtsCameraZoomAction }>).detail?.action;

      if (action === "in") this.zoomCamera(1);
      if (action === "out") this.zoomCamera(-1);
      if (action === "reset") this.resetCameraZoom();
    };

    private readonly handleWindowKeyDown = (event: KeyboardEvent) => {
      if (keyboardTargetIsEditable(event.target)) return;

      const panVector = cameraPanVectorForCode(event.code);
      if (panVector) {
        event.preventDefault();
        this.pressedCameraKeys.add(event.code);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.zoomCamera(1);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        this.zoomCamera(-1);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        this.resetCameraZoom();
        return;
      }

      if (event.key === "Escape") {
        const state = manager.getState().gameSession.state;
        if (state === "READY") manager.transition({ type: "GAME_PAUSE" });
        if (state === "PAUSED") manager.transition({ type: "GAME_RESUME" });
      }
    };

    private readonly handleWindowKeyUp = (event: KeyboardEvent) => {
      this.pressedCameraKeys.delete(event.code);
    };

    private readonly handleWindowBlur = () => {
      this.pressedCameraKeys.clear();
    };

    create() {
      ensureGeneratedTextures(this);
      this.fitCameraToMap();
      this.input.mouse?.disableContextMenu();
      window.addEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
      window.addEventListener("keydown", this.handleWindowKeyDown);
      window.addEventListener("keyup", this.handleWindowKeyUp);
      window.addEventListener("blur", this.handleWindowBlur);

      this.drawMap();
      this.selectionGraphics = this.add.graphics().setDepth(20);
      this.unitRenderer = new UnitSpriteRenderer(this, manager);
      this.events.once("shutdown", () => {
        window.removeEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
        window.removeEventListener("keydown", this.handleWindowKeyDown);
        window.removeEventListener("keyup", this.handleWindowKeyUp);
        window.removeEventListener("blur", this.handleWindowBlur);
        this.pressedCameraKeys.clear();
        this.unitRenderer?.reset();
      });
      this.unitRenderer.sync();
      this.bindInput();
    }

    update(time: number, delta: number) {
      this.fitCameraToMap();

      const deltaMs = Math.max(0, delta);
      this.panCameraFromKeyboard(deltaMs);
      metrics.recordFrame(deltaMs);

      if (manager.getState().gameSession.state === "READY") {
        const tickStartedAt = metrics.now();
        manager.transition({ type: "TICK", payload: { now: time, deltaMs } });
        metrics.recordTickMs(metrics.now() - tickStartedAt);
        metrics.recordSimulationMetrics(readRtsSimulationMetrics());
      }

      const syncStartedAt = metrics.now();
      this.unitRenderer?.sync();
      metrics.recordSyncMs(metrics.now() - syncStartedAt);
      metrics.publish();

      if (this.startupCenterFrames > 0) {
        this.centerCameraOnMap();
        this.startupCenterFrames -= 1;
      }
    }

    private fitCameraToMap() {
      const camera = this.cameras.main;
      const width = Math.max(1, Math.floor(this.scale.gameSize.width || camera.width));
      const height = Math.max(1, Math.floor(this.scale.gameSize.height || camera.height));
      if (this.cameraViewport.width === width && this.cameraViewport.height === height) return;

      this.cameraViewport = { width, height };
      camera.setSize(width, height);
      camera.setBounds(0, 0, RTS_MAP.width, RTS_MAP.height);
      this.minZoom = Math.max(width / RTS_MAP.width, height / RTS_MAP.height);
      this.baseZoom = Math.max(this.minZoom, width / Math.min(RTS_MAP.width, CAMERA_INITIAL_VIEW_WIDTH));
      this.maxZoom = this.baseZoom * CAMERA_MAX_ZOOM_MULTIPLIER;
      this.zoomMultiplier = clampValue(this.zoomMultiplier, this.minZoom / this.baseZoom, CAMERA_MAX_ZOOM_MULTIPLIER);
      camera.setZoom(this.baseZoom * this.zoomMultiplier);
      camera.roundPixels = false;
      this.startupCenterFrames = Math.max(this.startupCenterFrames, 3);
      this.centerCameraOnMap();
    }

    private zoomCamera(direction: -1 | 1, pointer?: PhaserPointer) {
      const camera = this.cameras.main;
      const anchorBefore = pointer ? (pointer.positionToCamera(camera) as Point) : null;
      const zoomFactor = direction > 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP;

      this.startupCenterFrames = 0;
      this.zoomMultiplier = clampValue(
        this.zoomMultiplier * zoomFactor,
        this.minZoom / this.baseZoom,
        CAMERA_MAX_ZOOM_MULTIPLIER,
      );
      camera.setZoom(clampValue(this.baseZoom * this.zoomMultiplier, this.minZoom, this.maxZoom));

      if (pointer && anchorBefore) {
        const anchorAfter = pointer.positionToCamera(camera) as Point;
        camera.scrollX += anchorBefore.x - anchorAfter.x;
        camera.scrollY += anchorBefore.y - anchorAfter.y;
      } else {
        this.centerCameraOnMap();
        return;
      }

      this.clampCameraScroll();
    }

    private resetCameraZoom() {
      this.zoomMultiplier = 1;
      this.cameras.main.setZoom(this.baseZoom);
      this.centerCameraOnMap();
    }

    private centerCameraOnMap() {
      const camera = this.cameras.main;

      camera.centerOn(RTS_MAP.centerX, RTS_MAP.centerY);
      this.clampCameraScroll();
    }

    private clampCameraScroll() {
      const camera = this.cameras.main;
      const viewWidth = camera.width / camera.zoom;
      const viewHeight = camera.height / camera.zoom;
      const minX = viewWidth >= RTS_MAP.width ? (RTS_MAP.width - viewWidth) / 2 : 0;
      const minY = viewHeight >= RTS_MAP.height ? (RTS_MAP.height - viewHeight) / 2 : 0;
      const maxX = viewWidth >= RTS_MAP.width ? minX : RTS_MAP.width - viewWidth;
      const maxY = viewHeight >= RTS_MAP.height ? minY : RTS_MAP.height - viewHeight;

      camera.scrollX = clampValue(camera.scrollX, minX, maxX);
      camera.scrollY = clampValue(camera.scrollY, minY, maxY);
    }

    private panCameraFromKeyboard(deltaMs: number) {
      const x = Number(this.pressedCameraKeys.has("KeyD")) - Number(this.pressedCameraKeys.has("KeyA"));
      const y = Number(this.pressedCameraKeys.has("KeyS")) - Number(this.pressedCameraKeys.has("KeyW"));
      if (x === 0 && y === 0) return;

      const camera = this.cameras.main;
      if (!camera) return;

      const distance = (CAMERA_KEYBOARD_PAN_SPEED * deltaMs) / 1_000 / camera.zoom;

      this.panCameraByKeyboardVector(x, y, distance);
    }

    private panCameraByKeyboardVector(x: number, y: number, distance: number) {
      const diagonalScale = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;

      this.startupCenterFrames = 0;
      const camera = this.cameras.main;
      camera.scrollX += x * distance * diagonalScale;
      camera.scrollY += y * distance * diagonalScale;
      this.clampCameraScroll();
    }

    private drawMap() {
      const grid = this.add.graphics().setDepth(0);
      const drawVerticalGridLine = (x: number, width: number) => {
        const left = clampValue(x - width / 2, 0, RTS_MAP.width - width);
        grid.fillRect(left, 0, width, RTS_MAP.height);
      };
      const drawHorizontalGridLine = (y: number, width: number) => {
        const top = clampValue(y - width / 2, 0, RTS_MAP.height - width);
        grid.fillRect(0, top, RTS_MAP.width, width);
      };

      grid.fillStyle(0x101612, 1);
      grid.fillRect(0, 0, RTS_MAP.width, RTS_MAP.height);

      grid.fillStyle(0x26392f, 0.58);
      for (let x = 0; x <= RTS_MAP.width; x += MAP_GRID_MINOR_STEP) drawVerticalGridLine(x, MAP_GRID_MINOR_WIDTH);
      for (let y = 0; y <= RTS_MAP.height; y += MAP_GRID_MINOR_STEP) drawHorizontalGridLine(y, MAP_GRID_MINOR_WIDTH);

      grid.fillStyle(0x54705b, 0.68);
      for (let x = 0; x <= RTS_MAP.width; x += MAP_GRID_MAJOR_STEP) drawVerticalGridLine(x, MAP_GRID_MAJOR_WIDTH);
      for (let y = 0; y <= RTS_MAP.height; y += MAP_GRID_MAJOR_STEP) drawHorizontalGridLine(y, MAP_GRID_MAJOR_WIDTH);

      grid.fillStyle(0x314231, 0.7);
      grid.fillRect(RTS_MAP.centerX - 84, RTS_MAP.centerY - 84, 168, 168);
      grid.lineStyle(6, 0xf6e27a, 0.72);
      grid.strokeRect(RTS_MAP.centerX - 92, RTS_MAP.centerY - 92, 184, 184);
      grid.lineStyle(10, 0xff6f61, 0.24);
      grid.strokeRect(80, 80, RTS_MAP.width - 160, RTS_MAP.height - 160);
    }

    private bindInput() {
      this.input.on("pointerdown", (pointer: PhaserPointer) => {
        if (!pointer.leftButtonDown()) return;
        const start = this.worldPointFor(pointer);
        this.drag = { start, current: start };
        this.drawSelectionRect();
      });

      this.input.on("pointermove", (pointer: PhaserPointer) => {
        if (!this.drag || !pointer.isDown) return;
        this.drag.current = this.worldPointFor(pointer);
        this.drawSelectionRect();
      });

      this.input.on("wheel", (pointer: PhaserPointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
        this.zoomCamera(deltaY < 0 ? 1 : -1, pointer);
      });

      this.input.on("pointerup", (pointer: PhaserPointer) => {
        if (pointer.rightButtonReleased()) {
          this.issueRightClick(this.worldPointFor(pointer));
          return;
        }

        if (!pointer.leftButtonReleased() || !this.drag) return;

        this.drag.current = this.worldPointFor(pointer);
        const drag = this.drag;
        this.drag = null;
        this.selectionGraphics?.clear();

        if (Math.sqrt(squaredDistance(drag.start, drag.current)) >= CLICK_DRAG_THRESHOLD) {
          manager.transition({
            type: "SELECT_RECT",
            payload: {
              x: drag.start.x,
              y: drag.start.y,
              width: drag.current.x - drag.start.x,
              height: drag.current.y - drag.start.y,
            },
          });
          return;
        }

        this.issueLeftClick(drag.current);
      });
    }

    private issueLeftClick(point: Point) {
      const units = manager.entities().get("unitActor");
      const entity = findUnitAt(units, point, { radiusMultiplier: 1.35, minimumRadius: 28 });
      const hasSelection = hasSelectedPlayerUnits(units);

      if (entity === null) {
        if (hasSelection) {
          manager.transition({ type: "ISSUE_MOVE", payload: point });
        } else {
          manager.transition({ type: "CLEAR_SELECTION" });
        }
        return;
      }

      if (units.faction[entity] !== UNIT_FACTION.PLAYER) {
        if (hasSelection) {
          manager.transition({ type: "ISSUE_ATTACK_MOVE", payload: point });
        } else {
          manager.transition({ type: "CLEAR_SELECTION" });
        }
        return;
      }

      const entityId = entityIdForUnitIndex(units, entity, manager.getState().gameSession.context.config.allyCount);
      if (!entityId) {
        manager.transition({ type: "CLEAR_SELECTION" });
        return;
      }

      manager.transition({ type: "SELECT_ENTITY", payload: { entityId } });
    }

    private issueRightClick(point: Point) {
      const units = manager.entities().get("unitActor");
      const enemy = findUnitAt(units, point, {
        faction: UNIT_FACTION.ENEMY,
        radiusMultiplier: 1.8,
        minimumRadius: ATTACK_MOVE_RADIUS,
      });

      manager.transition({ type: enemy === null ? "ISSUE_MOVE" : "ISSUE_ATTACK_MOVE", payload: point });
    }

    private worldPointFor(pointer: PhaserPointer): Point {
      const worldPoint = pointer.positionToCamera(this.cameras.main) as Point;
      return clampToMap(worldPoint);
    }

    private drawSelectionRect() {
      if (!this.selectionGraphics || !this.drag) return;

      const { start, current } = this.drag;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x);
      const height = Math.abs(current.y - start.y);

      this.selectionGraphics.clear();
      this.selectionGraphics.fillStyle(0x59d6a3, 0.12);
      this.selectionGraphics.lineStyle(6, 0x59d6a3, 0.82);
      this.selectionGraphics.fillRect(x, y, width, height);
      this.selectionGraphics.strokeRect(x, y, width, height);
    }
  };
