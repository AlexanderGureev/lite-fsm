type Entity = number;

type Position = {
  x: number;
  y: number;
};

type Velocity = {
  dx: number;
  dy: number;
};

type Sprite = {
  spriteId: string;
};

type Lifetime = {
  ticksLeft: number;
};

type DamageOnHit = {
  amount: number;
};

type EcsWorld = {
  nextEntity: Entity;
  positions: Map<Entity, Position>;
  velocities: Map<Entity, Velocity>;
  sprites: Map<Entity, Sprite>;
  lifetimes: Map<Entity, Lifetime>;
  damageOnHit: Map<Entity, DamageOnHit>;
  spritePositions: Map<string, Position>;
  removedSprites: string[];
};

const createWorld = (): EcsWorld => ({
  nextEntity: 0,
  positions: new Map(),
  velocities: new Map(),
  sprites: new Map(),
  lifetimes: new Map(),
  damageOnHit: new Map(),
  spritePositions: new Map(),
  removedSprites: [],
});

const addEntity = (world: EcsWorld): Entity => {
  const entity = world.nextEntity;
  world.nextEntity += 1;
  return entity;
};

const removeEntity = (world: EcsWorld, entity: Entity) => {
  const sprite = world.sprites.get(entity);
  if (sprite) world.removedSprites.push(sprite.spriteId);

  world.positions.delete(entity);
  world.velocities.delete(entity);
  world.sprites.delete(entity);
  world.lifetimes.delete(entity);
  world.damageOnHit.delete(entity);
};

const updateMovement = (world: EcsWorld) => {
  for (const [entity, position] of world.positions) {
    const velocity = world.velocities.get(entity);
    if (!velocity) continue;

    position.x += velocity.dx;
    position.y += velocity.dy;
  }
};

const syncSprites = (world: EcsWorld) => {
  for (const [entity, sprite] of world.sprites) {
    const position = world.positions.get(entity);
    if (!position) continue;

    world.spritePositions.set(sprite.spriteId, { ...position });
  }
};

const updateLifetime = (world: EcsWorld) => {
  for (const [entity, lifetime] of world.lifetimes) {
    lifetime.ticksLeft -= 1;
    if (lifetime.ticksLeft <= 0) removeEntity(world, entity);
  }
};

export const runEcsCompositionExample = () => {
  const world = createWorld();

  const unit = addEntity(world);
  world.positions.set(unit, { x: 10, y: 20 });
  world.velocities.set(unit, { dx: 1, dy: 0 });
  world.sprites.set(unit, { spriteId: "unit-sprite-1" });

  const projectile = addEntity(world);
  world.positions.set(projectile, { x: 14, y: 20 });
  world.velocities.set(projectile, { dx: 3, dy: 0 });
  world.sprites.set(projectile, { spriteId: "arrow-sprite-1" });
  world.lifetimes.set(projectile, { ticksLeft: 1 });
  world.damageOnHit.set(projectile, { amount: 10 });

  updateMovement(world);
  syncSprites(world);
  updateLifetime(world);

  return {
    unitPosition: world.spritePositions.get("unit-sprite-1"),
    projectileAlive: world.positions.has(projectile),
    removedSprites: world.removedSprites,
  };
};
