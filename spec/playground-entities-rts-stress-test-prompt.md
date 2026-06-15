# Prompt: RTS stress test для `@lite-fsm/entities` в `apps/playground`

Рабочая директория: `/Users/alexga/work/lite-fsm`.

Реализуй в `apps/playground` новый интерактивный пример `entities-rts`: 2D top-down pixel art RTS на Phaser, который проверяет удобство и пиковую производительность `@lite-fsm/entities` при большом количестве сущностей.

## 1. Контекст

Перед началом прочитай:

- `AGENTS.md`;
- `packages/entities/README.md`;
- `packages/entities/PERFORMANCE.md`;
- `ecs_example/store/create-machine.ts`;
- `ecs_example/store/index.ts`;
- `ecs_example/store/machines/enemy-actor.ts`;
- `ecs_example/store/machines/enemy-sprite-actor.ts`;
- `apps/playground/app/examples/roguelite`;
- `apps/playground/lib/examples-manifest.ts`.

`apps/playground` уже зависит от `phaser`, но пока не зависит от `@lite-fsm/entities`. Добавь `@lite-fsm/entities: workspace:*` в `apps/playground/package.json` и обнови lockfile, если package manager этого требует.

Запрещено запускать docs build и команды, которые транзитивно запускают docs build: `pnpm run build`, `pnpm --filter @lite-fsm/docs build`, `pnpm run docs:build`, `pnpm run pages:build*`, `next build` внутри `apps/docs`.

## 2. Цель

Создать MVP игры и stress test:

- Phaser отвечает за canvas, input, спрайты и pixel art отрисовку.
- `lite-fsm` и `@lite-fsm/entities` владеют игровой логикой, симуляцией, жизненным циклом и состоянием сущностей.
- Основная нагрузка по юнитам, врагам, HP, движению, командам, выбору, атаке и синхронизации с рендером проходит через машины с `storage: "entity"`.
- React остается тонким слоем для страницы, настроек запуска, HUD и подключения `FSMContextProvider`.
- Главный экран позволяет задать количество врагов и союзных юнитов до старта.
- Игра служит одновременно playable demo и практическим benchmark: на экране видны FPS, время `manager.transition(TICK)`, время Phaser sync/render, количество живых сущностей и параметры stress run.

## 3. Model-first gate

Перед кодом зафиксируй в коротком плане модель поведения:

- Domain owner: entity actor `unitActor` или близкий по смыслу шаблон, который хранит героя-базу, союзников и врагов в SoA-колонках.
- Process owner: обычные машины `gameSession`, `inputSession` и `metricsSession` для низкочастотного состояния, настроек, статуса рана и overlay.
- View owner: Phaser scene и renderer adapter; они читают committed entity columns и отправляют domain events, но не владеют симуляцией.
- Observer owner: entity `reactions` синхронизируют Phaser sprites и cleanup, не диспатчат события.
- Technical owner: flow field, spatial grid, formation и metrics helpers; это reset-per-frame scratch buffers, не источник истины.
- События: `GAME_CONFIG_CHANGED`, `GAME_START`, `GAME_RESTART`, `GAME_PAUSE`, `GAME_RESUME`, `TICK`, `SELECT_RECT`, `SELECT_ENTITY`, `CLEAR_SELECTION`, `ISSUE_MOVE`, `ISSUE_ATTACK_MOVE`, `HERO_DEAD`.
- Машины игнорируют события вне своих состояний через явный `config`, без wildcard.
- Persistence, SSR hydration, ресурсы, строительство, экономика и multiplayer не нужны.

## 4. Область работ

Создай пример по пути:

- `apps/playground/app/examples/entities-rts/page.tsx`;
- `apps/playground/app/examples/entities-rts/components/Game.tsx`;
- `apps/playground/app/examples/entities-rts/store/**`;
- `apps/playground/app/examples/entities-rts/store/machines/**`;
- `apps/playground/app/examples/entities-rts/store/sim/**` для flow field, spatial grid, formation, seeded random и pure helpers;
- `apps/playground/lib/examples-manifest.ts`;
- при необходимости `apps/playground/public/examples/entities-rts/**` для локальных bitmap assets.

