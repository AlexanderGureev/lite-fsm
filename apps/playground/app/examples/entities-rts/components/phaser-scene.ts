import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from "../store";
import { isUnitAlive } from "../store/machines/unit-health";
import type { MetricsAdapter } from "../store/metrics";
import {
  entityIdForUnitIndex,
  readProjectileView,
  readUnitViews,
  unitSelected,
  type ProjectileView,
  type UnitViews,
} from "../store/selectors";
import { RTS_MAP } from "../store/spawn/placement";
import { createSeededRandom } from "../store/spawn/random";
import type { Point } from "../store/types";
import { UNIT_FACTION, UNIT_KIND, UNIT_SELECTION } from "../store/unit-model";

export type PhaserApi = typeof import("phaser");

type PhaserImage = import("phaser").GameObjects.Image;
type PhaserGraphics = import("phaser").GameObjects.Graphics;
type PhaserPointer = import("phaser").Input.Pointer;
type PhaserCamera = import("phaser").Cameras.Scene2D.Camera;

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
  projectile: "entities-rts-projectile",
  ground: "entities-rts-ground",
  rock: "entities-rts-rock",
  tuft: "entities-rts-tuft",
  impactRing: "entities-rts-impact-ring",
  impactGlow: "entities-rts-impact-glow",
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
const HP_BAR_MIN_WIDTH = 18;
const HP_BAR_BG_HEIGHT = 7;
const HP_BAR_FILL_HEIGHT = 4;
const HP_BAR_HORIZONTAL_PADDING = 2;
const HP_BAR_GAP = 5;
// Рамка выделения уходит под спрайты, чтобы не перекрывать плотные отряды.
const SELECTION_DEPTH = 2;
const SELECTION_PADDING = 8;
const SIMULATION_TICK_RATE = 30;
const FIXED_SIMULATION_STEP_MS = 1_000 / SIMULATION_TICK_RATE;
const MAX_SIMULATION_FRAME_DELTA_MS = 100;
const MAX_SIMULATION_STEPS_PER_FRAME = 4;
const MAX_SPAWN_STEPS_PER_FRAME = 1;
const SPAWN_RENDER_CREATE_BUDGET = 768;
const RENDER_CULL_MARGIN = 256;
const MAX_VISIBLE_ENEMY_SPRITES = 8_000;
const UNIT_DOT_LOD_MAX_ZOOM = 0.22;
const LOD_STRIDE_ENTER_RATIO = 1.12;
const LOD_STRIDE_EXIT_RATIO = 0.72;
const MAX_LOD_STRIDE = 16;
const ALLY_DOT_SCREEN_SIZE = 2.4;
const ENEMY_DOT_SCREEN_SIZE = 2.1;
const DOT_MIN_WORLD_SIZE = 7;
const DOT_MAX_WORLD_SIZE = 18;
const PROJECTILE_RENDER_RADIUS = 12;
const MAX_VISIBLE_PROJECTILE_SPRITES = 2_500;
const MAX_VISIBLE_PROJECTILE_DOTS = 6_000;
const PROJECTILE_DOT_SCREEN_SIZE = 2.4;
const MOVING_SPEED_THRESHOLD_SQUARED = 1;
// Параметры косметических эффектов попадания. Эффекты живут вне симуляции и
// сливаются из пула снарядов раз в кадр, поэтому ограничены по числу и времени.
const IMPACT_RING_LIFE_MS = 320;
const IMPACT_FLASH_LIFE_MS = 220;
const HIT_SPARK_LIFE_MS = 260;
const IMPACT_MIN_RADIUS = 26;
const HIT_SPARK_MAX_DIAMETER = 48;
const MAX_ACTIVE_EFFECTS = 420;
const MAX_IMPACT_EVENTS_PER_FRAME = 48;
const MAX_HIT_EVENTS_PER_FRAME = 180;
const IMPACT_RING_DEPTH = 6;
const HIT_SPARK_DEPTH = 7;

type DragState = {
  start: Point;
  current: Point;
};

type UnitView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  hpRate: number;
  kind: number;
  frame: number;
};

type HpBarView = {
  bg: PhaserImage;
  fill: PhaserImage;
};

type RenderBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type CameraWorldView = RenderBounds & {
  width: number;
  height: number;
};

type RenderMode = "sprite" | "dot";

type RenderPlan = {
  bounds: RenderBounds;
  mode: RenderMode;
  enemyStride: number;
};

type ProjectileSpriteView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  vx: number;
  vy: number;
  rotation: number;
  radius: number;
};

type SpriteEffect = {
  sprite: PhaserImage;
  textureKey: string;
  ageMs: number;
  lifeMs: number;
  startDiameter: number;
  endDiameter: number;
  startAlpha: number;
  spinRate: number;
};

type SpriteEffectSpawn = {
  textureKey: string;
  x: number;
  y: number;
  lifeMs: number;
  startDiameter: number;
  endDiameter: number;
  startAlpha: number;
  spinRate: number;
  depth: number;
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

const renderBoundsForScene = (scene: import("phaser").Scene): RenderBounds => {
  const worldView = cameraWorldViewFor(scene.cameras.main);

  return {
    left: worldView.left - RENDER_CULL_MARGIN,
    right: worldView.right + RENDER_CULL_MARGIN,
    top: worldView.top - RENDER_CULL_MARGIN,
    bottom: worldView.bottom + RENDER_CULL_MARGIN,
  };
};

const pointIntersectsBounds = (x: number, y: number, radius: number, bounds: RenderBounds) =>
  x + radius >= bounds.left && x - radius <= bounds.right && y + radius >= bounds.top && y - radius <= bounds.bottom;

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cameraWorldViewFor = (camera: PhaserCamera): CameraWorldView => {
  const zoom = Math.max(0.001, camera.zoom);
  const width = camera.width / zoom;
  const height = camera.height / zoom;
  const left = camera.scrollX + camera.width / 2 - width / 2;
  const top = camera.scrollY + camera.height / 2 - height / 2;

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
};

const cameraWorldPointForScreen = (camera: PhaserCamera, x: number, y: number): Point => {
  const worldView = cameraWorldViewFor(camera);
  const zoom = Math.max(0.001, camera.zoom);

  return {
    x: worldView.left + (x - camera.x) / zoom,
    y: worldView.top + (y - camera.y) / zoom,
  };
};

const setCameraScrollForScreenWorldPoint = (camera: PhaserCamera, x: number, y: number, worldPoint: Point) => {
  const zoom = Math.max(0.001, camera.zoom);
  const worldLeft = worldPoint.x - (x - camera.x) / zoom;
  const worldTop = worldPoint.y - (y - camera.y) / zoom;

  camera.scrollX = worldLeft - camera.width / 2 + camera.width / zoom / 2;
  camera.scrollY = worldTop - camera.height / 2 + camera.height / zoom / 2;
};

const visualStepSeconds = (extrapolationMs: number) =>
  Math.min(FIXED_SIMULATION_STEP_MS, Math.max(0, extrapolationMs)) / 1_000;

const nextStableStride = (visibleCount: number, maxVisible: number, currentStride: number) => {
  let stride = Math.max(1, currentStride);

  while (visibleCount > maxVisible * stride * LOD_STRIDE_ENTER_RATIO && stride < MAX_LOD_STRIDE) {
    stride *= 2;
  }

  while (stride > 1 && visibleCount < maxVisible * (stride / 2) * LOD_STRIDE_EXIT_RATIO) {
    stride /= 2;
  }

  return stride;
};

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

const spriteDisplaySize = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return { width: 66, height: 104 };
  if (kind === UNIT_KIND.ALLY) return { width: 34, height: 54 };
  return { width: 38, height: 42 };
};

