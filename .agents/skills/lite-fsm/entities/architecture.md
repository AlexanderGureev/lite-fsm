# Architecture

Как проектировать сущности и как разложить игру на слои. Это слой принципов; конкретный wiring-код — в `bootstrap.md`.

## Композиция акторов

Проектируй сущность как композицию акторов, а не как монолитный тип. Актор реализует абстрактную механику для строк, которые подходят под его контракт данных.

```text
hero:  identity + movement + health + combat + command + selection
ally:  identity + movement + health + combat + command + selection
enemy: identity + movement + health + combat + enemyAi
```

`hero`, `ally`, `enemy` — это не отдельные типы автоматов, а разные наборы акторов. Различие сущностей выражается тем, какие строки им заведены при спавне, а не отдельными машинами `playerUnit`/`enemyUnit`.

Принципы:

- Не дублируй movement/health/combat в разных типах сущностей. Заведи один актор и давай строку тем сущностям, которым механика нужна.
- Новую способность добавляй как новый актор или расширение существующего владельца, а не как новый монолитный тип.
- Optional behavior выражай наличием или отсутствием строки актора. Нет строки `command` — сущностью нельзя командовать; нет строки `enemyAi` — у неё нет ИИ.

В классическом ECS компоненты — data-only, а системы отдельно. В entities актор хранит и данные, и reducer-логику, поэтому композиция чуть менее гибкая. Но принцип тот же: generic-система работает по контракту данных, а не по имени сущности.

## Один владелец на ответственность

Каждый актор владеет ровно одной зоной ответственности и мутирует только свои колонки. Чужие данные он читает через `entities()`, но не пишет в них.

Типовая раскладка владельцев для боевой симуляции:

- `health` владеет `hp`, `maxHp`, состояниями `ALIVE`/`DEAD` и death lifecycle.
- `combat` владеет cooldown, attack-статами, прямым уроном и intent выстрела.
- `projectiles` владеет пулом снарядов, их движением и handoff-уроном от попаданий.
- `command` владеет приказом player-сущности и его завершением.
- `enemyAi` владеет intent враждебной сущности.
- `movement` владеет `x/y/vx/vy`.
- `spatialIndex` владеет spatial/flow runtime-структурами (технический владелец cache).

Технический владелец cache не принимает gameplay-решений. `spatialIndex` строит и отдаёт индекс, но не решает, кто кого атакует.

## Generic-системы по data contract

Система обрабатывает строки по контракту данных, а не по имени сущности. `movement` двигает любые строки с movement-данными; `health` применяет урон к любым строкам с `hp`. Это даёт переиспользование: новый вид сущности, у которого есть нужные колонки, автоматически попадает в систему без правок системы.

Перед чтением optional-строки другого store проверяй наличие:

```ts
const health = entities().get("health");
for (const entity of self.indices) {
  if (!health.has(entity) || health.hp[entity] <= 0) continue;
  // ...
}
```

## Слои приложения

Игра на entities раскладывается на четыре слоя с однонаправленной зависимостью.

| Слой | Ответственность | Чем не является |
|---|---|---|
| View (React) | Меню, HUD, overlays. Читает через selectors/хуки, шлёт доменные события | Не владеет gameplay, не двигает симуляцию |
| Store (бизнес-логика) | machines, actors, entity systems, resources, effects, deps | Не знает про Phaser, canvas и рендер |
| Scene (рендер) | Читает committed state, гонит fixed-step `TICK`, оптимизации, графика | Не владеет правилами симуляции |
| Точка входа | Composition root: собирает store, metrics, монтирует scene | Не содержит бизнес-логики и рендера |

Контракт между слоями:

- View и Scene **пишут** в store только через `transition(domainEvent)` и **читают** только через selectors/exposed views.
- Reducers не знают про рендер. Renderer-синхронизация — это `reactions` или код самой scene, который читает committed state.
- Бизнес-логика не импортирует React и движок рендера. Зависимость от внешнего мира идёт через `deps`-адаптеры.

### Scene как точка входа рендера и сборщик

Scene — точка входа рендера и место, где собираются все рендер-подсистемы. Она же владеет циклом симуляции: накапливает время кадра и гонит фиксированный шаг `TICK` в store.

- Основные рендер-подсистемы (units, projectiles, effects, camera) — отдельные модули. Scene их инстанцирует и связывает, но сама не реализует.
- Чтение store идёт через узкие read-selectors и exposed views, а не через прямой доступ к backing store.
- Все оптимизации рендера живут в scene: dirty-флаг, куллинг по границам экрана, LOD/stride, интерполяция/экстраполяция позиций между тиками, sprite-пулы.
- Когда класс scene растёт, выноси из него драйвер симуляции (fixed-step clock) и контроллер ввода (pointer/keyboard → доменные события) в отдельные модули, чтобы scene осталась чистой сборкой.

### Единая точка входа приложения

Должна быть одна функция-composition root, где всё создаётся и инициализируется: store с зависимостями, metrics/adapters и функция монтирования scene. UI вызывает её один раз и не пересоздаёт на каждый render.

```ts
// app.ts — единственное место сборки приложения
export function createGameApp(options: CreateGameAppOptions = {}): GameApp {
  const metrics = createMetricsAdapter(() => performance.now());
  const store = makeStore({ metrics, random: Math.random });

  const mountScene = (container: HTMLElement) => {
    // динамический импорт движка, создание scene с (store, metrics), подписки
    // возвращает teardown-функцию
  };

  return { store, metrics, mountScene };
}
```

Отдельные точки запуска (обычный экран, debug-страница с конфигом из URL) переиспользуют тот же composition root с разными опциями, а не дублируют сборку.

## Структура файлов

Для игровых систем предпочтительна папка на каждый автомат с тонким `index.ts` как entry point.

```text
store/
├── create-machine.ts          # typed-обёртки фабрик
├── deps.ts                    # AppDeps, RuntimeDeps
├── types.ts                   # AppEvents
├── index.ts                   # реестр machines, spawn, makeStore
├── schedule.ts                # SIMULATION_SCHEDULE: объявленный порядок фаз
├── spawn-events.ts            # defineSpawnEvents
├── spawn/
│   └── placement.ts           # рецепты и spawn-планы (cold path)
├── selectors.ts               # read-views для scene/UI
└── machines/
    ├── movement/index.ts
    ├── health/index.ts
    ├── combat/index.ts
    ├── projectiles/
    │   ├── index.ts           # entity-система
    │   └── projectile-pool.ts # SoA-пул владельца
    └── spatial-index/
        ├── index.ts
        ├── spatial-grid.ts
        └── flow-field.ts
```

Правила:

- Один автомат — одна зона ответственности.
- Helper одного владельца лежит рядом с автоматом. Общий helper выноси только при двух и более потребителях.
- Spawn wiring (рецепты, placement-математика) держи отдельно от runtime-машин: это cold path, исполняется при спавне, а не в `TICK`.
- Если файл системы растёт к 800+ строкам, разбивай на модули с тонким entrypoint.
