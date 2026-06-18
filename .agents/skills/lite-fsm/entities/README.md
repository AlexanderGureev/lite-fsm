# @lite-fsm/entities

Подскилл `lite-fsm` для приложений с ECS-подобной нагрузкой: симуляции, игры и большие наборы однородных сущностей, которые обновляются каждый кадр. Читай его, когда обычных machines и actors уже недостаточно из-за объёма строк и hot-path обновлений.

`@lite-fsm/entities` не заменяет модель `lite-fsm`, а расширяет её. Machine-шаблон с `storage: "entity"` хранит контекст строк в колоночных `TypedArray` и обрабатывает весь батч строк одним reducer. Шину событий и семантику автоматов ты сохраняешь, а массовые данные получают ECS-скорость.

> Статус: alpha. Публичный API и формат снимков нестабильны. Не выдумывай entrypoints, методы и опции; при сомнении сверяйся с typings установленного пакета и его README.

## Ментальная модель

- `lite-fsm` — шина событий и набор автоматов. Это центр бизнес-логики.
- entities добавляет слой данных: **сущность** — это набор строк в колонках, **система** — это reducer, который батчем проходит по строкам.
- Сила в комбинации: ты получаешь семантику автоматов (state, события, эффекты, lifecycle) и гибкость ECS (композиция, data contract, скорость по колонкам).
- Поэтому игровую сущность проектируют как **композицию акторов**, каждый со своей зоной ответственности, а не как монолитный тип `enemy`/`player`.

Главное правило: данные, которые влияют на поведение игры, не живут в module-level переменных. У каждого факта есть владелец внутри store — обычная machine, actor template, `storage: "entity"` template или `resource(...)`.

## Когда использовать какой тип автомата

Выбор типа автомата делай до кода. Это основное архитектурное решение слоя entities.

| Тип | Когда | Примеры |
|---|---|---|
| Обычная machine | Объектный context, малый lifecycle, не обновляется каждый `TICK` | session игры, конфиг, пауза, spawn orchestration, modal/UI state |
| Actor template (`__INIT`) | Несколько независимых экземпляров одного процесса с собственным lifecycle | параллельные async-процессы, отдельные сессии |
| `storage: "entity"` | Большое число строк, обновление каждый `TICK`, hot-path данные в колонках, ordered simulation | позиция/скорость, hp, combat-таймеры, intent ИИ |
| `resource(...)` | Cache/scratch для hot-path reducer, не авторитативный public state | spatial grid, flow field, SoA-пул снарядов, scratch-буферы |

Правило различения entity vs machine: если сущность batch-обрабатывается без per-entity events и участвует в порядковой симуляции — это `storage: "entity"`. Если у неё объектный context, редкие события и небольшой lifecycle — это обычная machine или actor.

## Model-first gate

Перед кодом зафиксируй модель поведения (несколько строк в плане, без отдельного документа). Проверь:

- **Декомпозицию на акторов.** Какие отдельные зоны ответственности (movement, health, combat, ИИ, selection, command). Один актор — один владелец.
- **Тип каждого автомата** по таблице выше. Что хранится в колонках, что в resource, что в обычной machine.
- **Расписание симуляции.** Порядок entity-систем — это контракт. Какую фазу что читает, что пишет, что видит следующая фаза. См. `simulation.md`.
- **Колонки и handoff.** Для каждой handoff-колонки (`incomingDamage` и подобных) зафиксируй: кто пишет, кто читает, кто очищает и до какого момента значение актуально.
- **События.** Доменные намерения и lifecycle (`ISSUE_MOVE`, `GAME_START`, `UNIT_DEAD`), а не способ синхронизации hot-path данных.
- **Слои приложения.** View (React) / store (бизнес-логика) / scene (чтение + оптимизации + графика) / единая точка входа. См. `architecture.md`.

## Жёсткие правила

- Reducer entity-системы синхронный и детерминированный: мутирует только `self`, чужое читает через `entities()`, не получает deps, не вызывает `transition`, не делает IO/async.
- Никакого `Date.now()`, `performance.now()`, `Math.random()` как входа симуляции внутри reducer. Случайность и время передавай через события, подготовленное состояние или resource владельца.
- Порядок entity templates в объекте `machines` — это simulation contract. Делай его явным и покрывай тестом (`simulation.md`).
- Колонки — источник истины строки. Resource — производный cache, который владелец пересобирает из колонок и не публикует в snapshot/persistence/selectors.
- Hot-path считай в reducers. `effects` — для редких событий, despawn и async. `reactions` — для внешней синхронизации (рендер, звук, метрики) без диспатча.
- Сущности создаются только через события спавна, удаляются через `despawnOn` или `transition.despawn(...)`. Прямой публичный диспатч `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` запрещён.

## Анти-паттерны

- `TICK -> глобальный orchestrator -> scratch -> flush событий` вместо `TICK -> ordered entity reducers -> committed state`.
- Module-level mutable scratch (`const buffer = new Float32Array(...)` на уровне модуля), участвующий в симуляции. Перенеси в `resource(...)` владельца.
- Дублирование movement/health/combat в отдельных `playerUnit` и `enemyUnit` вместо переиспользуемых акторов.
- Авторитативные факты (`hp`, `command`, `selected`) в `resource(...)` вместо колонок.
- Метрики/cache как второй источник истины для gameplay reducers.
- UI или scene, которые сами решают gameplay вместо отправки доменного события.

## Навигация

- `architecture.md` — композиция акторов, владельцы ответственности, generic-системы по data contract, слои приложения и единая точка входа, структура файлов.
- `simulation.md` — ordered ECS как явный контракт, reducer contract, live view `entities()`, колонки и handoff, детерминизм hot-path.
- `resources.md` — `resource(...)` и `expose`, дисциплина cache, SoA-пул для множества короткоживущих объектов.
- `lifecycle.md` — `spawnSchema` против `initialContext`, рецепты спавна и плагин, despawn, `effects` против `reactions`.
- `patterns.md` — канонические шаблоны: component actor, system actor с resource, SoA-пул, coordinator над сущностями.
- `bootstrap.md` — конкретный wiring: typed `create-machine`, сборка store с плагином, deps, точка входа scene, read-selectors, React-хуки.
- `testing.md` — тесты батч-reducer, контракт порядка, lifecycle, исключение resource из snapshot.

Базовую модель `lite-fsm` (типы machines, config как подписка, effects pipeline, selectors, persistence, SSR) бери из `../references/`. Этот подскилл описывает только то, что добавляет слой entities.