const displaySizeForKind = (kind: number) => spriteDisplaySize(kind).height;

const spriteAnimForKind = (kind: number) => {
  if (kind === UNIT_KIND.HERO) return { frameCount: 4, frameDurationMs: 120 };
  if (kind === UNIT_KIND.ALLY) return { frameCount: 4, frameDurationMs: 120 };
  return { frameCount: 2, frameDurationMs: 320 };
};

const animationFrameIndex = (timeMs: number, frameDurationMs: number, frameCount: number, phase: number) =>
  (Math.floor(timeMs / frameDurationMs) + phase) % frameCount;

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

// Кадры юнита собираются из неподвижного торса, набора ног (узкая/широкая стойка)
// и тени. "bob" поднимает тело над зафиксированной тенью — так горизонтальный
// пиксель-арт получает объем: персонаж пружинит, а тень держит его на земле.
type WalkStance = "apart" | "together";

type WalkFrame = { stance: WalkStance; bob: number };

type WalkerArt = {
  width: number;
  torso: string[];
  legsApart: string[];
  legsTogether: string[];
  shadow: string[];
  frames: WalkFrame[];
};

const buildWalkerFrames = (art: WalkerArt): string[][] => {
  const maxBob = art.frames.reduce((max, frame) => Math.max(max, frame.bob), 0);
  const blankRow = ".".repeat(art.width);
  const pad = (row: string) => row.padEnd(art.width, ".");

  return art.frames.map(({ stance, bob }) => {
    const legs = stance === "apart" ? art.legsApart : art.legsTogether;
    const body = [...art.torso, ...legs].map(pad);

    return [
      ...Array.from({ length: maxBob - bob }, () => blankRow),
      ...body,
      ...Array.from({ length: bob }, () => blankRow),
      ...art.shadow.map(pad),
    ];
  });
};

const addGeneratedSpriteSheet = (
  scene: import("phaser").Scene,
  key: string,
  frames: string[][],
  palette: Record<string, string>,
  pixelWidth = 4,
) => {
  if (scene.textures.exists(key)) return;

  const columns = Math.max(...frames.flatMap((frame) => frame.map((row) => row.length)));
  const rows = Math.max(...frames.map((frame) => frame.length));
  const frameWidth = columns * pixelWidth;
  const frameHeight = rows * pixelWidth;
  const texture = scene.textures.createCanvas(key, frameWidth * frames.length, frameHeight);
  if (!texture) return;

  const context = texture.getContext();
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, frameWidth * frames.length, frameHeight);

  frames.forEach((frame, frameIndex) => {
    const offsetX = frameIndex * frameWidth;

    for (let row = 0; row < frame.length; row += 1) {
      for (let column = 0; column < frame[row].length; column += 1) {
        const color = palette[frame[row][column]];
        if (!color || color === "rgba(0,0,0,0)") continue;

        context.fillStyle = color;
        context.fillRect(offsetX + column * pixelWidth, row * pixelWidth, pixelWidth, pixelWidth);
      }
    }

    texture.add(frameIndex, 0, offsetX, 0, frameWidth, frameHeight);
  });

  texture.refresh();
};

const ZOMBIE_ART: WalkerArt = {
  width: 8,
  torso: ["..lgg...", ".lgggg..", ".dgeeg..", "ddgggdd.", ".dgggd..", "..ggg..."],
  legsApart: ["..d..d.."],
  legsTogether: ["..d..d.."],
  shadow: [".ssssss."],
  frames: [
    { stance: "apart", bob: 0 },
    { stance: "apart", bob: 1 },
  ],
};

const ALLY_ART: WalkerArt = {
  width: 8,
  torso: ["...dd...", "..dkkd..", "..kkkk..", "..hbbh..", ".bbbbbb.", ".kdbbdk.", "..bbbb..", "..dbbd.."],
  legsApart: ["..b..b..", "..o..o.."],
  legsTogether: ["...bb...", "...oo..."],
  shadow: [".ssssss."],
  frames: [
    { stance: "apart", bob: 0 },
    { stance: "together", bob: 1 },
    { stance: "apart", bob: 2 },
    { stance: "together", bob: 1 },
  ],
};

const HERO_ART: WalkerArt = {
  width: 10,
  torso: [
    "....rr....",
    "...mrrm...",
    "..mhmmhm..",
    "..mkkkkm..",
    "...kkkk...",
    "..hbbbbh..",
    ".hbbbbbbh.",
    ".kdbbbbdk.",
    "..bbbbbb..",
    "..bhbbhb..",
    "..obbbbo..",
  ],
  legsApart: ["...b..b...", "...o..o..."],
  legsTogether: ["....bb....", "....oo...."],
  shadow: ["..ssssss.."],
  frames: [
    { stance: "apart", bob: 0 },
    { stance: "together", bob: 1 },
    { stance: "apart", bob: 2 },
    { stance: "together", bob: 1 },
  ],
};

const ZOMBIE_PALETTE = {
  ".": "rgba(0,0,0,0)",
  s: "rgba(0,0,0,0.34)",
  d: "#3f4a2c",
  g: "#6b7a45",
  l: "#97a86a",
  e: "#6e241c",
};

const ALLY_PALETTE = {
  ".": "rgba(0,0,0,0)",
  s: "rgba(0,0,0,0.30)",
  o: "#0f3a24",
  d: "#2f9e5e",
  b: "#43c46f",
  h: "#8ff0ad",
  k: "#f1c79a",
};

const HERO_PALETTE = {
  ".": "rgba(0,0,0,0)",
  s: "rgba(0,0,0,0.32)",
  o: "#5b3d12",
  d: "#caa033",
  b: "#f0c23e",
  h: "#ffe486",
  k: "#f1c79a",
  m: "#cdd6ec",
  r: "#e24a30",
};

// Тайл земли: мшистый грунт с низкочастотными пятнами и редкими вкраплениями.
// Низкочастотная "грубая" карта задает органичные участки, а пожатие на блок
// добавляет фактуру — так у плоской карты появляется глубина.
const GROUND_BLOCKS = 96;
const GROUND_BLOCK_PIXELS = 6;
const GROUND_COARSE = 10;

