import {
  RENDER_DEBUG_FLASH_MS,
  RENDER_DEBUG_SAMPLE_LIMIT,
  RENDER_DEBUG_UNIT_CHANGE_THRESHOLD,
  RENDER_DEBUG_VISIBLE_ENEMY_DELTA_THRESHOLD,
} from "./constants";
import type { PhaserScene } from "./phaser-types";
import { cameraWorldViewFor, clampValue, type RenderBounds, type RenderMode } from "./viewport";

export type RenderDebugPointKind = "enter" | "exit";

export type RenderDebugPoint = {
  x: number;
  y: number;
  kind: RenderDebugPointKind;
};

export type RenderSyncStats = {
  entered: number;
  exited: number;
  dotUnits: number;
  spriteUnits: number;
  debugPoints: RenderDebugPoint[];
};

export type RenderDebugPlanInput = {
  bounds: RenderBounds;
  lodDisabled: boolean;
  mode: RenderMode;
  enemyStride: number;
  visibleEnemies: number;
};

type RenderDebugPlan = {
  lodDisabled: boolean;
  mode: RenderMode;
  enemyStride: number;
  visibleEnemies: number;
};

type RenderDebugPulse = RenderSyncStats & {
  bounds: RenderBounds;
  lodDisabled: boolean;
  previousLodDisabled: boolean | null;
  mode: RenderMode;
  previousMode: RenderMode | null;
  enemyStride: number;
  previousEnemyStride: number | null;
  visibleEnemies: number;
  previousVisibleEnemies: number | null;
  startedAtMs: number;
};

export class UnitRenderDebugOverlay {
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly hud: HTMLDivElement;
  private enabled = false;
  private pulse: RenderDebugPulse | null = null;
  private lastPlan: RenderDebugPlan | null = null;

  constructor(private readonly scene: PhaserScene) {
    const document = scene.game.canvas.ownerDocument;
    const container = scene.game.canvas.parentElement ?? document.body;

    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this.root.style.zIndex = "2";
    this.root.style.pointerEvents = "none";
    this.root.style.overflow = "hidden";
    this.root.style.display = "none";

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.style.position = "absolute";
    this.svg.style.inset = "0";
    this.svg.style.width = "100%";
    this.svg.style.height = "100%";
    this.svg.style.overflow = "visible";

    this.hud = document.createElement("div");
    this.hud.style.position = "absolute";
    this.hud.style.left = "16px";
    this.hud.style.top = "112px";
    this.hud.style.minWidth = "168px";
    this.hud.style.border = "1px solid rgba(216, 255, 231, 0.22)";
    this.hud.style.borderRadius = "4px";
    this.hud.style.background = "rgba(7, 14, 12, 0.78)";
    this.hud.style.color = "#d8ffe7";
    this.hud.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    this.hud.style.fontSize = "12px";
    this.hud.style.lineHeight = "16px";
    this.hud.style.padding = "8px 10px";
    this.hud.style.whiteSpace = "pre";

    this.root.append(this.svg, this.hud);
    container.append(this.root);
  }

  reset() {
    this.enabled = false;
    this.pulse = null;
    this.lastPlan = null;
    this.svg.replaceChildren();
    this.hud.textContent = "";
    this.root.style.display = "none";
  }

  setEnabled(enabled: boolean, nowMs: number, enemyStride: number) {
    this.enabled = enabled;
    this.pulse = null;
    this.svg.replaceChildren();
    this.root.style.display = enabled ? "block" : "none";
    this.update(nowMs, enemyStride);
  }

  pushPoint(points: RenderDebugPoint[], x: number, y: number, kind: RenderDebugPointKind) {
    if (!this.enabled || points.length >= RENDER_DEBUG_SAMPLE_LIMIT) return;
    points.push({ kind, x, y });
  }

  recordSync(plan: RenderDebugPlanInput, stats: RenderSyncStats, nowMs: number) {
    const previous = this.lastPlan;
    this.lastPlan = {
      enemyStride: plan.enemyStride,
      lodDisabled: plan.lodDisabled,
      mode: plan.mode,
      visibleEnemies: plan.visibleEnemies,
    };

    if (!this.enabled) return;

    const lodChanged = previous !== null && previous.lodDisabled !== plan.lodDisabled;
    const strideChanged = previous !== null && previous.enemyStride !== plan.enemyStride;
    const modeChanged = previous !== null && previous.mode !== plan.mode;
    const visibleEnemyDelta =
      previous === null ? plan.visibleEnemies : Math.abs(plan.visibleEnemies - previous.visibleEnemies);
    const changedUnits = stats.entered + stats.exited;
    const shouldPulse =
      previous === null ||
      lodChanged ||
      modeChanged ||
      strideChanged ||
      changedUnits >= RENDER_DEBUG_UNIT_CHANGE_THRESHOLD ||
      visibleEnemyDelta >= RENDER_DEBUG_VISIBLE_ENEMY_DELTA_THRESHOLD;

    if (!shouldPulse) return;

    this.pulse = {
      ...stats,
      bounds: plan.bounds,
      enemyStride: plan.enemyStride,
      lodDisabled: plan.lodDisabled,
      mode: plan.mode,
      previousEnemyStride: previous?.enemyStride ?? null,
      previousLodDisabled: previous?.lodDisabled ?? null,
      previousMode: previous?.mode ?? null,
      previousVisibleEnemies: previous?.visibleEnemies ?? null,
      startedAtMs: nowMs,
      visibleEnemies: plan.visibleEnemies,
    };
  }

