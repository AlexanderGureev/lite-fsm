# Simulation

Hot-path слой: как entity-системы считают состояние за один `TICK`. Это самая ответственная часть: здесь живёт детерминизм, порядок и производительность.

## Ordered ECS как контракт

Порядок entity templates в объекте `machines` определяет порядок их reducers в одном событии. Для игр и симуляций сделай этот порядок явным контрактом фаз.

```text
spatialIndex      строит spatial/flow по позициям на начало кадра
-> combat         считает прямые атаки и intent выстрела
-> projectiles    двигает пул снарядов и пишет handoff-урон от попаданий
-> health         применяет прямой урон и урон от снарядов, фиксирует смерть
-> command        завершает player-приказы по факту прибытия
-> enemyAi        выбирает intent
-> movement       двигает живые строки по актуальным command/intent
```

Смысл порядка нужно описывать явно: какую фазу что читает, что пишет, что видит следующая. Например, `combat` читает `health` **до** применения урона, а `movement` читает `health` **после** `health`, поэтому мёртвые строки уже не двигаются в этом кадре.

### Делай расписание явным и тестируемым

Неявный порядок ключей объекта — самый частый источник тихих регрессий: кто-то отсортирует импорты или переставит ключи «для читаемости» и молча сломает gameplay. Сделай порядок явным артефактом и закрой тестом.

Сгруппируй entity-системы с per-`TICK` фазой в отдельный объект и собери `machines` из него. Порядок ключей этого объекта и есть контракт фаз. Обычная machine `gameSession` и entity-акторы без per-`TICK` фазы (`identity`, `selection`) добавляются отдельно — их порядок не важен.

```ts
// store/schedule.ts — объявленное расписание фаз для теста-страховки
export const SIMULATION_SCHEDULE = [
  "spatialIndex",
  "combat",
  "projectiles",
  "health",
  "command",
  "enemyAi",
  "movement",
] as const;
```

```ts
// store/index.ts — entity-системы в порядке расписания
const entitySystems = { spatialIndex, combat, projectiles, health, command, enemyAi, movement };
export const machines = { gameSession, identity, selection, ...entitySystems };
```

```ts
// Тест защищает контракт от случайного reorder.
test("порядок entity-систем соответствует расписанию симуляции", () => {
  expect(Object.keys(entitySystems)).toEqual([...SIMULATION_SCHEDULE]);
});
```

Архитектурный рефактор не должен молча менять gameplay. Если упрощение принято сознательно (например, overkill-урон в одном `TICK`), фиксируй это как правило симуляции.

## Reducer contract

Reducer entity-системы выполняется один раз для батча затронутых строк. Первый аргумент (`state`) в entity-машине не используется.

```ts
reducer: (_state, action, { self, entities, payloadFor }) => {
  switch (action.type) {
    case "ENTITY_SPAWNED":
      for (const entity of self.indices) {
        const payload = payloadFor(entity);
        self.x[entity] = payload.x;
        self.y[entity] = payload.y;
      }
      return;

    case "TICK": {
      const health = entities().get("health");
      for (const entity of self.indices) {
        if (!health.has(entity) || health.hp[entity] <= 0) continue;
        self.x[entity] += self.vx[entity];
        self.y[entity] += self.vy[entity];
      }
      return;
    }
  }
},
```

Жёсткие правила:

- Reducer всегда пишется через `switch (action.type)`, даже если обрабатывается один тип события. Не используй `if (action.type !== "TICK") return` и цепочки `if` по типу: единая структура `switch` читается лучше и не разъезжается при добавлении событий. Это общее правило reducer'ов lite-fsm (`../references/business-logic.md`); в entity-системах оно тем более важно из-за соблазна свести всё к одному `TICK`-guard.
- Каждый `case` завершай `return`; не добавляй `default`. Ветки с локальными объявлениями (`const ...`) оборачивай в блок `case "X": { ... }`.
- Reducer **синхронный и детерминированный**. Нельзя возвращать Promise, делать IO, renderer sync, timers или async.
- Reducer **не получает deps** внешнего мира и **не вызывает `transition`**. Он только читает вход и мутирует `self`.
- Reducer мутирует **только `self`** (свои колонки, свои resources, свой `stateCode`). Чужие stores только читает.
- Сначала читай и валидируй вход, затем мутируй `self`.
- Перед чтением optional-строки чужого store проверяй `view.has(entity)`.
- Случайность, wall-clock и внешний ввод не должны появляться в reducer как скрытая зависимость. Передавай их через события, подготовленное состояние или resource владельца.