const addGroundTexture = (scene: import("phaser").Scene, key: string) => {
  if (scene.textures.exists(key)) return;

  const size = GROUND_BLOCKS * GROUND_BLOCK_PIXELS;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;

  const context = texture.getContext();
  context.imageSmoothingEnabled = false;

  const random = createSeededRandom("rts-ground-v1");
  const moss = ["#0f1813", "#13201a", "#172620", "#1c2d24", "#22352a"];
  const dirt = ["#262217", "#2d2a1d"];
  const coarse = Array.from({ length: GROUND_COARSE * GROUND_COARSE }, () => random());

  for (let by = 0; by < GROUND_BLOCKS; by += 1) {
    for (let bx = 0; bx < GROUND_BLOCKS; bx += 1) {
      const cx = Math.floor((bx / GROUND_BLOCKS) * GROUND_COARSE);
      const cy = Math.floor((by / GROUND_BLOCKS) * GROUND_COARSE);
      const region = coarse[cy * GROUND_COARSE + cx];
      const jitter = random();
      // Земля проступает вероятностно по краям "грязного" участка — это размывает
      // жесткие квадраты грубой карты и делает грунт органичным.
      const dirtChance = Math.max(0, region - 0.74) * 2.6;

      let color: string;
      if (jitter < dirtChance) {
        color = dirt[jitter < dirtChance * 0.5 ? 0 : 1];
      } else if (jitter > 0.985) {
        color = "#2c4434";
      } else {
        const level = Math.min(moss.length - 1, Math.floor((region * 0.4 + jitter * 0.6) * moss.length));
        color = moss[level];
      }

      context.fillStyle = color;
      context.fillRect(bx * GROUND_BLOCK_PIXELS, by * GROUND_BLOCK_PIXELS, GROUND_BLOCK_PIXELS, GROUND_BLOCK_PIXELS);
    }
  }

  texture.refresh();
};

const ROCK_ART = ["........", "..lll...", ".lgggl..", ".gggggo.", ".oggggo.", ".soooos.", "..sss..."];

const ROCK_PALETTE = { ".": "rgba(0,0,0,0)", s: "rgba(0,0,0,0.32)", o: "#2b302d", g: "#565d59", l: "#828984" };

const TUFT_ART = ["...b....", ".b.bl.b.", ".blblbl.", "bblbbblb", ".bbbbbb.", ".sssss..", "...s...."];

const TUFT_PALETTE = { ".": "rgba(0,0,0,0)", s: "rgba(0,0,0,0.26)", b: "#2f5d3a", l: "#6fae6a" };

const addRingTexture = (scene: import("phaser").Scene, key: string, size: number, lineWidth: number, color: string) => {
  if (scene.textures.exists(key)) return;

  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;

  const context = texture.getContext();
  const radius = size / 2;
  context.clearRect(0, 0, size, size);
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.beginPath();
  context.arc(radius, radius, radius - lineWidth, 0, Math.PI * 2);
  context.stroke();
  texture.refresh();
};

const addRadialGlowTexture = (
  scene: import("phaser").Scene,
  key: string,
  size: number,
  stops: ReadonlyArray<readonly [number, string]>,
) => {
  if (scene.textures.exists(key)) return;

  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;

  const context = texture.getContext();
  const radius = size / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.clearRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(radius, radius, radius, 0, Math.PI * 2);
  context.fill();
  texture.refresh();
};

const ensureGeneratedTextures = (scene: import("phaser").Scene) => {
  const transparent = "rgba(0,0,0,0)";

  addGroundTexture(scene, TEXTURES.ground);
  addGeneratedTexture(scene, TEXTURES.rock, ROCK_ART, ROCK_PALETTE, 3);
  addGeneratedTexture(scene, TEXTURES.tuft, TUFT_ART, TUFT_PALETTE, 3);
  addGeneratedSpriteSheet(scene, TEXTURES.hero, buildWalkerFrames(HERO_ART), HERO_PALETTE);
  addGeneratedSpriteSheet(scene, TEXTURES.ally, buildWalkerFrames(ALLY_ART), ALLY_PALETTE);
  addGeneratedSpriteSheet(scene, TEXTURES.enemy, buildWalkerFrames(ZOMBIE_ART), ZOMBIE_PALETTE);
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
  addGeneratedTexture(
    scene,
    TEXTURES.projectile,
    ["..p.", ".pPp", "pPPp", ".pPp", "..p."],
    {
      ".": transparent,
      p: "#9ef6c4",
      P: "#f7ffe1",
    },
    2,
  );
  addRingTexture(scene, TEXTURES.impactRing, 64, 6, "rgba(190, 255, 214, 0.95)");
  addRadialGlowTexture(scene, TEXTURES.impactGlow, 64, [
    [0, "rgba(247, 255, 225, 0.95)"],
    [0.35, "rgba(158, 246, 196, 0.7)"],
    [1, "rgba(158, 246, 196, 0)"],
  ]);
};

class UnitSpriteRenderer {
  private readonly sprites = new Map<number, UnitView>();
  private readonly spritePools = new Map<string, PhaserImage[]>();
  private readonly selected = new Map<number, PhaserImage>();
  private readonly hpBars = new Map<number, HpBarView>();
  private readonly liveEntities = new Set<number>();
  private readonly projectableEntities = new Set<number>();
  private readonly allyDots: PhaserGraphics;
  private readonly enemyDots: PhaserGraphics;
  private loadingSyncCursor = 0;
  private dotLoadingCapacity = -1;
  private dotLoadingZoom = -1;
  private animTimeMs = 0;
  private enemySpriteStride = 1;
  private allyDotWorldSize = 0;
  private enemyDotWorldSize = 0;

  constructor(
    private readonly scene: import("phaser").Scene,
    private readonly manager: AppStore,
  ) {
    this.enemyDots = scene.add.graphics().setDepth(3).setVisible(false);
    this.allyDots = scene.add.graphics().setDepth(4).setVisible(false);
  }

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    for (const pool of this.spritePools.values()) for (const sprite of pool) sprite.destroy();
    for (const view of this.selected.values()) view.destroy();
    for (const view of this.hpBars.values()) {
      view.bg.destroy();
      view.fill.destroy();
    }
    this.allyDots.clear().setVisible(false);
    this.enemyDots.clear().setVisible(false);