  update(nowMs: number, enemyStride: number) {
    if (!this.enabled) return;

    const pulse = this.pulse;
    const ageMs = pulse ? Math.max(0, nowMs - pulse.startedAtMs) : RENDER_DEBUG_FLASH_MS;
    const pulseAlpha = pulse ? clampValue(1 - ageMs / RENDER_DEBUG_FLASH_MS, 0, 1) : 0;

    this.root.style.display = "block";
    this.resizeSvg();
    this.svg.replaceChildren();

    if (pulse && pulseAlpha > 0) {
      this.drawPulse(pulse, pulseAlpha);
    }

    const previousMode = pulse?.previousMode ?? this.lastPlan?.mode ?? null;
    const previousLodDisabled = pulse?.previousLodDisabled ?? this.lastPlan?.lodDisabled ?? null;
    const previousStride = pulse?.previousEnemyStride ?? this.lastPlan?.enemyStride ?? null;
    const previousVisible = pulse?.previousVisibleEnemies ?? this.lastPlan?.visibleEnemies ?? null;
    const mode = pulse?.mode ?? this.lastPlan?.mode ?? "sprite";
    const lodDisabled = pulse?.lodDisabled ?? this.lastPlan?.lodDisabled ?? false;
    const stride = pulse?.enemyStride ?? this.lastPlan?.enemyStride ?? enemyStride;
    const visibleEnemies = pulse?.visibleEnemies ?? this.lastPlan?.visibleEnemies ?? 0;
    const lodMode = lodDisabled ? "disabled" : "auto";
    const previousLodMode =
      previousLodDisabled === null ? null : previousLodDisabled ? "disabled" : "auto";

    this.hud.textContent = [
      "render debug",
      `lod ${previousLodMode && previousLodMode !== lodMode ? `${previousLodMode}->` : ""}${lodMode}`,
      `mode ${previousMode && previousMode !== mode ? `${previousMode}->` : ""}${mode}`,
      `enemy stride ${previousStride !== null && previousStride !== stride ? `${previousStride}->` : ""}${stride}`,
      `visible enemies ${previousVisible !== null && previousVisible !== visibleEnemies ? `${previousVisible}->` : ""}${visibleEnemies}`,
      pulse
        ? `sync +${pulse.entered} -${pulse.exited} sprites ${pulse.spriteUnits} dots ${pulse.dotUnits}`
        : "sync waiting",
    ].join("\n");
    this.hud.style.opacity = String(0.74 + pulseAlpha * 0.26);
  }

  private drawPulse(pulse: RenderDebugPulse, alpha: number) {
    const bounds = this.screenRectFor(pulse.bounds);
    this.appendRect(bounds.x, bounds.y, bounds.width, bounds.height, "#63ffd2", 0.26 * alpha, 10);
    this.appendRect(bounds.x, bounds.y, bounds.width, bounds.height, "#f8ff7a", 0.9 * alpha, 2);

    const radius = 10 + (1 - alpha) * 18;
    for (const point of pulse.debugPoints) {
      const screen = this.screenPointFor(point.x, point.y);
      const color = point.kind === "enter" ? "#65ff9a" : "#ff6b83";
      this.appendCircle(screen.x, screen.y, radius, color, 0.88 * alpha, 3);
    }
  }

  private resizeSvg() {
    const width = Math.max(1, Math.round(this.root.clientWidth || this.scene.cameras.main.width));
    const height = Math.max(1, Math.round(this.root.clientHeight || this.scene.cameras.main.height));
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(height));
  }

  private screenRectFor(bounds: RenderBounds) {
    const topLeft = this.screenPointFor(bounds.left, bounds.top);
    const bottomRight = this.screenPointFor(bounds.right, bounds.bottom);

    return {
      height: bottomRight.y - topLeft.y,
      width: bottomRight.x - topLeft.x,
      x: topLeft.x,
      y: topLeft.y,
    };
  }

  private screenPointFor(x: number, y: number) {
    const camera = this.scene.cameras.main;
    const worldView = cameraWorldViewFor(camera);
    const zoom = Math.max(0.001, camera.zoom);

    return {
      x: camera.x + (x - worldView.left) * zoom,
      y: camera.y + (y - worldView.top) * zoom,
    };
  }

  private appendRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    opacity: number,
    stroke: number,
  ) {
    const rect = this.createSvgElement("rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-opacity", String(opacity));
    rect.setAttribute("stroke-width", String(stroke));
    this.svg.append(rect);
  }

  private appendCircle(x: number, y: number, radius: number, color: string, opacity: number, stroke: number) {
    const circle = this.createSvgElement("circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-opacity", String(opacity));
    circle.setAttribute("stroke-width", String(stroke));
    this.svg.append(circle);
  }

  private createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K) {
    return this.svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  }
}
