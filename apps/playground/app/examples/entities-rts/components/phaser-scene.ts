import type { EntityIndex } from "@lite-fsm/entities";

import type { AppStore } from "../store";
import { isUnitAlive } from "../store/machines/unit-health";
import type { MetricsAdapter } from "../store/metrics";
import {
  entityIdForUnitIndex,
  readProjectileView,
  readUnitViews,
  unitSelected,
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
const PROJECTILE_RENDER_RADIUS = 12;
const MOVING_SPEED_THRESHOLD_SQUARED = 1;

type DragState = {
  start: Point;
  current: Point;
};

type UnitView = {
  sprite: PhaserImage;
  x: number;
  y: number;
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

type RenderPlan = {
  bounds: RenderBounds;
  enemyStride: number;
};

type ProjectileSpriteView = {
  sprite: PhaserImage;
  x: number;
  y: number;
  rotation: number;
  radius: number;
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
  const camera = scene.cameras.main;
  const worldView = camera.worldView;

  return {
    left: worldView.x - RENDER_CULL_MARGIN,
    right: worldView.right + RENDER_CULL_MARGIN,
    top: worldView.y - RENDER_CULL_MARGIN,
    bottom: worldView.bottom + RENDER_CULL_MARGIN,
  };
};

const pointIntersectsBounds = (x: number, y: number, radius: number, bounds: RenderBounds) =>
  x + radius >= bounds.left && x - radius <= bounds.right && y + radius >= bounds.top && y - radius <= bounds.bottom;

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
};

class UnitSpriteRenderer {
  private readonly sprites = new Map<number, UnitView>();
  private readonly selected = new Map<number, PhaserImage>();
  private readonly hpBars = new Map<number, HpBarView>();
  private readonly liveEntities = new Set<number>();
  private loadingSyncCursor = 0;
  private animTimeMs = 0;

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
    this.loadingSyncCursor = 0;
  }

  sync() {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    this.liveEntities.clear();
    this.loadingSyncCursor = units.capacity;

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (!this.unitShouldRender(units, entity, plan)) continue;

      this.liveEntities.add(index);
      this.syncUnit(units, entity);
    }

    this.cleanupMissing();
  }

  syncLoading(maxCreates: number) {
    const units = readUnitViews(this.manager);
    const plan = this.createRenderPlan(units);
    this.animTimeMs = this.scene.time.now;
    const capacity = units.capacity;
    let created = 0;
    let index = Math.min(this.loadingSyncCursor, capacity);

    while (index < capacity && created < maxCreates) {
      const entity = index as EntityIndex;
      const shouldCreate =
        isUnitAlive(units.health, entity) && this.unitShouldRender(units, entity, plan) && !this.sprites.has(index);

      if (shouldCreate) {
        this.syncUnit(units, entity);
        created += 1;
      }

      index += 1;
    }

    this.loadingSyncCursor = index;
  }

  private createRenderPlan(units: UnitViews): RenderPlan {
    const bounds = this.renderBounds();
    let visibleEnemies = 0;

    for (let index = 0; index < units.capacity; index += 1) {
      const entity = index as EntityIndex;
      if (!isUnitAlive(units.health, entity)) continue;
      if (units.identity.faction[entity] !== UNIT_FACTION.ENEMY) continue;
      if (!this.unitIntersectsBounds(units, entity, bounds)) continue;

      visibleEnemies += 1;
    }

    return {
      bounds,
      enemyStride:
        visibleEnemies > MAX_VISIBLE_ENEMY_SPRITES ? Math.ceil(visibleEnemies / MAX_VISIBLE_ENEMY_SPRITES) : 1,
    };
  }

  private renderBounds(): RenderBounds {
    return renderBoundsForScene(this.scene);
  }

  private unitShouldRender(units: UnitViews, entity: EntityIndex, plan: RenderPlan) {
    if (!this.unitIntersectsBounds(units, entity, plan.bounds)) return false;
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
    const view = this.sprites.get(key) ?? this.createUnitView(key, units, entity, kind, texture);
    const hp = units.health.hp[entity];
    const maxHp = units.health.maxHp[entity];
    let hpRate = view.hpRate;

    if (view.x !== x || view.y !== y) {
      view.x = x;
      view.y = y;
      view.sprite.setPosition(x, y);
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

    this.syncAnimation(view, units, entity, kind);

    if (kind === UNIT_KIND.ENEMY && hpRate >= 1) return;

    const selected = unitSelected(units, entity);
    this.syncSelection(units, entity, size, kind, selected);
    this.syncHpBar(units, entity, size, kind, hpRate);
  }

  private createUnitView(key: number, units: UnitViews, entity: EntityIndex, kind: number, texture: string) {
    const x = units.movement.x[entity];
    const y = units.movement.y[entity];
    const display = spriteDisplaySize(kind);
    const view: UnitView = {
      frame: 0,
      hp: -1,
      hpRate: -1,
      kind,
      maxHp: -1,
      sprite: this.scene.add
        .image(x, y, texture, 0)
        .setOrigin(0.5, 0.5)
        .setDepth(depthForKind(kind))
        .setDisplaySize(display.width, display.height),
      x,
      y,
    };

    this.sprites.set(key, view);
    return view;
  }

  private syncAnimation(view: UnitView, units: UnitViews, entity: EntityIndex, kind: number) {
    const anim = spriteAnimForKind(kind);
    const vx = units.movement.vx[entity];
    const vy = units.movement.vy[entity];
    const moving = vx * vx + vy * vy > MOVING_SPEED_THRESHOLD_SQUARED;
    const frame = moving
      ? animationFrameIndex(this.animTimeMs, anim.frameDurationMs, anim.frameCount, Number(entity) % anim.frameCount)
      : 0;

    if (view.frame === frame) return;
    view.frame = frame;
    view.sprite.setFrame(frame);
  }

  private syncSelection(units: UnitViews, entity: EntityIndex, size: number, kind: number, selected: number) {
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
        .image(units.movement.x[entity], units.movement.y[entity], TEXTURES.selected)
        .setOrigin(0.5, 0.5)
        .setDepth(SELECTION_DEPTH);

    this.selected.set(key, highlight);
    highlight.setPosition(units.movement.x[entity], units.movement.y[entity]);
    highlight.setDisplaySize(spriteDisplaySize(kind).width + SELECTION_PADDING, size + SELECTION_PADDING);
    highlight.setAlpha(selected === UNIT_SELECTION.SELECTED ? 0.9 : 0.34);
  }

  private syncHpBar(units: UnitViews, entity: EntityIndex, size: number, kind: number, hpRate: number) {
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
    const y = units.movement.y[entity] - size / 2 - HP_BAR_GAP;
    const bar =
      this.hpBars.get(key) ??
      ({
        bg: this.scene.add.image(units.movement.x[entity], y, TEXTURES.hpBg).setOrigin(0.5, 0.5).setDepth(8),
        fill: this.scene.add
          .image(units.movement.x[entity] - width / 2, y, TEXTURES.hpFill)
          .setOrigin(0, 0.5)
          .setDepth(9),
      } satisfies HpBarView);

    this.hpBars.set(key, bar);
    bar.bg.setPosition(units.movement.x[entity], y);
    bar.bg.setDisplaySize(width + HP_BAR_HORIZONTAL_PADDING, HP_BAR_BG_HEIGHT);
    bar.fill.setPosition(units.movement.x[entity] - width / 2, y);
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

class ProjectileSpriteRenderer {
  private readonly sprites = new Map<number, ProjectileSpriteView>();
  private readonly liveProjectiles = new Set<number>();

  constructor(
    private readonly scene: import("phaser").Scene,
    private readonly manager: AppStore,
  ) {}

  reset() {
    for (const view of this.sprites.values()) view.sprite.destroy();
    this.sprites.clear();
    this.liveProjectiles.clear();
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

    this.liveProjectiles.clear();

    for (let index = 0; index < count; index += 1) {
      const projectileRadius = Math.max(PROJECTILE_RENDER_RADIUS, radius[index] * 1.6);
      if (!pointIntersectsBounds(x[index], y[index], projectileRadius, bounds)) continue;

      this.liveProjectiles.add(index);
      this.syncProjectile(index, x, y, vx, vy, projectileRadius);
    }

    this.cleanupMissing();
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
      view.sprite.setPosition(x[index], y[index]);
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
    const view: ProjectileSpriteView = {
      radius,
      rotation,
      sprite: this.scene.add
        .image(x, y, TEXTURES.projectile)
        .setOrigin(0.5, 0.5)
        .setDepth(6)
        .setDisplaySize(radius * 2, radius * 2)
        .setRotation(rotation),
      x,
      y,
    };

    this.sprites.set(index, view);
    return view;
  }

  private cleanupMissing() {
    for (const [key, view] of this.sprites) {
      if (this.liveProjectiles.has(key)) continue;
      view.sprite.destroy();
      this.sprites.delete(key);
    }
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
      this.events.once("shutdown", () => {
        window.removeEventListener(RTS_CAMERA_ZOOM_EVENT, this.handleCameraZoomCommand);
        window.removeEventListener("keydown", this.handleWindowKeyDown);
        window.removeEventListener("keyup", this.handleWindowKeyUp);
        window.removeEventListener("blur", this.handleWindowBlur);
        this.pressedCameraKeys.clear();
        this.unitRenderer?.reset();
        this.projectileRenderer?.reset();
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
      const anchorBefore = pointer ? (pointer.positionToCamera(camera) as Point) : null;
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
