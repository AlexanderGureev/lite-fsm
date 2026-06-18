# Resources

`resource(...)` — template-level runtime-поле для cache и рабочих структур. Это правильное место для всего mutable-состояния, которое нужно симуляции, но не является авторитативным фактом строки.

## Контракт

- Resource создаётся один раз при создании actor store внутри конкретного `MachineManager` instance и принадлежит шаблону, а не строке.
- Owner получает mutable-объект через `self.<resource>` в reducer, effect и reaction этого же шаблона. Он не индексируется по `EntityIndex`.
- Consumers видят только explicit exposed view. Private resource без `expose` недоступен через `entities().get(...)`.
- Resource не входит в public state: его нет в `dehydrate()`/`hydrate()` payload, persistence, `MachinesState`, `getSnapshot()`, selectors и React-хуках.

Подходящие данные: spatial grid, flow field, physics/pathfinding cache, scratch `Int32Array`, временный `Point`-буфер, SoA-пул короткоживущих объектов, metrics accumulator владельца.

## Private и exposed resource

```ts
initialContext: {
  // private: доступен только владельцу через self.scratch
  scratch: resource(() => new Int32Array(256)),

  // exposed: consumer видит ровно возвращённый expose-view
  unitGrid: resource(
    createSpatialGrid,
    (grid): SpatialGridView => ({
      queryRadius: grid.queryRadius.bind(grid),
    }),
  ),
},
```

- `resource(factory)` — private owner-only resource.
- `resource(factory, expose)` — owner resource плюс публикация `expose(owner)` в `entities().get(key).<resourceName>`.
- Owner-объект и exposed view сохраняют identity на всё время жизни менеджера.
- `expose` отвечает за форму и безопасность consumer surface. Runtime не делает proxy/freeze и не анализирует mutating-методы.

## Expose — узкий query-only API

Публикуй наружу только то, что нужно потребителям, и только для чтения/запроса. Не отдавай raw mutable-массивы (`heads`, `next`, `dx`, `dy`).

```ts
type SpatialIndexView = {
  heroEntity(): EntityIndex | null;
  collectNeighborsAt(x: number, y: number, out: Int32Array, limit?: number): number;
  readFlowDirectionAt(x: number, y: number, out: Point): Point;
};
```

Узкий view скрывает реализацию: позже можно сменить структуру индекса, не трогая потребителей.

## Cache — не второй источник истины

Resource не является источником авторитативного состояния домена. Не клади в resource `hp`, `command`, `selected`, ownership и другие факты строки — это колонки и spawn payload.

Cache остаётся производным, если выполнено всё:

- источник истины — в колонках;
- owner reducer пересобирает cache из колонок (обычно в начале своего `TICK`);
- cache не persist-ится и не читается UI как domain state;
- cache не обновляет чужие stores.

```text
movement.x/y + health.hp + identity.faction
-> spatialIndex.unitGrid (resource)
-> query API для combat/movement
```

У `resource(...)` нет rollback semantics. Staged spawn rollback откатывает строки и колонки, но не мутации resource. Поэтому owner reducer сначала валидирует и читает вход, затем мутирует resource и не бросает ошибку после начала мутации. Для RTS-сценариев rebuild делается штатным событием (`TICK`), без отдельного механизма восстановления.

## SoA-пул для множества короткоживущих объектов

Для большого числа временных объектов (снаряды, частицы урона), которые живут недолго и не требуют отдельного entity lifecycle, предпочтителен system actor с SoA-пулом внутри `resource(...)`, а не сущность на каждый объект.

Такой owner reducer:

- обновляет пул батчем и переиспользует typed-буферы;
- удаляет элементы через swap-remove (поставить последний на место удалённого, уменьшить `count`);
- делает bounded spatial query для попаданий или AoE;
- публикует только узкий read-view и/или handoff-буфер урона;
- очищает свой handoff-буфер в начале `TICK`.

```ts
// projectiles/projectile-pool.ts — структура и операции пула
export type ProjectilePool = {
  count: number;
  x: Float32Array;
  y: Float32Array;
  speed: Float32Array;
  targetEntity: Int32Array;
  incomingDamage: Int32Array; // handoff-буфер урона по целям
  damageTargets: Int32Array;  // какие слоты тронуты в этом TICK
  damageTargetCount: number;
};

export const clearProjectileDamage = (pool: ProjectilePool) => {
  for (let i = 0; i < pool.damageTargetCount; i += 1) {
    pool.incomingDamage[pool.damageTargets[i]] = 0;
  }
  pool.damageTargetCount = 0;
};

const removeAt = (pool: ProjectilePool, index: number) => {
  const last = pool.count - 1;
  if (index !== last) {
    pool.x[index] = pool.x[last];
    pool.y[index] = pool.y[last];
    pool.speed[index] = pool.speed[last];
    pool.targetEntity[index] = pool.targetEntity[last];
  }
  pool.count = last;
};
```

Авторитативный эффект попадания всё равно применяет владелец доменной колонки: владелец `hp` читает damage-буфер и меняет `hp`. Пул читает мир и мутирует только свои буферы.

## Косметические события через ring buffer

Если рендеру нужны разовые события (вспышки попаданий), но они не влияют на симуляцию, владелец-пул может накапливать их в ring buffer и публиковать курсор через exposed view. Scene сливает события раз в кадр по своему курсору и не диспатчит ничего в store. Это держит косметику вне симуляции и вне событий шины.

Module-level константы без mutable state допустимы. Любой mutable scratch, участвующий в симуляции, обязан жить в `resource(...)` владельца, а не в module-level переменной.