`self` даёт: `self.indices` (строки текущего батча), `self.<column>[entity]`, `self.<resource>`, `self.stateCode[entity] = self.states.<STATE>` (планирует переход строки), `self.has(entity)`, `self.entityId(entity)`, `payloadFor(entity)` (валиден на `ENTITY_SPAWNED`).

## `entities()` — live view, а не snapshot

`entities()` в reducer возвращает живое представление всего entity-runtime. Reducer видит записи систем, которые выполнились **раньше** в текущем `transition`, и не видит записи систем, стоящих **позже**. Именно поэтому порядок — контракт.

- `entities().get(key)` — read-only view: `count`, `version`, `has(entity)`, `state(entity)` и колонки по `EntityIndex` (`view.x[entity]`).
- Представления типизированы только для чтения. Runtime не ставит proxy/freeze; обход через `as any` не защищён, но запрещён правилами.
- `self.indices` ограничивает строки текущего батча, а `entities()` читает все stores без scoped-валидации по этому батчу.
- Не сохраняй `self`, `entities()` и views за пределами текущего вызова reducer.

## Колонки и handoff

Колонки — авторитативные или handoff-значения на каждую строку: `hp`, `x/y/vx/vy`, `command`, `attackTimerMs`, `incomingDamage`, `projectileTargetEntity` и подобные.

Для каждой handoff-колонки фиксируй владельца и lifetime: кто очищает, кто пишет, кто читает и до какого момента значение актуально.

Пример прямого урона: `incomingDamage` пишет только `combat`, читает только `health`, очищает владелец в начале своего `TICK`. После `TICK` это значение — не долговременный domain fact, а handoff одного кадра.

```ts
// combat: очистка перед записью того же кадра.
for (const entity of self.indices) self.incomingDamage[entity] = 0;
// ... затем запись урона по целям ...
```

Урон с отдельным жизненным циклом (например, от снарядов) должен иметь отдельного владельца. Система-пул держит свой буфер урона в `resource(...)`, очищает его в начале `TICK`, пишет попадания при движении снарядов и публикует узкий read-view. `health` читает этот буфер вместе с `combat.incomingDamage`. Сам пул `hp` не меняет и death lifecycle не диспатчит — это делает владелец колонки `hp`.

Не используй колонки для runtime-буферов и общих структур мира — это работа `resource(...)` (`resources.md`).

## Производительность hot-path

- В `TICK` не создавай новые массивы, буферы и объекты для hot path. Используй scratch в `resource(...)`.
- Перед циклом по строкам поднимай ссылки на колонки в локальные переменные (`const hp = health.hp;`), чтобы не разыменовывать view на каждой итерации.
- Предпочитай ранний `continue` для мёртвых/неподходящих строк ветвлению вглубь.
- Тяжёлые соседские запросы (separation, AoE) делай через bounded spatial query с фиксированным буфером-limit, а не через полный перебор.

## Что считать в reducer, а что нет

- Per-frame movement, combat, damage, ИИ — **в reducers**. Это hot path.
- `effects` — редкие события и lifecycle: dispatch `UNIT_DEAD`/`HERO_DEAD`, despawn мёртвых, async. Не для per-frame расчётов.
- `reactions` — внешняя синхронизация после commit: рендер, звук, метрики. Не владеют решениями симуляции.

Подробности lifecycle, `effects` и `reactions` — в `lifecycle.md`.