    this.sprites.clear();
    this.spritePools.clear();
    this.selected.clear();
    this.hpBars.clear();
    this.liveEntities.clear();
    this.projectableEntities.clear();
    this.loadingSyncCursor = 0;
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    this.enemySpriteStride = 1;
  }

  sync() {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    this.liveEntities.clear();
    this.loadingSyncCursor = units.capacity;
    this.dotLoadingCapacity = plan.mode === "dot" ? units.capacity : -1;
    this.dotLoadingZoom = plan.mode === "dot" ? this.scene.cameras.main.zoom : -1;
    this.syncVisibleUnits(units, plan);
  }

  private syncVisibleUnits(units: UnitViews, plan: RenderPlan) {
    this.prepareDotLayer(plan);

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (!this.unitIntersectsBounds(units, entity, plan.bounds)) continue;

      const kind = units.identity.kind[entity];
      if (plan.mode === "dot" && kind !== UNIT_KIND.HERO) {
        this.syncUnitDot(units, entity, kind);
        continue;
      }

      if (!this.unitShouldRender(units, entity, kind, plan)) continue;

      this.liveEntities.add(index);
      this.syncUnit(units, entity);
    }

    this.cleanupMissing();
  }

  syncLoading(maxCreates: number) {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    if (plan.mode === "dot") {
      const zoom = this.scene.cameras.main.zoom;
      const shouldSyncDots =
        this.dotLoadingCapacity !== units.capacity ||
        Math.abs(this.dotLoadingZoom - zoom) > 0.001 ||
        this.sprites.size > 1;

      if (shouldSyncDots) {
        this.liveEntities.clear();
        this.syncVisibleUnits(units, plan);
        this.dotLoadingCapacity = units.capacity;
        this.dotLoadingZoom = zoom;
      }

      this.loadingSyncCursor = units.capacity;
      return;
    }

    this.clearDotLayer();
    this.dotLoadingCapacity = -1;
    this.dotLoadingZoom = -1;
    const capacity = units.capacity;
    let created = 0;
    let index = Math.min(this.loadingSyncCursor, capacity);

    while (index < capacity && created < maxCreates) {
      const entity = index as EntityIndex;
      const kind = units.identity.kind[entity];
      const shouldCreate =
        isUnitAlive(units.health, entity) &&
        this.unitIntersectsBounds(units, entity, plan.bounds) &&
        this.unitShouldRender(units, entity, kind, plan) &&
        !this.sprites.has(index);

      if (shouldCreate) {
        this.syncUnit(units, entity);
        created += 1;
      }

      index += 1;
    }

    this.loadingSyncCursor = index;
  }

  project(extrapolationMs: number) {
    const dt = visualStepSeconds(extrapolationMs);
    this.animTimeMs = this.scene.time.now;

    for (const key of this.projectableEntities) {
      const view = this.sprites.get(key);
      if (!view) continue;

      const x = view.x + view.vx * dt;
      const y = view.y + view.vy * dt;

      if (view.renderX !== x || view.renderY !== y) {
        view.renderX = x;
        view.renderY = y;
        view.sprite.setPosition(x, y);
        this.syncProjectedAttachments(key, view);
      }

      this.syncAnimation(view, key);
    }
  }

  private createRenderPlan(units: UnitViews): RenderPlan {
    const bounds = this.renderBounds();
    const mode = this.renderMode();
    let visibleEnemies = 0;

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (units.identity.faction[entity] !== UNIT_FACTION.ENEMY) continue;
      if (!this.unitIntersectsBounds(units, entity, bounds)) continue;

      visibleEnemies += 1;
    }

    if (mode === "sprite") {
      this.enemySpriteStride = nextStableStride(
        visibleEnemies,
        MAX_VISIBLE_ENEMY_SPRITES,
        this.enemySpriteStride,
      );
    }

    return {
      bounds,
      mode,
      enemyStride: mode === "sprite" ? this.enemySpriteStride : 1,
    };
  }

  private renderBounds(): RenderBounds {
    return renderBoundsForScene(this.scene);
  }

  private renderMode(): RenderMode {
    return this.scene.cameras.main.zoom <= UNIT_DOT_LOD_MAX_ZOOM ? "dot" : "sprite";
  }

  private prepareDotLayer(plan: RenderPlan) {
    if (plan.mode !== "dot") {
      this.clearDotLayer();
      return;
    }

    const zoom = Math.max(0.001, this.scene.cameras.main.zoom);
    this.allyDotWorldSize = clampValue(ALLY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);
    this.enemyDotWorldSize = clampValue(ENEMY_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);

    this.allyDots.clear().setVisible(true);
    this.enemyDots.clear().setVisible(true);
    this.allyDots.fillStyle(0x8ff0ad, 0.82);
    this.enemyDots.fillStyle(0x9aa866, 0.76);
  }

  private clearDotLayer() {
    this.allyDots.clear().setVisible(false);
    this.enemyDots.clear().setVisible(false);
  }

  private syncUnitDot(units: UnitViews, entity: EntityIndex, kind: number) {
    const faction = units.identity.faction[entity];
    const graphics = faction === UNIT_FACTION.PLAYER ? this.allyDots : this.enemyDots;
    const size = faction === UNIT_FACTION.PLAYER ? this.allyDotWorldSize : this.enemyDotWorldSize;
    const half = size / 2;
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];

    if (faction === UNIT_FACTION.PLAYER && unitSelected(units, entity) === UNIT_SELECTION.SELECTED) {
      graphics.fillStyle(0xe8f8ff, 0.92);
      graphics.fillRect(x - half, y - half, size, size);
      graphics.fillStyle(0x8ff0ad, 0.82);
      return;
    }

    const dotSize = kind === UNIT_KIND.ALLY ? size : Math.max(DOT_MIN_WORLD_SIZE, size);
    const dotHalf = dotSize / 2;
    graphics.fillRect(x - dotHalf, y - dotHalf, dotSize, dotSize);
  }

  private unitShouldRender(units: UnitViews, entity: EntityIndex, kind: number, plan: RenderPlan) {
    if (plan.mode === "dot" && kind !== UNIT_KIND.HERO) return false;
    if (plan.enemyStride <= 1 || units.identity.faction[entity] !== UNIT_FACTION.ENEMY) return true;

    const unitIndex = units.identity.unitIndex[entity];
    return unitIndex < 0 || unitIndex % plan.enemyStride === 0;
  }

  private unitIntersectsBounds(units: UnitViews, entity: EntityIndex, bounds: RenderBounds) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const radius = displaySizeForKind(units.identity.kind[entity]) * 0.5;

    return pointIntersectsBounds(x, y, radius, bounds);
  }

  private syncUnit(units: UnitViews, entity: EntityIndex) {
    const key = Number(entity);
    const kind = units.identity.kind[entity];
    const size = displaySizeForKind(kind);
    const texture = textureForKind(kind);
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const vx = units.movement.vx[entity];
    const vy = units.movement.vy[entity];
    const view = this.sprites.get(key) ?? this.createUnitView(key, units, entity, kind, texture);
    const hp = units.health.hp[entity];
    const maxHp = units.health.maxHp[entity];
    let hpRate = view.hpRate;

    if (view.x !== x || view.y !== y || view.vx !== vx || view.vy !== vy) {
      view.x = x;
      view.y = y;
      view.vx = vx;
      view.vy = vy;
    }

    if (view.kind !== kind) {
      const display = spriteDisplaySize(kind);
      view.kind = kind;
      view.frame = 0;
      view.sprite.setTexture(texture, 0);
      view.sprite.setDepth(depthForKind(kind));
      view.sprite.setDisplaySize(display.width, display.height);
    }

    if (view.hp !== hp || view.maxHp !== maxHp) {
      view.hp = hp;
      view.maxHp = maxHp;
      hpRate = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    }

    if (view.hpRate !== hpRate) {
      view.hpRate = hpRate;
      view.sprite.setAlpha(0.74 + hpRate * 0.26);

      if (kind === UNIT_KIND.ENEMY && hpRate < 0.5) {
        view.sprite.setTint(0xffc05b);
      } else if (kind === UNIT_KIND.HERO && hpRate < 0.25) {
        view.sprite.setTint(0xff786b);
      } else {
        view.sprite.clearTint();
      }
    }

    this.syncAnimation(view, key);

    if (kind === UNIT_KIND.ENEMY && hpRate >= 1) {
      this.syncProjectionMembership(key, view);
      return;
    }

    const selected = unitSelected(units, entity);
    this.syncSelection(entity, view, size, kind, selected);
    this.syncHpBar(entity, view, size, kind, hpRate);
    this.syncProjectionMembership(key, view);
  }

  private createUnitView(key: number, units: UnitViews, entity: EntityIndex, kind: number, texture: string) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const display = spriteDisplaySize(kind);
    const sprite = this.acquireSprite(texture, kind, x, y);
    const view: UnitView = {
      frame: 0,
      hp: -1,
      hpRate: -1,
      kind,
      maxHp: -1,
      renderX: x,
      renderY: y,
      sprite: sprite.setDisplaySize(display.width, display.height),
      vx: units.movement.vx[entity],
      vy: units.movement.vy[entity],
      x,
      y,
    };

    this.sprites.set(key, view);
    return view;
  }

  private acquireSprite(texture: string, kind: number, x: number, y: number) {
    const pooled = this.spritePools.get(texture)?.pop();
    const sprite = pooled ?? this.scene.add.image(x, y, texture, 0).setOrigin(0.5, 0.5);

    sprite
      .setVisible(true)
      .setTexture(texture, 0)
      .setPosition(x, y)
      .setDepth(depthForKind(kind))
      .setAlpha(1)
      .clearTint();

    return sprite;
  }

  private releaseSprite(view: UnitView) {
    const texture = textureForKind(view.kind);
    view.sprite.setVisible(false);

    const pool = this.spritePools.get(texture);
    if (pool) pool.push(view.sprite);
    else this.spritePools.set(texture, [view.sprite]);
  }

  private syncAnimation(view: UnitView, key: number) {
    const anim = spriteAnimForKind(view.kind);
    const moving = view.vx * view.vx + view.vy * view.vy > MOVING_SPEED_THRESHOLD_SQUARED;
    const frame = moving
      ? animationFrameIndex(this.animTimeMs, anim.frameDurationMs, anim.frameCount, key % anim.frameCount)
      : 0;

    if (view.frame === frame) return;
    view.frame = frame;
    view.sprite.setFrame(frame);
  }

  private syncSelection(entity: EntityIndex, view: UnitView, size: number, kind: number, selected: number) {
    const key = Number(entity);
    const shouldShow = selected === UNIT_SELECTION.SELECTED || kind === UNIT_KIND.HERO;

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
      this.scene.add
        .image(view.renderX, view.renderY, TEXTURES.selected)
        .setOrigin(0.5, 0.5)
        .setDepth(SELECTION_DEPTH);

    this.selected.set(key, highlight);
    highlight.setPosition(view.renderX, view.renderY);
    highlight.setDisplaySize(spriteDisplaySize(kind).width + SELECTION_PADDING, size + SELECTION_PADDING);
    highlight.setAlpha(selected === UNIT_SELECTION.SELECTED ? 0.9 : 0.34);
  }

  private syncHpBar(entity: EntityIndex, view: UnitView, size: number, kind: number, hpRate: number) {
    const key = Number(entity);
    const shouldShow = kind === UNIT_KIND.HERO || hpRate < 1;

    if (!shouldShow) {
      const stale = this.hpBars.get(key);
      if (stale) {
        stale.bg.destroy();
        stale.fill.destroy();
        this.hpBars.delete(key);
      }
      return;
    }

    const width = Math.max(HP_BAR_MIN_WIDTH, spriteDisplaySize(kind).width);
    const y = view.renderY - size / 2 - HP_BAR_GAP;
    const bar =
      this.hpBars.get(key) ??
      ({
        bg: this.scene.add.image(view.renderX, y, TEXTURES.hpBg).setOrigin(0.5, 0.5).setDepth(8),
        fill: this.scene.add
          .image(view.renderX - width / 2, y, TEXTURES.hpFill)
          .setOrigin(0, 0.5)
          .setDepth(9),
      } satisfies HpBarView);

    this.hpBars.set(key, bar);
    bar.bg.setPosition(view.renderX, y);
    bar.bg.setDisplaySize(width + HP_BAR_HORIZONTAL_PADDING, HP_BAR_BG_HEIGHT);
    bar.fill.setPosition(view.renderX - width / 2, y);
    bar.fill.setDisplaySize(Math.max(1, width * hpRate), HP_BAR_FILL_HEIGHT);
  }

  private syncProjectedAttachments(key: number, view: UnitView) {
    const selected = this.selected.get(key);
    if (selected) selected.setPosition(view.renderX, view.renderY);

    const bar = this.hpBars.get(key);
    if (!bar) return;

    const size = displaySizeForKind(view.kind);
    const width = Math.max(HP_BAR_MIN_WIDTH, spriteDisplaySize(view.kind).width);
    const y = view.renderY - size / 2 - HP_BAR_GAP;
    bar.bg.setPosition(view.renderX, y);
    bar.fill.setPosition(view.renderX - width / 2, y);
  }

  private syncProjectionMembership(key: number, view: UnitView) {
    const moving = view.vx * view.vx + view.vy * view.vy > MOVING_SPEED_THRESHOLD_SQUARED;
    const hasAttachment = this.selected.has(key) || this.hpBars.has(key);

    if (moving || hasAttachment) {
      this.projectableEntities.add(key);
      return;
    }

    this.projectableEntities.delete(key);
    if (view.renderX === view.x && view.renderY === view.y) return;

    view.renderX = view.x;
    view.renderY = view.y;
    view.sprite.setPosition(view.x, view.y);
  }

  private cleanupMissing() {
    for (const [key, view] of this.sprites) {
      if (this.liveEntities.has(key)) continue;
      this.releaseSprite(view);
      this.sprites.delete(key);
      this.projectableEntities.delete(key);
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

class ProjectileSpriteRenderer {
  private readonly sprites = new Map<number, ProjectileSpriteView>();
  private readonly spritePool: PhaserImage[] = [];
  private readonly liveProjectiles = new Set<number>();
  private readonly projectileDots: PhaserGraphics;
  private projectileSpriteStride = 1;
  private projectileDotStride = 1;

  constructor(
    private readonly scene: import("phaser").Scene,
    private readonly manager: AppStore,
  ) {
    this.projectileDots = scene.add.graphics().setDepth(6).setVisible(false);
  }

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    for (const sprite of this.spritePool) sprite.destroy();
    this.projectileDots.clear().setVisible(false);
    this.sprites.clear();
    this.spritePool.length = 0;
    this.liveProjectiles.clear();
    this.projectileSpriteStride = 1;
    this.projectileDotStride = 1;
  }

  sync() {
    const projectiles = readProjectileView(this.manager);
    const count = projectiles.readCount();
    const bounds = renderBoundsForScene(this.scene);
    const x = projectiles.readX();
    const y = projectiles.readY();
    const vx = projectiles.readVx();
    const vy = projectiles.readVy();
    const radius = projectiles.readRadius();
    const dotMode = this.renderMode() === "dot";
    const visibleProjectiles = this.countVisibleProjectiles(count, x, y, radius, bounds);

    if (dotMode) {
      this.projectileDotStride = nextStableStride(
        visibleProjectiles,
        MAX_VISIBLE_PROJECTILE_DOTS,
        this.projectileDotStride,
      );
      this.syncProjectileDots(count, x, y, radius, bounds);
      this.liveProjectiles.clear();
      this.cleanupMissing();
      return;
    }

    this.projectileDots.clear().setVisible(false);
    this.projectileSpriteStride = nextStableStride(
      visibleProjectiles,
      MAX_VISIBLE_PROJECTILE_SPRITES,
      this.projectileSpriteStride,
    );
    this.liveProjectiles.clear();

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (!pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) continue;
      if (this.projectileSpriteStride > 1 && index % this.projectileSpriteStride !== 0) continue;

      this.liveProjectiles.add(index);
      this.syncProjectile(index, x, y, vx, vy, projectileRadius);
    }

    this.cleanupMissing();
  }

  private renderMode(): RenderMode {
    return this.scene.cameras.main.zoom <= UNIT_DOT_LOD_MAX_ZOOM ? "dot" : "sprite";
  }

  private countVisibleProjectiles(
    count: number,
    x: Float32Array,
    y: Float32Array,
    radius: Float32Array,
    bounds: RenderBounds,
  ) {
    let visible = 0;

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) visible += 1;
    }

    return visible;
  }

  private syncProjectileDots(
    count: number,
    x: Float32Array,
    y: Float32Array,
    radius: Float32Array,
    bounds: RenderBounds,
  ) {
    const zoom = Math.max(0.001, this.scene.cameras.main.zoom);
    const dotSize = clampValue(PROJECTILE_DOT_SCREEN_SIZE / zoom, DOT_MIN_WORLD_SIZE, DOT_MAX_WORLD_SIZE);
    const half = dotSize / 2;

    this.projectileDots.clear().setVisible(true).fillStyle(0xcffff0, 0.9);

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (!pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) continue;
      if (this.projectileDotStride > 1 && index % this.projectileDotStride !== 0) continue;

      this.projectileDots.fillRect(x[index] - half, y[index] - half, dotSize, dotSize);
    }
  }

  project(extrapolationMs: number) {
    const dt = visualStepSeconds(extrapolationMs);

    for (const view of this.sprites.values()) {
      const x = view.x + view.vx * dt;
      const y = view.y + view.vy * dt;

      if (view.renderX === x && view.renderY === y) continue;

      view.renderX = x;
      view.renderY = y;
      view.sprite.setPosition(x, y);
    }
  }

  private syncProjectile(
    index: number,
    x: Float32Array,
    y: Float32Array,
    vx: Float32Array,
    vy: Float32Array,
    radius: number,
  ) {
    const rotation = Math.atan2(vy[index], vx[index]);
    const view = this.sprites.get(index) ?? this.createProjectileView(index, x[index], y[index], radius, rotation);

    if (view.x !== x[index] || view.y !== y[index]) {
      view.x = x[index];
      view.y = y[index];
    }

    if (view.vx !== vx[index] || view.vy !== vy[index]) {
      view.vx = vx[index];
      view.vy = vy[index];
    }

    if (view.rotation !== rotation) {
      view.rotation = rotation;
      view.sprite.setRotation(rotation);
    }

    if (view.radius !== radius) {
      view.radius = radius;
      view.sprite.setDisplaySize(radius * 2, radius * 2);
    }
  }

  private createProjectileView(index: number, x: number, y: number, radius: number, rotation: number) {
    const sprite =
      this.spritePool.pop() ??
      this.scene.add.image(x, y, TEXTURES.projectile).setOrigin(0.5, 0.5).setDepth(6).setRotation(rotation);

    sprite
      .setVisible(true)
      .setPosition(x, y)
      .setDepth(6)
      .setDisplaySize(radius * 2, radius * 2)
      .setRotation(rotation);

    const view: ProjectileSpriteView = {
      radius,
      renderX: x,
      renderY: y,
      rotation,
      sprite,
      vx: 0,
      vy: 0,
      x,
      y,
    };

    this.sprites.set(index, view);
    return view;
  }

  private cleanupMissing() {
    for (const [key, view] of this.sprites) {
      if (this.liveProjectiles.has(key)) continue;
      view.sprite.setVisible(false);
      this.spritePool.push(view.sprite);
      this.sprites.delete(key);
    }
  }
}