Ожидаемый route: `/examples/entities-rts`.

Обнови manifest:

- `id`: `entities-rts`;
- `title`: `RTS stress test`;
- `kicker`: `Entities + Phaser`;
- `tags`: `["actors"]`;
- `category`: `actors`;
- `iconKey`: `gamepad`.

## 5. Вне области работ

- Не меняй публичный API `@lite-fsm/core`, `@lite-fsm/entities`, `@lite-fsm/react` и других packages.
- Не оптимизируй исходники `packages/entities` в рамках этого задания. Если example выявил blocker API или performance bug, зафиксируй его в финальном отчете.
- Не добавляй A*, navmesh, steering library, physics engine, Phaser Arcade Physics collisions или per-entity React components.
- Не добавляй ресурсы, строительство, туман войны, сетевую игру, сохранения, кампанию, инвентарь, прокачку, сложный AI.
- Не делай docs page и не запускай docs build.
- Не используй внешнюю сеть для ассетов. Используй Phaser-generated bitmap textures или локальные assets из `apps/playground/public`.

## 6. Целевая архитектура

### Store wiring

- Используй `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` по образцу `ecs_example/store/create-machine.ts`.
- Подключи `entitiesPlugin({ spawn })` в `makeStore`.
- Передай в зависимости `entities: manager.entities`, `getState: manager.getState`, `renderer`, `metrics`, `random`.
- Используй `immerMiddleware` для обычных машин, как в других примерах playground.
- Типы событий оформляй через `FSMEvent<...>`.
- Entity spawn оформляй через `defineSpawnEvents`, `spawnEvent`, `defineEntitySpawn`.

### Entity storage

Минимальный целевой набор actor templates:

- `unitActor` с `storage: "entity"`: все горячие данные героя, союзников и врагов.
- Дополнительный `renderActor` допустим только если он снижает сложность Phaser sync; не дублируй hot combat/movement state между actor templates.

`unitActor` должен хранить в колонках:

- позиция и скорость: `x`, `y`, `vx`, `vy`;
- `kind`: hero, ally, enemy через numeric enum в `u8`;
- `faction`: player, enemy через `u8`;
- `radius`, `speed`;
- `hp`, `maxHp`;
- `attackRange`, `attackDamage`, `attackCooldownMs`, `attackTimerMs`;
- `selected`;
- `command`: idle, move, attack-move через numeric enum в `u8`;
- `targetX`, `targetY`;
- поля для formation offset или local avoidance, если они реально используются.

Не храни в горячих колонках строковые identifiers, если можно использовать numeric enum или позицию. Строковые `entityId` нужны только для public spawn/routing и Phaser sprite keys.

### Phaser adapter

- Phaser scene создается только на клиенте через dynamic import.
- В одном animation frame допускается один основной `manager.transition({ type: "TICK", ... })`.
- Phaser input отправляет domain events: selection, move, attack-move, pause/restart.
- Phaser не меняет entity columns напрямую и не хранит игровую истину.
- Sprite pool живет в renderer adapter и синхронизируется из entity `reactions`.
- Удаление sprite выполняется через `ENTITY_DESPAWNED` reaction или renderer cleanup после committed state.

## 7. Механики MVP

### Start screen

Первый экран - рабочий экран настройки и запуска, не landing page.

Обязательные controls:

- количество врагов;
- количество союзных юнитов;
- seed карты;
- кнопка запуска;
- пресеты: small, medium, stress.

Рекомендуемые диапазоны:

- враги: `100` - `20_000`, default `3_000`;
- союзники: `1` - `1_000`, default `120`;
- hero всегда один.

При очень больших значениях UI может показывать предупреждение, но не должен запрещать запуск.

