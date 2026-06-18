import type { EntityIndex } from "@lite-fsm/entities";

import { UNIT_KIND, UNIT_SELECTION } from "../../store/unit-model";

import {
  HP_BAR_BG_HEIGHT,
  HP_BAR_FILL_HEIGHT,
  HP_BAR_GAP,
  HP_BAR_HORIZONTAL_PADDING,
  HP_BAR_MIN_WIDTH,
  SELECTION_DEPTH,
  SELECTION_PADDING,
  TEXTURES,
} from "./constants";
import type { PhaserImage, PhaserScene } from "./phaser-types";
import { displaySizeForKind, spriteDisplaySize } from "./unit-kind";

type HpBarView = {
  bg: PhaserImage;
  fill: PhaserImage;
};

export class UnitAttachments {
  private readonly selected = new Map<number, PhaserImage>();
  private readonly hpBars = new Map<number, HpBarView>();

  constructor(private readonly scene: PhaserScene) {}

  reset() {
    for (const view of this.selected.values()) view.destroy();
    for (const view of this.hpBars.values()) {
      view.bg.destroy();
      view.fill.destroy();
    }

    this.selected.clear();
    this.hpBars.clear();
  }

  has(key: number) {
    return this.selected.has(key) || this.hpBars.has(key);
  }

  syncSelection(entity: EntityIndex, x: number, y: number, size: number, kind: number, selected: number) {
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
      this.scene.add.image(x, y, TEXTURES.selected).setOrigin(0.5, 0.5).setDepth(SELECTION_DEPTH);

    this.selected.set(key, highlight);
    highlight.setPosition(x, y);
    highlight.setDisplaySize(spriteDisplaySize(kind).width + SELECTION_PADDING, size + SELECTION_PADDING);
    highlight.setAlpha(selected === UNIT_SELECTION.SELECTED ? 0.9 : 0.34);
  }

  syncHpBar(entity: EntityIndex, x: number, y: number, size: number, kind: number, hpRate: number) {
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
    const barY = y - size / 2 - HP_BAR_GAP;
    const bar =
      this.hpBars.get(key) ??
      ({
        bg: this.scene.add.image(x, barY, TEXTURES.hpBg).setOrigin(0.5, 0.5).setDepth(8),
        fill: this.scene.add.image(x - width / 2, barY, TEXTURES.hpFill).setOrigin(0, 0.5).setDepth(9),
      } satisfies HpBarView);

    this.hpBars.set(key, bar);
    bar.bg.setPosition(x, barY);
    bar.bg.setDisplaySize(width + HP_BAR_HORIZONTAL_PADDING, HP_BAR_BG_HEIGHT);
    bar.fill.setPosition(x - width / 2, barY);
    bar.fill.setDisplaySize(Math.max(1, width * hpRate), HP_BAR_FILL_HEIGHT);
  }

  syncProjected(key: number, x: number, y: number, kind: number) {
    const selected = this.selected.get(key);
    if (selected) selected.setPosition(x, y);

    const bar = this.hpBars.get(key);
    if (!bar) return;

    const size = displaySizeForKind(kind);
    const width = Math.max(HP_BAR_MIN_WIDTH, spriteDisplaySize(kind).width);
    const barY = y - size / 2 - HP_BAR_GAP;
    bar.bg.setPosition(x, barY);
    bar.fill.setPosition(x - width / 2, barY);
  }

  cleanupMissing(liveEntities: ReadonlySet<number>) {
    for (const [key, view] of this.selected) {
      if (liveEntities.has(key)) continue;
      view.destroy();
      this.selected.delete(key);
    }

    for (const [key, view] of this.hpBars) {
      if (liveEntities.has(key)) continue;
      view.bg.destroy();
      view.fill.destroy();
      this.hpBars.delete(key);
    }
  }
}
