import { createSeededRandom } from "../../store/spawn/random";

import { TEXTURES } from "./constants";
import type { PhaserScene } from "./phaser-types";

const addGeneratedTexture = (
  scene: PhaserScene,
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
  scene: PhaserScene,
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

const addGroundTexture = (scene: PhaserScene, key: string) => {
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

const addRingTexture = (scene: PhaserScene, key: string, size: number, lineWidth: number, color: string) => {
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
  scene: PhaserScene,
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

export const ensureGeneratedTextures = (scene: PhaserScene) => {
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