### Spawn

При старте:

- герой-база появляется около центра карты;
- союзники появляются вокруг героя формацией, не в одной точке;
- враги появляются группами по краям карты или в случайных удаленных зонах;
- карта генерируется по seed.

Герой:

- находится под контролем игрока;
- имеет HP значительно выше обычных юнитов;
- считается базой;
- если герой погибает, `gameSession` переходит в `GAME_OVER`.

### Selection and orders

Реализуй RTS-управление:

- left click по герою или союзнику выбирает его;
- drag rectangle выбирает всех player units в прямоугольнике;
- empty click очищает выбор;
- right click по земле отдает выбранным приказ движения;
- right click по врагу или в область врагов отдает attack-move к точке.

Приказ движения:

- назначает выбранным unit target positions с formation offsets;
- не сводит всех юнитов в одну координату;
- не создает отдельный transition на каждого юнита.

### Enemy AI

Враги:

- двигаются к герою через flow field;
- не используют A*;
- останавливаются и атакуют, когда герой входит в радиус атаки;
- не обязаны атаковать союзников в MVP.

### Combat

- Союзники атакуют ближайших врагов в радиусе при `attack-move` или когда враг рядом с текущей позицией.
- Урон и cooldown живут в entity columns.
- Мертвые враги удаляются через entity lifecycle.
- Смерть героя завершает игру.
- Projectiles, splash damage и сложные анимации не нужны.

## 8. Flow field и anti-clumping

### Flow field

- Карта разбивается на grid.
- Каждая клетка хранит направление движения к текущей клетке героя.
- Враг на каждом `TICK` читает направление клетки под собой.
- Rebuild выполняется при смене hero grid cell или при restart.
- Если карта без непроходимых препятствий, допустим direct direction field по клеткам.
- Если добавляешь препятствия, используй bounded BFS/Dijkstra по grid, но не A* на каждого врага.
- Используй typed arrays или плотные arrays; избегай object-per-cell в hot path.

### Anti-clumping

Запрещен полный `N x N` проход по юнитам.

Используй uniform spatial grid:

- cell size не меньше максимального радиуса avoidance;
- build grid за `O(n)` каждый tick или переиспользуй scratch buffers;
- для separation проверяй только текущую и соседние клетки;
- ограничь число neighbor samples на сущность, например `8` или `12`;
- force separation должен работать для врагов и союзников;
- formation target offsets должны предотвращать схлопывание выбранных союзников в одну точку.

Scratch buffers допустимы только как временные структуры:

- сбрасываются каждый tick;
- не являются источником истины;
- не попадают в React state;
- не сохраняются в snapshots.

## 9. Performance contract

Игра должна показывать metrics overlay:

- FPS;
- `TICK` transition ms: current, average за последние 120 frames, max;
- Phaser sync/render ms: current, average, max;
- total live entities;
- enemies alive;
- allies alive;
- selected count;
- hero HP;
- flow field rebuild ms;
- spatial grid build ms.

Hot path requirements:

- один `TICK` transition на frame;
- не более одного unscoped command transition на пользовательский приказ;
- нет per-entity React render;
- нет per-entity `manager.transition(...)` в Phaser update;
- нет nested full scans по всем врагам и всем союзникам;
- sprite objects переиспользуются через pool;
- camera, tiles и static map graphics не пересоздаются каждый frame.

Целевой ручной smoke:

- `500` врагов и `50` союзников: управление, выбор, движение и game over работают без заметных фризов.
- `3_000` врагов и `120` союзников: demo остается интерактивной, metrics видны.
- `10_000+` врагов: допускается снижение FPS, но страница не должна зависать из-за алгоритма `N x N`.

## 10. UI и визуальный контракт

