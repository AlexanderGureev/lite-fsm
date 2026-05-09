# Lite-FSM Visualizer — Функциональная спецификация MVP

Статус: черновик. Исходный референс — `./music-app-mvp-flow.html`.

Документ фиксирует функциональную суть визуализатора lite-fsm для перехода к полному ТЗ. Описывает **что** делает продукт на уровне пользовательских сценариев и поведения, без выбора фреймворков, технологий и деталей реализации.

## 1. Назначение

Визуальный инструмент для исследования и пошаговой символической симуляции систем, построенных на `lite-fsm`. Принимает строку исходного кода с одним или несколькими `createMachine(...)` (опционально с `MachineManager(...)`), компилирует её в граф через graph-compiler и предоставляет три представления для понимания и проверки бизнес-логики без запуска приложения.

Ключевая особенность по сравнению с XState/Stately Sketch: lite-fsm — это набор плоских машин на общей шине событий, а не одна иерархическая статечарт. Визуализатор не строит "большой граф системы" с permanent edges, а даёт inventory + контекстные связи + воркбенч на одну/несколько машин.

## 2. Аудитория

| Роль                            | Цель использования                                                      |
| ------------------------------- | ----------------------------------------------------------------------- |
| Разработчик lite-fsm-приложения | Отладка поведения, проверка веток, исследование чужого кода             |
| Архитектор / тимлид             | Обзорный аудит структуры (сколько машин, какие топики, перекосы связей) |
| Продукт-менеджер / QA           | Проход бизнес-кейсов по графу без чтения кода                           |

## 3. Положение в системе

```
[пользователь]
   │ paste source
   ▼
[Visualizer UI] ───► [Graph Compiler] ──► [LiteFsmGraphDocument (IR)]
       ▲                                            │
       │                                            ▼
       └──────── Symbolic Simulator + L1/L2/L3 views
```

Визуализатор не исполняет реальный `MachineManager` и не интерпретирует пользовательский код reducer/effect. Все ветки (guards, alt) — символические.

## 4. Главный поток (UX flow)

1. Пользователь открывает приложение → попадает на **Source editor** (landing-вкладка).
2. Вставляет/правит TS/JS-исходник в текстовое поле; по умолчанию загружен сэмпл.
3. Нажимает `▶ Open visualizer` → исходник передаётся в graph compiler → возвращается `LiteFsmGraphDocument`.
4. UI открывает **System (L1)** — inventory машин и топиков.
5. Пользователь переключается между вкладками `Source / System / Events / Machines`.
6. В любой момент возвращается в Source-редактор для правок и пере-компиляции.
7. На любой машине доступна кнопка `</>` — открывает фрагмент её исходника в overlay.

## 5. Терминология

| Термин             | Значение                                                 | В коде lite-fsm                     |
| ------------------ | -------------------------------------------------------- | ----------------------------------- |
| **Topic**          | event type (имя события)                                 | `FSMEvent.type`                     |
| **Producer**       | машина, эмитящая событие из effect                       | `effects: { ... }`                  |
| **Consumer**       | машина, подписанная на событие в текущем state           | `config[state][event]`              |
| **Branch**         | альтернативная ветка перехода (cfg) или эмиссии (effect) | reducer guard / alt-event           |
| **Routing**        | scope доставки события                                   | `meta.actorId / groupId / groupTag` |
| **Actor template** | машина с `__INIT` lifecycle, инстанцируемая динамически  | `groupTag`, `__INIT`, `__RESOLVED`  |
| **Domain machine** | без `__INIT`, единственный инстанс                       | обычная `createMachine`             |

Producer/Consumer/Topic — родная модель event-bus, удобная для не-разработчиков; в коде lite-fsm соответствует разделению на `effects` (производство) и `config` (потребление по подписке через текущий state).

## 6. Слой L1 — System Inventory

