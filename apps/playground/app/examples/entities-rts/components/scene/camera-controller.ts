import { RTS_MAP } from "../../store/spawn/placement";

import {
  CAMERA_INITIAL_VIEW_WIDTH,
  CAMERA_KEYBOARD_PAN_SPEED,
  CAMERA_MAX_ZOOM_MULTIPLIER,
  CAMERA_ZOOM_STEP,
} from "./constants";
import type { PhaserPointer, PhaserScene } from "./phaser-types";
import { cameraWorldPointForScreen, clampValue, setCameraScrollForScreenWorldPoint } from "./viewport";

// Владелец состояния камеры: размер вьюпорта, зум и скролл. Методы только меняют
// камеру и сообщают, изменилось ли изображение; перерисовку решает сцена.
export class CameraController {
  private viewport = { width: 0, height: 0 };
  private baseZoom = 1;
  private minZoom = 1;
  private maxZoom = 1;
  private zoomMultiplier = 1;
  private startupCenterFrames = 8;

  constructor(private readonly scene: PhaserScene) {}

  // Подгоняет камеру под текущий размер вьюпорта. true, если размер изменился.
  fitToMap(): boolean {
    const camera = this.scene.cameras.main;
    const width = Math.max(1, Math.floor(this.scene.scale.gameSize.width || camera.width));
    const height = Math.max(1, Math.floor(this.scene.scale.gameSize.height || camera.height));
    if (this.viewport.width === width && this.viewport.height === height) return false;

    this.viewport = { width, height };
    camera.setSize(width, height);
    camera.setBounds(0, 0, RTS_MAP.width, RTS_MAP.height);
    this.minZoom = Math.max(width / RTS_MAP.width, height / RTS_MAP.height);
    this.baseZoom = Math.max(this.minZoom, width / Math.min(RTS_MAP.width, CAMERA_INITIAL_VIEW_WIDTH));
    this.maxZoom = this.baseZoom * CAMERA_MAX_ZOOM_MULTIPLIER;
    this.zoomMultiplier = clampValue(this.zoomMultiplier, this.minZoom / this.baseZoom, CAMERA_MAX_ZOOM_MULTIPLIER);
    camera.setZoom(this.baseZoom * this.zoomMultiplier);
    camera.roundPixels = false;
    this.startupCenterFrames = Math.max(this.startupCenterFrames, 3);
    this.centerOnMap();
    return true;
  }

  // Несколько первых кадров камера держится в центре карты. true, пока центрирует.
  applyStartupCentering(): boolean {
    if (this.startupCenterFrames <= 0) return false;
    this.centerOnMap();
    this.startupCenterFrames -= 1;
    return true;
  }

  zoom(direction: -1 | 1, pointer?: PhaserPointer) {
    const camera = this.scene.cameras.main;
    const anchorBefore = pointer ? cameraWorldPointForScreen(camera, pointer.x, pointer.y) : null;
    const zoomFactor = direction > 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP;

    this.startupCenterFrames = 0;
    this.zoomMultiplier = clampValue(
      this.zoomMultiplier * zoomFactor,
      this.minZoom / this.baseZoom,
      CAMERA_MAX_ZOOM_MULTIPLIER,
    );
    camera.setZoom(clampValue(this.baseZoom * this.zoomMultiplier, this.minZoom, this.maxZoom));

    if (pointer && anchorBefore) {
      setCameraScrollForScreenWorldPoint(camera, pointer.x, pointer.y, anchorBefore);
      this.clampScroll();
      return;
    }

    this.centerOnMap();
  }

  reset() {
    this.zoomMultiplier = 1;
    this.scene.cameras.main.setZoom(this.baseZoom);
    this.centerOnMap();
  }

  // Сдвигает камеру по нажатым WASD. true, если был сдвиг.
  panFromKeyboard(deltaMs: number, pressedKeys: ReadonlySet<string>): boolean {
    const x = Number(pressedKeys.has("KeyD")) - Number(pressedKeys.has("KeyA"));
    const y = Number(pressedKeys.has("KeyS")) - Number(pressedKeys.has("KeyW"));
    if (x === 0 && y === 0) return false;

    const camera = this.scene.cameras.main;
    const distance = (CAMERA_KEYBOARD_PAN_SPEED * deltaMs) / 1_000 / camera.zoom;
    const diagonalScale = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;

    this.startupCenterFrames = 0;
    camera.scrollX += x * distance * diagonalScale;
    camera.scrollY += y * distance * diagonalScale;
    this.clampScroll();
    return true;
  }

  private centerOnMap() {
    const camera = this.scene.cameras.main;
    camera.centerOn(RTS_MAP.centerX, RTS_MAP.centerY);
    this.clampScroll();
  }

  private clampScroll() {
    const camera = this.scene.cameras.main;
    camera.scrollX = camera.clampX(camera.scrollX);
    camera.scrollY = camera.clampY(camera.scrollY);
  }
}