- Игра должна открываться сразу как инструмент настройки и запуска.
- Используй существующие компоненты playground (`Button`, `Badge`, `Card` и т.д.) только там, где это соответствует текущему стилю.
- Canvas должен быть основным визуальным элементом.
- Pixel art вид должен быть заметен: можно использовать Phaser-generated bitmap textures или локальные spritesheets.
- На игровом экране должны быть HUD, health bar героя, counts, metrics и pause/restart.
- Текст в controls не должен ломаться на мобильной и desktop ширине.
- Не добавляй декоративные тяжелые фоны, маркетинговый hero или объясняющий лендинг.

## 11. Этапы реализации

### Этап 1 - Shell, dependency и typed store

#### Цель

Создать route, manifest entry, package dependency и typed store skeleton с `entitiesPlugin`.

#### Контракт этапа

- Добавлен `@lite-fsm/entities` в `apps/playground/package.json`.
- Создан `apps/playground/app/examples/entities-rts`.
- Созданы `store/create-machine.ts`, `store/index.ts`, `store/types.ts`, `store/deps.ts`.
- `createMachine` типизирован через `EntitiesPlugin<AppDeps>`.
- `makeStore` подключает `entitiesPlugin({ spawn })`.
- Страница route рендерит start screen с настройками, но без полной игры.

#### Не делать в этом этапе

- Не реализовывать flow field, combat и Phaser scene.
- Не менять packages.
- Не добавлять benchmark scripts.

#### Тесты этапа

- `pnpm --filter @lite-fsm/playground check-types`.
- `git diff --check`.

#### Критерий завершения

- TypeScript принимает imports `@lite-fsm/entities` из playground.
- Route `/examples/entities-rts` существует.
- Manifest содержит новый пример.

### Этап 2 - Entity model, spawn и simulation helpers

#### Цель

Реализовать `unitActor`, spawn recipes, seeded map, flow field, spatial grid и formation helpers.

#### Контракт этапа

- `unitActor` хранит hot state через entity columns.
- Spawn recipes создают hero, allies и enemy groups из одного `GAME_START`.
- Flow field helper строит grid directions к hero cell.
- Spatial grid helper обеспечивает bounded neighbor lookup.
- Formation helper назначает разные target positions выбранным units.
- Pure helpers лежат в `store/sim`.

#### Не делать в этом этапе

- Не подключать Phaser rendering.
- Не добавлять сложный AI.
- Не использовать A*.

#### Тесты этапа

- Vitest для `flow-field`, `spatial-grid`, `formation`, названия `describe`/`it` на русском.
- Для pure helpers с контрактами без side effects цель - 100% coverage по statements/branches/functions/lines.
- `pnpm --filter @lite-fsm/playground check-types`.

#### Критерий завершения

- Spawn создает нужные counts.
- Flow field и spatial grid не требуют `N x N`.
- Formation не возвращает одинаковую точку для группы.

### Этап 3 - Tick, movement, selection и combat

#### Цель

Сделать playable headless simulation через `manager.transition(...)`.

#### Контракт этапа

- `TICK` обновляет movement, attack cooldowns, damage и death state.
- Враги идут по flow field к герою.
- Units используют separation и formation target.
- Selection events меняют `selected` columns только для player units.
- Move и attack-move commands применяются к выбранным units одним batch event.
- Смерть героя переводит `gameSession` в `GAME_OVER`.
- Dead enemies удаляются через entity lifecycle.

#### Не делать в этом этапе

- Не добавлять projectiles.
- Не делать per-unit transitions.
- Не выносить hot state в React.

#### Тесты этапа

- Focused runtime tests для spawn, selection, movement command, enemy attack hero, hero death.
- `pnpm --filter @lite-fsm/playground check-types`.
- `git diff --check`.

#### Критерий завершения

- Headless store может стартовать run, выполнить несколько `TICK` и получить expected state.
- Нет полного nested scan по всем врагам и союзникам в hot combat/movement path.

### Этап 4 - Phaser scene, controls и renderer adapter

#### Цель

Подключить Phaser canvas, pixel art sprites, selection rectangle, commands и sprite sync.