**Назначение**: верхнеуровневый обзор системы и контекстные связи без permanent edges (избегает hairball'а на N>10 машин).

Layout: 3 колонки.

| Колонка              | Содержит                                                      | Поведение                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Machines**         | список машин с kind, groupTag, счётчиками (states / in / out) | поиск; hover/select подсвечивает связанные топики                                                                                                                             |
| **Event Topics**     | список всех топиков с счётчиками (producers↑, consumers↓)     | поиск; hover/select подсвечивает связанные машины                                                                                                                             |
| **Selection Detail** | контекстная панель выбранной машины ИЛИ топика                | для машины: chips with consumed/emitted events, кнопки `→ open in workbench`, `</> view source`. Для топика: chips with producers/consumers, кнопка `→ open in event catalog` |

**Принцип**: рёбра не отрисовываются — связи проявляются только при выборе элемента.

## 7. Слой L2 — Event Catalog

**Назначение**: ответ на вопрос "кто пишет/читает топик X?".

Layout: 2 колонки.

| Колонка          | Содержит                                                                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Events list**  | тот же список, что в L1; поиск; клик → деталь                                                                                                                                                                                                                                                      |
| **Topic detail** | имя топика, общие counts, set used routing values; **Producers section**: для каждого — машина (кликабельна), source state, routing pill, optional `when` label; **Consumers section**: машина, source state, target(s) — для multi-branch edge показываются все через `\|` + badge `· N branches` |

## 8. Слой L3 — Machine Workbench

**Назначение**: пошаговая интерактивная проверка одной или нескольких машин.

Layout: 3 колонки.

### 8.1 Picker (левая)

- Чекбоксы для каждой машины — добавить/убрать из активного workbench'а.
- Кнопка `clear` (снять все).

### 8.2 Cards area (средняя)

Карточка на каждую активную машину.

- **Header**: kind, groupTag, имя, текущий `@STATE` (accent / terminal / initial styling), кнопка `</>` view source.
- **State blocks** (по одному на каждый state из config):
  - State header: имя state, badge (`initial` / `spawn` / `terminal`), pulse-индикатор для current state.
  - **Transition rows** (`cfg` / `reducer`): одна строка на каждую эффективную ветку перехода (guarded/reducer branches разворачиваются в N строк). Формат: `cfg EVENT → TARGET · when_label`.
  - **Eff-rows**: одна строка на каждую ветку effect-эмиссии. Формат: `eff may emit EVENT · when_label [routing-pill]`.
- Длинные state-блоки (>5 rows), не являющиеся current, автоматически collapsed; клик по header — раскрывает.
- **Transition rows в current state**: кликабельны (accent-зелёный border), если simulator считает branch available → инициируют transition.
- **Eff-rows в current state**: кликабельны (accent-фиолетовый border) только если simulator вернул emission из `getSuggestedEmissions()` → эмитят выбранную ветку. Initial-state effects до первого committed входа в это состояние показываются read-only.

### 8.3 Symbolic Simulator (правая)

- **Header**: индикатор `manual cascade` (для MVP), счётчик `N steps · viewing #K`, кнопка `reset`.
- **Hint**: краткая подсказка пользователю.
- **Send row**: dropdown со всеми event types, сгруппирован `available now (N)` / `not accepted in current states`; кнопка `send`.
- **Timeline**: список шагов сверху вниз. Каждый шаг:
  - Header: `#N`, event-name, source label (`external` / `manual · machineId` / `manual eff · machineId.state effect · branch_label`).
  - Effects: для каждой consumer-машины — `machineId fromState → toState · via_branch`. Если consumer'ов нет — строка `no selected machine accepts this event`.
- **Click по step → inspect mode**: подсвечивает на cards именно те rows, что сработали в этом step. Повторный клик снимает inspect.
- **Recently fired rows**: подсвечены orange (`is-active`) с короткой entrance-анимацией.

## 9. Source Editor & Source Overlay

### 9.1 Source Editor (landing tab)

- Большой моноширинный textarea на всю рабочую область.
- Default — сэмпл, демонстрирующий все возможности lite-fsm.
- Кнопки: `▶ Open visualizer` (компилирует и открывает L1), `reset to sample`.
- Hint под textarea: краткое описание контракта компилятора + ссылка на `GRAPH-COMPILER-SPEC.md`.

### 9.2 Per-machine Source Overlay

- Модальное окно поверх любого view.
- Открывается из: кнопки `</>` в card header (L3), chip `</> view source` в L1 selection detail.
- Содержимое: фрагмент исходника одной машины (только её `createMachine(...)` блок). В реальной реализации — из `sourceRange` метаданных в IR.
- Закрытие: кнопка `close · esc`, клик по backdrop, клавиша Esc.

## 10. Симулятор — Manual Mode (MVP)

### 10.1 Принцип

Один пользовательский клик = один dispatch. Эффекты на enter state **не запускаются автоматически** — пользователь сам выбирает что эмитить дальше, кликая eff-rows, которые simulator вернул как suggested emissions для текущего snapshot.

Это упрощение MVP. В реальной семантике lite-fsm эффекты автоматически срабатывают на enter; manual-режим — это отладочный pause для пошагового исследования. Auto-cascade — расширение post-MVP (см. §11.1).

Initial-state effects не предлагаются сразу после `start/reset`: они становятся кликабельными только после реального committed входа в состояние. UI не выводит dispatchability effect rows самостоятельно.

### 10.2 Routing semantics

Применяются при определении consumer'ов события:

- **Domain machines** получают всегда, если событие есть в config текущего state (routing meta лишь сужает выбор actor-инстансов).
- **Actor templates** фильтруются:
  - `default` / `unscoped` — все актор-шаблоны с событием в config;
  - `groupTag:X` — только акторы с `groupTag === X`;
  - `actor` / `actor[]` / `groupId` — over-approximation в MVP (real: scope конкретного instance).

### 10.3 Branches и overrides

- При transition row с reducer guards в auto-cascade выбирается первая ветка как default. Manual click пользователя по branch-row форсит конкретный target для этой машины; событие при этом рассылается всем остальным consumer'ам штатно.
- При external send из Send row нет origin-machine branch override: ambiguous consumers выбираются simulator-ом по default branch policy в стабильном порядке IR.
- При eff-emission с alt-branches manual click — единственный способ выбрать ветку.

### 10.4 Timeline

- Каждый шаг хранит: `event, source, consumed[] (с via-веткой), rowKeys` (что сработало в карточках).
- Не персистируется между сессиями.
- `reset` очищает timeline и возвращает все машины в `initial` state.

## 11. Архитектурные точки расширения (post-MVP)

MVP-архитектура **должна не препятствовать** добавлению нижеследующих фич. Это не входит в скоуп MVP, но определяет границы дизайна.

| Расширение                             | Что добавляется                                                                                                                                               | Критерий совместимости MVP                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **11.1 Auto-cascade mode**             | Toggle `cascade: auto / manual`. В auto эффекты на enter state queue'атся в очередь dispatch'а до пустой очереди.                                             | Режим передается через service/simulator options; manual click остается explicit origin dispatch.                           |
| **11.2 Scenarios**                     | Объект `SCENARIOS = { id: { label, requires, events } }` + кнопки в timeline-controls. Клик: auto-select машин + reset + последовательный send в forced-auto. | Сценарий = набор команд `GraphSimulationSession`, без отдельной simulation data shape.                                      |
| **11.3 Live re-compilation**           | Debounce при изменении textarea → перекомпиляция → UI обновляется.                                                                                            | UI инициализирован из IR; пере-инициализация — обычный rerender.                                                           |
| **11.4 Advanced diagnostics UX**        | Inline-маркеры в редакторе, группировка, быстрые переходы и richer diagnostic panel.                                                                            | MVP уже показывает базовую сводку/значки diagnostics из IR; расширение использует те же diagnostic refs и source anchors.  |
| **11.5 Per-instance actor simulation** | Список actor-инстансов с actorId, отдельные `currentStates` на инстанс, точная routing-фильтрация.                                                            | Состояние simulator и L3-команды адресуются через slice ids/`GraphSimulationSliceRef`; MVP downcast к `machineId` локален. |
| **11.6 Persistence / sharing**         | Сохранение source в localStorage; shareable URL с base64-encoded source.                                                                                      | Source хранится в одном месте (`EDITOR_SOURCE`), сериализация тривиальна.                                                  |

## 12. Out of MVP scope

| Не входит                                    | Причина                                                 |
| -------------------------------------------- | ------------------------------------------------------- |
| Реальное исполнение reducer/effect кода      | Symbolic-only по графу, см. graph compiler spec         |
| Резолвинг импортов из других файлов          | Compiler парсит одну строку без контекста               |
| Edit-time syntax highlighting / IntelliSense | Не критично для прототипа функциональности              |
| Auto-cascade и scenarios                     | См. extension points (§11.1, §11.2)                     |
| Multi-instance actor simulation              | См. §11.5                                               |
| Persistence / sharing                        | См. §11.6                                               |
| Code generation diagram → source             | Цель graph compiler в будущих версиях, не визуализатора |

## 13. Зависимости

- **`@lite-fsm/core`** — типы (`MachineConfig`, `MachineEffect`, `FSMEvent`, `MachineManagerSnapshot`).
- **Graph compiler** — контракт `строка исходника → LiteFsmGraphDocument`. См. [`GRAPH-COMPILER-SPEC.md`](GRAPH-COMPILER-SPEC.md). Visualizer работает только с IR, не имеет собственного парсера.
- **Graph view-model** — проекция IR в формат, удобный для UI (см. `packages/graph/src/view-model/`). Visualizer — потребитель view-model, не строит её сам.

## 14. Открытые вопросы для ТЗ

| #   | Вопрос                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Технологический стек: React (как существующий `apps/visualizer`)? Альтернативы?                                                      |
| 2   | Routing scope в симуляторе MVP: оставить over-approximation (быстро) или сразу делать честный actor-instance scope?                  |
| 3   | Source overlay vs full editor focus: оставить фрагмент машины в overlay или открывать редактор с курсором на этом блоке?             |
| 4   | Source как вкладка (текущий MVP) или отдельный route/page?                                                                           |
| 5   | Click по step в timeline: только подсветка rows (текущий MVP) или восстанавливать `currentStates` на момент step (true time-travel)? |
| 6   | Diagnostic UI: отдельная панель, banner или inline в редакторе?                                                                      |
| 7   | Performance budget: целевое количество машин в одном source без деградации UI?                                                       |
| 8   | i18n: только английский UI или плюс русский?                                                                                         |

## 15. Прототип-референс

Все описанные функции реализованы в [`./music-app-mvp-flow.html`](./music-app-mvp-flow.html). Это hardcoded демо без реального компилятора, но с полностью работающим UX flow. Используется как:

- **Visual reference** для дизайна интерфейса.
- **Behavioural reference** для семантики симулятора (manual cascade, branches, routing, timeline inspect).
- **Negative reference**: то, что в demo осознанно не сделано (multi-instance actors, auto-cascade, scenarios, syntax highlighting, persistence) — MVP реализации **тоже не должно делать**, это уйдёт в следующие итерации согласно §11.
