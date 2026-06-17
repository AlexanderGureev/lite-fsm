import { RTS_MAP } from "../../store/spawn/placement";
import { createSeededRandom } from "../../store/spawn/random";

import {
  MAP_GRID_MAJOR_STEP,
  MAP_GRID_MAJOR_WIDTH,
  MAP_GRID_MINOR_STEP,
  MAP_GRID_MINOR_WIDTH,
  TEXTURES,
} from "./constants";
import type { PhaserScene } from "./phaser-types";
import { clampValue } from "./viewport";

const scatterProps = (scene: PhaserScene) => {
  const random = createSeededRandom("rts-props-v1");
  const margin = 160;
  const span = RTS_MAP.width - margin * 2;

  for (let index = 0; index < 260; index += 1) {
    const x = margin + random() * span;
    const y = margin + random() * span;
    const nearBase = Math.abs(x - RTS_MAP.centerX) < 220 && Math.abs(y - RTS_MAP.centerY) < 220;
    if (nearBase) continue;

    const texture = random() > 0.5 ? TEXTURES.tuft : TEXTURES.rock;
    scene.add
      .image(x, y, texture)
      .setDepth(1)
      .setScale(1.6 + random() * 2)
      .setAlpha(0.9);
  }
};

export const drawRtsMap = (scene: PhaserScene) => {
  scene.add.tileSprite(0, 0, RTS_MAP.width, RTS_MAP.height, TEXTURES.ground).setOrigin(0, 0).setDepth(-2);

  const grid = scene.add.graphics().setDepth(-1);
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

  scatterProps(scene);

  grid.fillStyle(0x314231, 0.7);
  grid.fillRect(RTS_MAP.centerX - 84, RTS_MAP.centerY - 84, 168, 168);
  grid.lineStyle(6, 0xf6e27a, 0.72);
  grid.strokeRect(RTS_MAP.centerX - 92, RTS_MAP.centerY - 92, 184, 184);
  grid.lineStyle(10, 0xff6f61, 0.24);
  grid.strokeRect(80, 80, RTS_MAP.width - 160, RTS_MAP.height - 160);
};