#### Контракт этапа

- Phaser scene создается только на клиенте.
- Pointer input отправляет `SELECT_RECT`, `SELECT_ENTITY`, `ISSUE_MOVE`, `ISSUE_ATTACK_MOVE`.
- Sprite pool синхронизируется из entity reactions или adapter, который читает `manager.entities()`.
- Canvas отображает hero, allies, enemies, selection highlights, health feedback и map grid.
- Pause, resume, restart работают.

#### Не делать в этом этапе

- Не использовать Phaser physics для gameplay collisions.
- Не создавать React-компонент на каждую entity.
- Не делать сетевые или persistent features.

#### Тесты этапа

- `pnpm --filter @lite-fsm/playground check-types`.
- Ручная проверка через dev server: start, drag select, right-click move, right-click attack-move, game over.

#### Критерий завершения

- Игра playable в браузере.
- Phaser scene не владеет gameplay state.
- Sprite cleanup не оставляет видимые мертвые entities.

### Этап 5 - Metrics, stress presets и polish

#### Цель

Сделать stress test удобным для оценки производительности и завершить UI.

#### Контракт этапа

- Start screen содержит enemy/allied counts, seed и presets.
- HUD показывает FPS, transition ms, render/sync ms, counts, selected count, hero HP.
- Metrics считаются rolling window без лишних allocations.
- Большой stress preset не блокирует UI до старта; во время старта допустим короткий setup cost.
- Добавлен краткий local note в коде или README example о том, что именно нагружает `@lite-fsm/entities`.

#### Не делать в этом этапе

- Не добавлять публичные docs.
- Не запускать docs build.
- Не превращать metrics в package benchmark API.

#### Тесты этапа

- `pnpm --filter @lite-fsm/playground check-types`.
- Browser smoke на small и medium presets.
- `git diff --check`.

#### Критерий завершения

- Metrics panel обновляется во время игры.
- Settings реально меняют число spawned enemies/allies.
- Stress preset не вызывает алгоритмическую заморозку страницы.

### Этап 6 - Рефакторинг, чистка и финальная проверка

#### Цель

Убрать временные решения и проверить, что пример готов к review.

#### Must fix

- TODO/FIXME, debug logging, dead code, temporary branches.
- Дублирование enum mapping, coordinate transforms, spawn defaults или command normalization.
- Любой per-entity React render.
- Любой `manager.transition(...)` внутри full entity loop.
- Любой очевидный `N x N` hot loop.
- Неприменяемые imports, types, helpers и test scaffolds.

#### Inspect only

- Декоративные переименования без снижения сложности.
- Микрооптимизации без измеримого bottleneck.
- Перенос Phaser layout без функциональной причины.

#### Тесты этапа

- `pnpm --filter @lite-fsm/playground check-types`.
- Focused Vitest по helper modules.
- `git diff --check`.
- Source audit по `TODO|FIXME|debugger|test.only|test.skip|manager.transition\\(` в active scope.

#### Критерий завершения

- Active scope не содержит временный код.
- Финальный diff не меняет packages.
- Все обязательные checks пройдены или явно делегированы пользователю с причиной.

## 12. Критерий полной готовности

Готово только если:

- `/examples/entities-rts` доступен в playground и manifest.
- Start screen задает counts и seed.
- Hero, allies и enemy groups spawn-ятся через `@lite-fsm/entities`.
- Игрок может выбирать units и отдавать move/attack-move commands.
- Враги двигаются к герою через grid flow field и атакуют его в радиусе.
- Units и enemies не схлопываются в одну точку на medium preset.
- Hero death завершает игру.
- Phaser является render/input adapter, а не владельцем gameplay state.
- Metrics overlay показывает реальные timing/count values.
- Проверки `pnpm --filter @lite-fsm/playground check-types`, focused Vitest и `git diff --check` прошли.
- Docs build и запрещенные команды не запускались.