// Эффекты попадания: расширяющееся кольцо и вспышка в центре AOE плюс короткая
// искра на каждом задетом враге. События сливаются из пула снарядов раз в кадр,
// спрайты переиспользуются через пул по текстуре, число и время жизни ограничены.
class ImpactEffectRenderer {
  private readonly active: SpriteEffect[] = [];
  private readonly pools = new Map<string, PhaserImage[]>();

  constructor(private readonly scene: import("phaser").Scene) {}

  reset() {
    for (const effect of this.active) effect.sprite.destroy();
    for (const pool of this.pools.values()) for (const sprite of pool) sprite.destroy();
    this.active.length = 0;
    this.pools.clear();
  }

  consume(projectiles: ProjectileView) {
    const bounds = renderBoundsForScene(this.scene);
    this.spawnImpacts(projectiles, bounds);
    this.spawnHits(projectiles, bounds);
    projectiles.clearEffectEvents();
  }

  update(deltaMs: number) {
    if (this.active.length === 0) return;

    const dt = Math.max(0, deltaMs);
    let index = 0;

    while (index < this.active.length) {
      const effect = this.active[index];
      effect.ageMs += dt;
      const t = effect.lifeMs > 0 ? Math.min(1, effect.ageMs / effect.lifeMs) : 1;

      if (t >= 1) {
        this.release(effect);
        const last = this.active.length - 1;
        this.active[index] = this.active[last];
        this.active.pop();
        continue;
      }

      const grow = 1 - (1 - t) * (1 - t) * (1 - t);
      const diameter = effect.startDiameter + (effect.endDiameter - effect.startDiameter) * grow;
      effect.sprite.setDisplaySize(diameter, diameter);
      effect.sprite.setAlpha(effect.startAlpha * (1 - t));
      if (effect.spinRate !== 0) effect.sprite.setRotation(effect.sprite.rotation + effect.spinRate * dt);
      index += 1;
    }
  }

