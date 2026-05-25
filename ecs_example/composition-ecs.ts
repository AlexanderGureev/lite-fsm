// @ts-nocheck

/*
 * ECS composition example:
 * a new entity type is a new set of components.
 *
 * Units:
 * - Position + Velocity + Sprite
 *
 * Projectiles:
 * - Position + Velocity + Sprite + Lifetime + DamageOnHit
 *
 * Existing systems automatically pick entities by component set.
 */

export class Position extends Component {
  constructor(
    public x: number,
    public y: number,
  ) {
    super();
  }
}

export class Velocity extends Component {
  constructor(
    public dx: number,
    public dy: number,
  ) {
    super();
  }
}

export class Sprite extends Component {
  constructor(public spriteId: string) {
    super();
  }
}

export class Lifetime extends Component {
  constructor(public ticksLeft: number) {
    super();
  }
}

export class DamageOnHit extends Component {
  constructor(public amount: number) {
    super();
  }
}

export class MoveSystem extends System {
  public componentsRequired = new Set([Position, Velocity]);
  public ecs!: ECS;

  onRegister = (ecs: ECS) => {
    this.ecs = ecs;
  };

  update(entities: Entities) {
    for (const entity of entities) {
      const [position, velocity] = this.ecs.getComponents(entity, Position, Velocity);
      position.x += velocity.dx;
      position.y += velocity.dy;
    }
  }
}

export class SpriteSyncSystem extends System {
  public componentsRequired = new Set([Position, Sprite]);
  public ecs!: ECS;

  constructor(private sprites: SpriteService) {
    super();
  }

  onRegister = (ecs: ECS) => {
    this.ecs = ecs;
  };

  update(entities: Entities) {
    for (const entity of entities) {
      const [position, sprite] = this.ecs.getComponents(entity, Position, Sprite);
      this.sprites.setPosition(sprite.spriteId, {
        x: position.x,
        y: position.y,
      });
    }
  }
}

export class LifetimeSystem extends System {
  public componentsRequired = new Set([Lifetime]);
  public ecs!: ECS;

  onRegister = (ecs: ECS) => {
    this.ecs = ecs;
  };

  update(entities: Entities) {
    for (const entity of entities) {
      const [lifetime] = this.ecs.getComponents(entity, Lifetime);
      lifetime.ticksLeft -= 1;

      if (lifetime.ticksLeft <= 0) {
        this.ecs.removeEntity(entity);
      }
    }
  }
}

const ecs = createECS();
ecs.addSystem(new MoveSystem(), new SpriteSyncSystem(new SpriteService()), new LifetimeSystem());

const unit = ecs.addEntity();
ecs.addComponent(unit, new Position(10, 20), new Velocity(1, 0), new Sprite("unit-sprite-1"));

const projectile = ecs.addEntity();
ecs.addComponent(
  projectile,
  new Position(14, 20),
  new Velocity(3, 0),
  new Sprite("arrow-sprite-1"),
  new Lifetime(40),
  new DamageOnHit(10),
);

ecs.update();
