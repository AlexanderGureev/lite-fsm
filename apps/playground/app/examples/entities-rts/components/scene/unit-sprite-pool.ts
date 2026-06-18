import type { PhaserImage, PhaserScene } from "./phaser-types";
import { depthForKind, textureForKind } from "./unit-kind";

export class UnitSpritePool {
  private readonly pools = new Map<string, PhaserImage[]>();

  constructor(private readonly scene: PhaserScene) {}

  reset() {
    for (const pool of this.pools.values()) {
      for (const sprite of pool) sprite.destroy();
    }

    this.pools.clear();
  }

  acquire(texture: string, kind: number, x: number, y: number) {
    const pooled = this.pools.get(texture)?.pop();
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

  release(kind: number, sprite: PhaserImage) {
    const texture = textureForKind(kind);
    sprite.setVisible(false);

    const pool = this.pools.get(texture);
    if (pool) pool.push(sprite);
    else this.pools.set(texture, [sprite]);
  }
}