  private spawnImpacts(projectiles: ProjectileView, bounds: RenderBounds) {
    const count = Math.min(projectiles.readImpactEventCount(), MAX_IMPACT_EVENTS_PER_FRAME);
    const x = projectiles.readImpactEventX();
    const y = projectiles.readImpactEventY();
    const radius = projectiles.readImpactEventRadius();

    for (let index = 0; index < count; index += 1) {
      const worldRadius = Math.max(IMPACT_MIN_RADIUS, radius[index]);
      if (!pointIntersectsBounds(x[index], y[index], worldRadius, bounds)) continue;

      this.spawn({
        textureKey: TEXTURES.impactRing,
        x: x[index],
        y: y[index],
        lifeMs: IMPACT_RING_LIFE_MS,
        startDiameter: worldRadius * 0.7,
        endDiameter: worldRadius * 2.3,
        startAlpha: 0.9,
        spinRate: 0,
        depth: IMPACT_RING_DEPTH,
      });
      this.spawn({
        textureKey: TEXTURES.impactGlow,
        x: x[index],
        y: y[index],
        lifeMs: IMPACT_FLASH_LIFE_MS,
        startDiameter: worldRadius * 0.5,
        endDiameter: worldRadius * 1.5,
        startAlpha: 0.85,
        spinRate: 0,
        depth: IMPACT_RING_DEPTH,
      });
    }
  }

