import type { AppStore } from "../store";
import { captureRtsBenchmarkReport } from "../store/benchmark-report";
import type { MetricsAdapter } from "../store/metrics";
import { entityIdForUnitIndex, readProjectileView, readUnitViews } from "../store/selectors";
import type { Point } from "../store/types";
import { UNIT_FACTION } from "../store/unit-model";

import { CameraController } from "./scene/camera-controller";
import {
  ATTACK_MOVE_RADIUS,
  CLICK_DRAG_THRESHOLD,
  FIXED_SIMULATION_STEP_MS,
  MAX_SIMULATION_FRAME_DELTA_MS,
  MAX_SIMULATION_STEPS_PER_FRAME,
  MAX_SPAWN_STEPS_PER_FRAME,
  RTS_CAMERA_ZOOM_EVENT,
  RTS_RENDER_DEBUG_TOGGLE_KEY,
  RTS_RENDER_LOD_TOGGLE_KEY,
  SPAWN_RENDER_CREATE_BUDGET,
  type RtsCameraZoomAction,
} from "./scene/constants";
import { ImpactEffectRenderer } from "./scene/impact-renderer";
import {
  findUnitAt,
  hasSelectedPlayerUnits,
  isCameraPanKey,
  keyboardTargetIsEditable,
  type DragState,
} from "./scene/interaction";
import { drawRtsMap } from "./scene/map";
import type { PhaserApi, PhaserGraphics, PhaserPointer } from "./scene/phaser-types";
import { ProjectileSpriteRenderer } from "./scene/projectile-renderer";
import { ensureGeneratedTextures } from "./scene/textures";
import { UnitSpriteRenderer } from "./scene/unit-renderer";
import { cameraWorldPointForScreen, clampToMap, squaredDistance } from "./scene/viewport";

export { RTS_CAMERA_ZOOM_EVENT, RTS_CANVAS } from "./scene/constants";
export type { RtsCameraZoomAction } from "./scene/constants";
export type { PhaserApi } from "./scene/phaser-types";

const readRtsSpatialMetrics = (manager: AppStore) => manager.entities().get("rtsSpatialIndex").index.readMetrics();

