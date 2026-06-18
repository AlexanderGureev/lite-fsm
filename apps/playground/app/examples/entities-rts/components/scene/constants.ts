export const RTS_CANVAS = {
  width: 1280,
  height: 720,
} as const;

export const RTS_CAMERA_ZOOM_EVENT = "entities-rts-camera-zoom";
export const RTS_RENDER_DEBUG_TOGGLE_KEY = "k";

export type RtsCameraZoomAction = "in" | "out" | "reset";

export const TEXTURES = {
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

// Ввод и камера.
export const CLICK_DRAG_THRESHOLD = 12;
export const ATTACK_MOVE_RADIUS = 96;
export const CAMERA_ZOOM_STEP = 1.18;
export const CAMERA_MAX_ZOOM_MULTIPLIER = 3;
export const CAMERA_INITIAL_VIEW_WIDTH = 4_096;
export const CAMERA_KEYBOARD_PAN_SPEED = 760;

// Сетка карты.
export const MAP_GRID_MINOR_STEP = 128;
export const MAP_GRID_MAJOR_STEP = 512;
export const MAP_GRID_MINOR_WIDTH = 4;
export const MAP_GRID_MAJOR_WIDTH = 8;

// Полоски здоровья и рамка выделения.
export const HP_BAR_MIN_WIDTH = 18;
export const HP_BAR_BG_HEIGHT = 7;
export const HP_BAR_FILL_HEIGHT = 4;
export const HP_BAR_HORIZONTAL_PADDING = 2;
export const HP_BAR_GAP = 5;
// Рамка выделения уходит под спрайты, чтобы не перекрывать плотные отряды.
export const SELECTION_DEPTH = 2;
export const SELECTION_PADDING = 8;

// Шаг симуляции.
export const SIMULATION_TICK_RATE = 30;
export const FIXED_SIMULATION_STEP_MS = 1_000 / SIMULATION_TICK_RATE;
export const MAX_SIMULATION_FRAME_DELTA_MS = 100;
export const MAX_SIMULATION_STEPS_PER_FRAME = 4;
export const MAX_SPAWN_STEPS_PER_FRAME = 1;
export const SPAWN_RENDER_CREATE_BUDGET = 768;

// Куллинг и уровень детализации (LOD).
export const RENDER_CULL_MARGIN = 256;
export const RENDER_CULL_VIEW_MARGIN_RATIO = 0.18;
export const MAX_VISIBLE_ENEMY_SPRITES = 3_500;
export const MAX_VISIBLE_ENEMY_DOTS = 8_000;
export const UNIT_DOT_LOD_MAX_ZOOM = 0.42;
export const LOD_STRIDE_ENTER_RATIO = 1.12;
export const LOD_STRIDE_EXIT_RATIO = 0.72;
export const MAX_LOD_STRIDE = 16;
export const UNIT_SPRITE_FADE_IN_MS = 140;
export const UNIT_SPRITE_FADE_OUT_MS = 180;
export const RENDER_DEBUG_FLASH_MS = 620;
export const RENDER_DEBUG_SAMPLE_LIMIT = 96;
export const RENDER_DEBUG_UNIT_CHANGE_THRESHOLD = 32;
export const RENDER_DEBUG_VISIBLE_ENEMY_DELTA_THRESHOLD = 256;
export const ALLY_DOT_SCREEN_SIZE = 2.4;
export const ENEMY_DOT_SCREEN_SIZE = 2.1;
export const DOT_MIN_WORLD_SIZE = 7;
export const DOT_MAX_WORLD_SIZE = 18;

// Снаряды.
export const PROJECTILE_RENDER_RADIUS = 12;
export const MAX_VISIBLE_PROJECTILE_SPRITES = 2_500;
export const MAX_VISIBLE_PROJECTILE_DOTS = 6_000;
export const PROJECTILE_DOT_SCREEN_SIZE = 2.4;
export const MOVING_SPEED_THRESHOLD_SQUARED = 1;

// Параметры косметических эффектов попадания. Эффекты живут вне симуляции и
// сливаются из пула снарядов раз в кадр, поэтому ограничены по числу и времени.
export const IMPACT_RING_LIFE_MS = 320;
export const IMPACT_FLASH_LIFE_MS = 220;
export const HIT_SPARK_LIFE_MS = 260;
export const IMPACT_MIN_RADIUS = 26;
export const HIT_SPARK_MAX_DIAMETER = 48;
export const MAX_ACTIVE_EFFECTS = 420;
export const MAX_IMPACT_EVENTS_PER_FRAME = 48;
export const MAX_HIT_EVENTS_PER_FRAME = 180;
export const IMPACT_RING_DEPTH = 6;
export const HIT_SPARK_DEPTH = 7;