  private spawnHits(projectiles: ProjectileView, bounds: RenderBounds) {
    const count = Math.min(projectiles.readHitEventCount(), MAX_HIT_EVENTS_PER_FRAME);
    const x = projectiles.readHitEventX();
    const y = projectiles.readHitEventY();

    for (let index = 0; index < count; index += 1) {
      if (!pointIntersectsBounds(x[index], y[index], HIT_SPARK_MAX_DIAMETER, bounds)) continue;

      const jitter = 0.8 + Math.random() * 0.5;
      this.spawn({
        textureKey: TEXTURES.impactGlow,
        x: x[index],
        y: y[index],
        lifeMs: HIT_SPARK_LIFE_MS,
        startDiameter: 8 * jitter,
        endDiameter: 30 * jitter,
        startAlpha: 0.9,
        spinRate: (Math.random() - 0.5) * 0.02,
        depth: HIT_SPARK_DEPTH,
      });
    }
  }

  private spawn(config: SpriteEffectSpawn) {
    if (this.active.length >= MAX_ACTIVE_EFFECTS) return;

    const sprite = this.acquire(config.textureKey);
    sprite.setPosition(config.x, config.y);
    sprite.setDepth(config.depth);
    sprite.setRotation(config.spinRate !== 0 ? Math.random() * Math.PI * 2 : 0);
    sprite.setAlpha(config.startAlpha);
    sprite.setDisplaySize(config.startDiameter, config.startDiameter);

    this.active.push({
      sprite,
      textureKey: config.textureKey,
      ageMs: 0,
      lifeMs: config.lifeMs,
      startDiameter: config.startDiameter,
      endDiameter: config.endDiameter,
      startAlpha: config.startAlpha,
      spinRate: config.spinRate,
    });
  }

  private acquire(textureKey: string) {
    const reused = this.pools.get(textureKey)?.pop();
    if (reused) return reused.setVisible(true);

    return this.scene.add.image(0, 0, textureKey).setOrigin(0.5, 0.5);
  }

  private release(effect: SpriteEffect) {
    effect.sprite.setVisible(false);
    const pool = this.pools.get(effect.textureKey);
    if (pool) pool.push(effect.sprite);
    else this.pools.set(effect.textureKey, [effect.sprite]);
  }
}

const findUnitAt = (
  units: UnitViews,
  point: Point,
  options: { faction?: number; radiusMultiplier?: number; minimumRadius?: number } = {},
) => {
  let nearest: EntityIndex | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;
    if (options.faction !== undefined && units.identity.faction[entity] !== options.faction) continue;

    const hitRadius = Math.max(
      options.minimumRadius ?? 0,
      Math.max(units.identity.radius[entity], displaySizeForKind(units.identity.kind[entity]) * 0.5) *
        (options.radiusMultiplier ?? 1),
    );
    const distance = squaredDistance(point, { x: units.movement.x[entity], y: units.movement.y[entity] });

    if (distance > hitRadius * hitRadius || distance >= nearestDistance) continue;

    nearest = entity;
    nearestDistance = distance;
  }

  return nearest;
};

const hasSelectedPlayerUnits = (units: UnitViews) => {
  for (let index = 0; index < units.capacity; index += 1) {
    const entity = index as EntityIndex;
    if (!isUnitAlive(units.health, entity)) continue;
    if (units.identity.faction[entity] === UNIT_FACTION.PLAYER && unitSelected(units, entity) === 1) return true;
  }

  return false;
};

const readRtsSpatialMetrics = (manager: AppStore) => manager.entities().get("rtsSpatialIndex").index.readMetrics();