export const createEntitiesRtsScene = (Phaser: PhaserApi, manager: AppStore, metrics: MetricsAdapter) =>
  class EntitiesRtsScene extends Phaser.Scene {
    private unitRenderer?: UnitSpriteRenderer;
    private projectileRenderer?: ProjectileSpriteRenderer;
    private impactEffects?: ImpactEffectRenderer;
    private cameraController?: CameraController;
    private selectionGraphics?: PhaserGraphics;
    private drag: DragState | null = null;
    private renderDirty = true;
    private lastSyncedSessionState: string | null = null;
    private simulationAccumulatorMs = 0;
    private simulationNowMs = 0;
    private renderDebugEnabled = false;
    private renderLodDisabled = false;
    private readonly pressedCameraKeys = new Set<string>();

    private readonly handleCameraZoomCommand = (event: Event) => {
      const action = (event as CustomEvent<{ action?: RtsCameraZoomAction }>).detail?.action;

      if (action === "in") this.cameraController?.zoom(1);
      else if (action === "out") this.cameraController?.zoom(-1);
      else if (action === "reset") this.cameraController?.reset();
      else return;

      this.renderDirty = true;
    };

    private readonly handleWindowKeyDown = (event: KeyboardEvent) => {
      if (keyboardTargetIsEditable(event.target)) return;

      if (event.key.toLowerCase() === RTS_RENDER_DEBUG_TOGGLE_KEY) {
        event.preventDefault();
        this.renderDebugEnabled = !this.renderDebugEnabled;
        this.unitRenderer?.setDebugMode(this.renderDebugEnabled);
        this.renderDirty = true;
        return;
      }

      if (event.key.toLowerCase() === RTS_RENDER_LOD_TOGGLE_KEY) {
        event.preventDefault();
        this.renderLodDisabled = !this.renderLodDisabled;
        this.unitRenderer?.setRenderLodDisabled(this.renderLodDisabled);
        this.renderDirty = true;
        return;
      }

      if (manager.getState().gameSession.state === "SPAWNING") return;

      if (isCameraPanKey(event.code)) {
        event.preventDefault();
        this.pressedCameraKeys.add(event.code);
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        this.cameraController?.zoom(1);
        this.renderDirty = true;
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        this.cameraController?.zoom(-1);
        this.renderDirty = true;
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        this.cameraController?.reset();
        this.renderDirty = true;
        return;
      }

      if (event.key === "Escape") {
        const state = manager.getState().gameSession.state;
        if (state === "READY") {
          manager.transition({ type: "GAME_PAUSE" });
          this.renderDirty = true;
        }
        if (state === "PAUSED") {
          manager.transition({ type: "GAME_RESUME" });
          this.renderDirty = true;
        }
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
      this.cameraController = new CameraController(this);
      this.cameraController.fitToMap();
      this.input.mouse?.disableContextMenu();
      window.addEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
      window.addEventListener("keydown", this.handleWindowKeyDown);
      window.addEventListener("keyup", this.handleWindowKeyUp);
      window.addEventListener("blur", this.handleWindowBlur);

      drawRtsMap(this);
      this.selectionGraphics = this.add.graphics().setDepth(20);
      this.unitRenderer = new UnitSpriteRenderer(this, manager);
      this.unitRenderer.setRenderLodDisabled(this.renderLodDisabled);
      this.projectileRenderer = new ProjectileSpriteRenderer(this, manager);
      this.impactEffects = new ImpactEffectRenderer(this);
      this.events.once("shutdown", () => {
        window.removeEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
        window.removeEventListener("keydown", this.handleWindowKeyDown);
        window.removeEventListener("keyup", this.handleWindowKeyUp);
        window.removeEventListener("blur", this.handleWindowBlur);
        this.pressedCameraKeys.clear();
        this.renderDebugEnabled = false;
        this.renderLodDisabled = false;
        this.unitRenderer?.reset();
        this.projectileRenderer?.reset();
        this.impactEffects?.reset();
      });
      this.unitRenderer.sync();
      this.projectileRenderer.sync();
      this.bindInput();
    }

    update(_time: number, delta: number) {
      if (this.cameraController?.fitToMap()) this.renderDirty = true;

      const frameDeltaMs = Math.max(0, delta);
      const simulationDeltaMs = Math.min(MAX_SIMULATION_FRAME_DELTA_MS, frameDeltaMs);
      const initialSessionState = manager.getState().gameSession.state;
      if (
        initialSessionState !== "SPAWNING" &&
        this.cameraController?.panFromKeyboard(frameDeltaMs, this.pressedCameraKeys)
      ) {
        this.renderDirty = true;
      }
      metrics.recordFrame(frameDeltaMs);

      let simulationSteps = 0;
      if (initialSessionState === "READY") {
        simulationSteps = this.runFixedSimulation(simulationDeltaMs, "TICK");
      } else if (initialSessionState === "SPAWNING") {
        simulationSteps = this.runFixedSimulation(simulationDeltaMs, "SPAWN_TICK");
      } else {
        this.simulationAccumulatorMs = 0;
      }

      if (simulationSteps > 0) this.renderDirty = true;

      if (this.cameraController?.applyStartupCentering()) this.renderDirty = true;

      const sessionState = manager.getState().gameSession.state;
      const shouldSync = this.renderDirty || this.lastSyncedSessionState !== sessionState;
      const syncStartedAt = metrics.now();
      if (sessionState === "SPAWNING") {
        this.unitRenderer?.syncLoading(SPAWN_RENDER_CREATE_BUDGET);
        this.projectileRenderer?.sync();
        this.renderDirty = false;
      } else if (shouldSync) {
        this.unitRenderer?.sync();
        this.projectileRenderer?.sync();
        this.renderDirty = false;
      }
      this.lastSyncedSessionState = sessionState;
      const renderExtrapolationMs = sessionState === "READY" ? this.simulationAccumulatorMs : 0;
      this.unitRenderer?.project(renderExtrapolationMs);
      this.projectileRenderer?.project(renderExtrapolationMs);
      this.impactEffects?.update(frameDeltaMs);
      if (sessionState === "READY") this.impactEffects?.consume(readProjectileView(manager));
      metrics.recordSyncMs(metrics.now() - syncStartedAt);
      metrics.publish();
    }

    private runFixedSimulation(frameDeltaMs: number, actionType: "TICK" | "SPAWN_TICK") {
      this.simulationAccumulatorMs += frameDeltaMs;

      const maxSteps = actionType === "SPAWN_TICK" ? MAX_SPAWN_STEPS_PER_FRAME : MAX_SIMULATION_STEPS_PER_FRAME;
      let steps = 0;
      while (this.simulationAccumulatorMs >= FIXED_SIMULATION_STEP_MS && steps < maxSteps) {
        if (!this.canRunSimulationAction(actionType)) break;

        this.simulationAccumulatorMs -= FIXED_SIMULATION_STEP_MS;
        this.simulationNowMs += FIXED_SIMULATION_STEP_MS;

        const tickStartedAt = metrics.now();
        manager.transition({
          type: actionType,
          payload: { now: this.simulationNowMs, deltaMs: FIXED_SIMULATION_STEP_MS },
        });
        metrics.recordTickMs(metrics.now() - tickStartedAt);
        if (actionType === "TICK") {
          metrics.recordSimulationMetrics(readRtsSpatialMetrics(manager));
          captureRtsBenchmarkReport(manager, metrics);
        }

        steps += 1;
      }

      if (steps === maxSteps) this.simulationAccumulatorMs = 0;
      return steps;
    }

    private canRunSimulationAction(actionType: "TICK" | "SPAWN_TICK") {
      const sessionState = manager.getState().gameSession.state;
      return actionType === "TICK" ? sessionState === "READY" : sessionState === "SPAWNING";
    }

    private bindInput() {
      this.input.on("pointerdown", (pointer: PhaserPointer) => {
        if (!this.canIssuePlayerCommand()) return;
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
        this.cameraController?.zoom(deltaY < 0 ? 1 : -1, pointer);
        this.renderDirty = true;
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
          this.renderDirty = true;
          return;
        }

        this.issueLeftClick(drag.current);
      });
    }

    private issueLeftClick(point: Point) {
      if (!this.canIssuePlayerCommand()) return;

      const units = readUnitViews(manager);
      const entity = findUnitAt(units, point, { radiusMultiplier: 1.35, minimumRadius: 28 });
      const hasSelection = hasSelectedPlayerUnits(units);

      if (entity === null) {
        if (hasSelection) {
          manager.transition({ type: "ISSUE_MOVE", payload: point });
        } else {
          manager.transition({ type: "CLEAR_SELECTION" });
        }
        this.renderDirty = true;
        return;
      }

      if (units.identity.faction[entity] !== UNIT_FACTION.PLAYER) {
        if (hasSelection) {
          manager.transition({ type: "ISSUE_ATTACK_MOVE", payload: point });
        } else {
          manager.transition({ type: "CLEAR_SELECTION" });
        }
        this.renderDirty = true;
        return;
      }

      const entityId = entityIdForUnitIndex(units, entity);
      if (!entityId) {
        manager.transition({ type: "CLEAR_SELECTION" });
        this.renderDirty = true;
        return;
      }

      manager.transition({ type: "SELECT_ENTITY", payload: { entityId } });
      this.renderDirty = true;
    }

    private issueRightClick(point: Point) {
      if (!this.canIssuePlayerCommand()) return;

      const units = readUnitViews(manager);
      const enemy = findUnitAt(units, point, {
        faction: UNIT_FACTION.ENEMY,
        radiusMultiplier: 1.8,
        minimumRadius: ATTACK_MOVE_RADIUS,
      });

      manager.transition({ type: enemy === null ? "ISSUE_MOVE" : "ISSUE_ATTACK_MOVE", payload: point });
      this.renderDirty = true;
    }

    private canIssuePlayerCommand() {
      return manager.getState().gameSession.state === "READY";
    }

    private worldPointFor(pointer: PhaserPointer): Point {
      const worldPoint = cameraWorldPointForScreen(this.cameras.main, pointer.x, pointer.y);
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