export const createEntitiesRtsScene = (Phaser: PhaserApi, manager: AppStore, metrics: MetricsAdapter) =>
  class EntitiesRtsScene extends Phaser.Scene {
    private unitRenderer?: UnitSpriteRenderer;
    private projectileRenderer?: ProjectileSpriteRenderer;
    private impactEffects?: ImpactEffectRenderer;
    private selectionGraphics?: PhaserGraphics;
    private drag: DragState | null = null;
    private cameraViewport = { width: 0, height: 0 };
    private baseZoom = 1;
    private minZoom = 1;
    private maxZoom = 1;
    private zoomMultiplier = 1;
    private startupCenterFrames = 8;
    private renderDirty = true;
    private lastSyncedSessionState: string | null = null;
    private simulationAccumulatorMs = 0;
    private simulationNowMs = 0;
    private readonly pressedCameraKeys = new Set<string>();

    private readonly handleCameraZoomCommand = (event: Event) => {
      const action = (event as CustomEvent<{ action?: RtsCameraZoomAction }>).detail?.action;

      if (action === "in") this.zoomCamera(1);
      if (action === "out") this.zoomCamera(-1);
      if (action === "reset") this.resetCameraZoom();
    };

    private readonly handleWindowKeyDown = (event: KeyboardEvent) => {
      if (keyboardTargetIsEditable(event.target)) return;

      if (manager.getState().gameSession.state === "SPAWNING") return;

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
      this.fitCameraToMap();
      this.input.mouse?.disableContextMenu();
      window.addEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
      window.addEventListener("keydown", this.handleWindowKeyDown);
      window.addEventListener("keyup", this.handleWindowKeyUp);
      window.addEventListener("blur", this.handleWindowBlur);

      this.drawMap();
      this.selectionGraphics = this.add.graphics().setDepth(20);
      this.unitRenderer = new UnitSpriteRenderer(this, manager);
      this.projectileRenderer = new ProjectileSpriteRenderer(this, manager);
      this.impactEffects = new ImpactEffectRenderer(this);
      this.events.once("shutdown", () => {
        window.removeEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
        window.removeEventListener("keydown", this.handleWindowKeyDown);
        window.removeEventListener("keyup", this.handleWindowKeyUp);
        window.removeEventListener("blur", this.handleWindowBlur);
        this.pressedCameraKeys.clear();
        this.unitRenderer?.reset();
        this.projectileRenderer?.reset();
        this.impactEffects?.reset();
      });
      this.unitRenderer.sync();
      this.projectileRenderer.sync();
      this.bindInput();
    }

    update(_time: number, delta: number) {
      if (this.fitCameraToMap()) this.renderDirty = true;

      const frameDeltaMs = Math.max(0, delta);
      const simulationDeltaMs = Math.min(MAX_SIMULATION_FRAME_DELTA_MS, frameDeltaMs);
      const sessionState = manager.getState().gameSession.state;
      if (sessionState !== "SPAWNING" && this.panCameraFromKeyboard(frameDeltaMs)) this.renderDirty = true;
      metrics.recordFrame(frameDeltaMs);

      let simulationSteps = 0;
      if (sessionState === "READY") {
        simulationSteps = this.runFixedSimulation(simulationDeltaMs, "TICK");
      } else if (sessionState === "SPAWNING") {
        simulationSteps = this.runFixedSimulation(simulationDeltaMs, "SPAWN_TICK");
      } else {
        this.simulationAccumulatorMs = 0;
      }

      if (simulationSteps > 0) this.renderDirty = true;

      if (this.startupCenterFrames > 0) {
        this.centerCameraOnMap();
        this.startupCenterFrames -= 1;
        this.renderDirty = true;
      }

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
        this.simulationAccumulatorMs -= FIXED_SIMULATION_STEP_MS;
        this.simulationNowMs += FIXED_SIMULATION_STEP_MS;

        const tickStartedAt = metrics.now();
        manager.transition({
          type: actionType,
          payload: { now: this.simulationNowMs, deltaMs: FIXED_SIMULATION_STEP_MS },
        });
        metrics.recordTickMs(metrics.now() - tickStartedAt);
        if (actionType === "TICK") metrics.recordSimulationMetrics(readRtsSpatialMetrics(manager));

        steps += 1;
      }

      if (steps === maxSteps) this.simulationAccumulatorMs = 0;
      return steps;
    }

    private fitCameraToMap() {
      const camera = this.cameras.main;
      const width = Math.max(1, Math.floor(this.scale.gameSize.width || camera.width));
      const height = Math.max(1, Math.floor(this.scale.gameSize.height || camera.height));
      if (this.cameraViewport.width === width && this.cameraViewport.height === height) return false;

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
      return true;
    }

    private zoomCamera(direction: -1 | 1, pointer?: PhaserPointer) {
      const camera = this.cameras.main;
      const anchorBefore = pointer ? cameraWorldPointForScreen(camera, pointer.x, pointer.y) : null;
      const zoomFactor = direction > 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP;

      this.startupCenterFrames = 0;
      this.zoomMultiplier = clampValue(
        this.zoomMultiplier * zoomFactor,
        this.minZoom / this.baseZoom,
        CAMERA_MAX_ZOOM_MULTIPLIER,
      );
      camera.setZoom(clampValue(this.baseZoom * this.zoomMultiplier, this.minZoom, this.maxZoom));
      this.renderDirty = true;

      if (pointer && anchorBefore) {
        setCameraScrollForScreenWorldPoint(camera, pointer.x, pointer.y, anchorBefore);
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
      this.renderDirty = true;
    }

    private centerCameraOnMap() {
      const camera = this.cameras.main;

      camera.centerOn(RTS_MAP.centerX, RTS_MAP.centerY);
      this.clampCameraScroll();
      this.renderDirty = true;
    }

    private clampCameraScroll() {
      const camera = this.cameras.main;
      camera.scrollX = camera.clampX(camera.scrollX);
      camera.scrollY = camera.clampY(camera.scrollY);
    }

    private panCameraFromKeyboard(deltaMs: number) {
      const x = Number(this.pressedCameraKeys.has("KeyD")) - Number(this.pressedCameraKeys.has("KeyA"));
      const y = Number(this.pressedCameraKeys.has("KeyS")) - Number(this.pressedCameraKeys.has("KeyW"));
      if (x === 0 && y === 0) return false;

      const camera = this.cameras.main;
      if (!camera) return false;

      const distance = (CAMERA_KEYBOARD_PAN_SPEED * deltaMs) / 1_000 / camera.zoom;

      this.panCameraByKeyboardVector(x, y, distance);
      return true;
    }

    private panCameraByKeyboardVector(x: number, y: number, distance: number) {
      const diagonalScale = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;

      this.startupCenterFrames = 0;
      const camera = this.cameras.main;
      camera.scrollX += x * distance * diagonalScale;
      camera.scrollY += y * distance * diagonalScale;
      this.clampCameraScroll();
      this.renderDirty = true;
    }

    private drawMap() {
      this.add.tileSprite(0, 0, RTS_MAP.width, RTS_MAP.height, TEXTURES.ground).setOrigin(0, 0).setDepth(-2);

      const grid = this.add.graphics().setDepth(-1);
      const drawVerticalGridLine = (x: number, width: number) => {
        const left = clampValue(x - width / 2, 0, RTS_MAP.width - width);
        grid.fillRect(left, 0, width, RTS_MAP.height);
      };
      const drawHorizontalGridLine = (y: number, width: number) => {
        const top = clampValue(y - width / 2, 0, RTS_MAP.height - width);
        grid.fillRect(0, top, RTS_MAP.width, width);
      };

      grid.fillStyle(0x2a3d32, 0.38);
      for (let x = 0; x <= RTS_MAP.width; x += MAP_GRID_MINOR_STEP) drawVerticalGridLine(x, MAP_GRID_MINOR_WIDTH);
      for (let y = 0; y <= RTS_MAP.height; y += MAP_GRID_MINOR_STEP) drawHorizontalGridLine(y, MAP_GRID_MINOR_WIDTH);

      grid.fillStyle(0x5a7862, 0.5);
      for (let x = 0; x <= RTS_MAP.width; x += MAP_GRID_MAJOR_STEP) drawVerticalGridLine(x, MAP_GRID_MAJOR_WIDTH);
      for (let y = 0; y <= RTS_MAP.height; y += MAP_GRID_MAJOR_STEP) drawHorizontalGridLine(y, MAP_GRID_MAJOR_WIDTH);

      this.scatterProps();

      grid.fillStyle(0x314231, 0.7);
      grid.fillRect(RTS_MAP.centerX - 84, RTS_MAP.centerY - 84, 168, 168);
      grid.lineStyle(6, 0xf6e27a, 0.72);
      grid.strokeRect(RTS_MAP.centerX - 92, RTS_MAP.centerY - 92, 184, 184);
      grid.lineStyle(10, 0xff6f61, 0.24);
      grid.strokeRect(80, 80, RTS_MAP.width - 160, RTS_MAP.height - 160);
    }

    private scatterProps() {
      const random = createSeededRandom("rts-props-v1");
      const margin = 160;
      const span = RTS_MAP.width - margin * 2;

      for (let index = 0; index < 260; index += 1) {
        const x = margin + random() * span;
        const y = margin + random() * span;
        const nearBase = Math.abs(x - RTS_MAP.centerX) < 220 && Math.abs(y - RTS_MAP.centerY) < 220;
        if (nearBase) continue;

        const texture = random() > 0.5 ? TEXTURES.tuft : TEXTURES.rock;
        this.add
          .image(x, y, texture)
          .setDepth(1)
          .setScale(1.6 + random() * 2)
          .setAlpha(0.9);
      }
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
          this.renderDirty = true;
          return;
        }

        this.issueLeftClick(drag.current);
      });
    }

    private issueLeftClick(point: Point) {
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
      const units = readUnitViews(manager);
      const enemy = findUnitAt(units, point, {
        faction: UNIT_FACTION.ENEMY,
        radiusMultiplier: 1.8,
        minimumRadius: ATTACK_MOVE_RADIUS,
      });

      manager.transition({ type: enemy === null ? "ISSUE_MOVE" : "ISSUE_ATTACK_MOVE", payload: point });
      this.renderDirty = true;
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
