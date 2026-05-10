# Визуализатор Lite FSM: machine canvas board

Статус: черновик.

Документ описывает отдельное post-MVP улучшение visualizer-а: read-only
canvas board с диаграммой одного автомата. Реализуется после базовых
Source/L1/L2/L3 flows из [`GRAPH-VISUALIZER-STAGES-11-12-SPEC.md`](GRAPH-VISUALIZER-STAGES-11-12-SPEC.md),
не входит в Stage 12c-12f и не отменяет карточную L3-рабочую область.

Визуальная референция: [`machine-graph-rf.html`](machine-graph-rf.html).
Поведенческая база MVP: [`music-app-mvp-flow.html`](music-app-mvp-flow.html).

## Контекст

Уже реализованная база:

1. `@lite-fsm/graph` строит `LiteFsmGraphDocument` через
   `compileLiteFsmGraph(source, options?)`.
2. `selectMachineGraph(document, selector?)` выбирает машины поверх готового
   документа.
3. `analyzeLiteFsmGraph(document, options?)` добавляет semantic diagnostics.
4. `@lite-fsm/graph/simulator` владеет system-first symbolic simulation,
   event bus, routing, timeline и row refs.
5. `@lite-fsm/graph/view-model` строит `GraphVisualizerModel` и
   `GraphMachineWorkbenchModel` для L1/L2/L3.
6. `apps/visualizer` уже имеет app/workbench/source/services/diagnostics/
   console/codegen/validation/cards/canvas boundaries.
7. `apps/visualizer/src/canvas` сейчас является no-op boundary. Stage 12
   специально запрещает concrete canvas/React Flow/ELK в active MVP path.

Следствие: новая диаграмма должна подключаться как отдельный app-local renderer
после готовности Source/L1/L2/L3. Она не должна менять compiler, analyzer,
simulator semantics и не должна становиться третьим источником FSM-логики.

## Цель

Добавить дополнительный режим чтения конкретной машины:

```txt
L3 machine card -> open machine canvas -> read one machine as a state graph
```

Роль режимов:

1. L1 показывает систему машин и топиков.
2. L2 показывает event catalog и producer/consumer relations.
3. L3 карточки показывают строки машины, source anchors, capabilities и
   manual simulation.
4. Machine canvas показывает форму одного автомата: состояния, переходы,
   terminal states, wildcard transitions, loops, reducer branches и effect
   emissions.

Canvas board является read-only. Симуляции, dispatch, branch choice,
effect-follow и timeline в нем нет.

## Non-goals

1. Не реализовывать editable graph, drag/drop editing или codegen.
2. Не строить global multi-machine graph.
3. Не запускать simulator и не реализовывать transition/routing logic в UI.
4. Не добавлять public API в root `@lite-fsm/graph`.
5. Не дублировать L3-карточки как источник guards/source/effects деталей.
6. Не подключать React Flow/ELK до завершения базовых L1/L2/L3.

## Источник данных

Основной input:

```ts
type MachineCanvasInput = {
  model: GraphVisualizerModel;
  machineId: string;
};
```

Renderer adapter читает:

1. `model.workbenchMachines[machineId]` - states, rows, targets, guards,
   source anchors, diagnostics и badges.
2. `model.topics` и `model.relations` - producer/consumer контекст для event
   labels и popovers.
3. `WorkbenchCardModel` - карточный origin/actions, если canvas открывается из
   L3 card header.

Если для readable graph projection не хватает данных, сначала добавляется
app-local derived model в `apps/visualizer`. Публичный
`@lite-fsm/graph/view-model` расширяется только если новый contract нужен
нескольким UI-режимам и имеет стабильные domain refs.

## Архитектура

Предлагаемая структура:

```txt
apps/visualizer/src/
  canvas/
    machine-canvas-types.ts
    build-machine-canvas-model.ts
    layout-machine-canvas.ts
    machine-canvas-selectors.ts
  features/machines/
    MachineCanvasBoard.tsx
    MachineCanvasOverlay.tsx
```

Границы:

1. `build-machine-canvas-model.ts` - pure adapter из
   `GraphMachineWorkbenchModel` в renderer-agnostic graph model.
2. `layout-machine-canvas.ts` - renderer/layout adapter. Здесь допустимы ELK
   options, node sizes, label collision pass и edge geometry.
3. React Flow или другой renderer остается только в feature/canvas UI слое.
4. Workbench state хранит только `openedMachineCanvas?: { sourceVersion,
   machineId }`. Renderer ids, node ids и viewport не являются domain state.
5. Source edit, recompilation или stale `sourceVersion` закрывают canvas board.

## UI entrypoint

В L3 карточке добавляется отдельная кнопка в header рядом с source action:

```txt
[source] [graph]
```

Вся карточка не становится trigger-ом, потому что transition/effect rows уже
кликабельны для manual simulation.

Открытие:

1. Full-workspace overlay или board view поверх Machines tab.
2. Header: machine title, kind/groupTag/current state summary, counters, source
   action, close.
3. Body: canvas с fit/zoom controls, legend и detail popover/panel.
4. Закрытие: close button, Escape, optional backdrop.

## Визуальная модель

Nodes:

1. Реальные states из `GraphWorkbenchStateBlock`.
2. Terminal states визуально отличаются dashed/quiet outline.
3. Initial state получает `initial` badge.
4. Actor spawn state `__INIT` получает `spawn` badge.
5. Wildcard `*` рисуется как отдельный synthetic `any state` node, если есть
   wildcard rows.
6. Detached/unreachable states не должны выглядеть случайно потерянными:
   нужен badge `detached`, `unreachable` или отдельная detached lane.

Edges:

1. `config` transitions - основной solid path.
2. `reducer` branches - branch overlays или grouped alternatives для того же
   accepted event.
3. `effect` emissions - secondary dashed emission paths/annotations. Они не
   должны выглядеть как прямое изменение состояния.
4. Self loops рендерятся отдельной предсказуемой геометрией.
5. Параллельные edges группируются по `(source, target, semantic kind)`.
6. Wildcard edges идут из `any state` synthetic node, а не дублируются N раз.

## Guards и labels

Guard/when text из IR нужно использовать, но не перегружать canvas.

Правило отображения:

1. На edge label всегда виден `eventType`.
2. Короткий guard может отображаться inline: `AUTH_RESPONSE · success`.
3. Длинный guard сворачивается в chip `guard` или `+N`.
4. Полный guard/when text показывается в hover и click-to-pin detail.
5. Для reducer branches показывать default/guarded semantics:
   `default`, `invalid credentials`, `network error`, etc.
6. Для grouped labels показывать первый event и count suffix: `EVENT +3`.

## Progressive detail

Canvas показывает форму, детали раскрываются слоями:

1. Hover edge - подсветить edge, source node и target node, остальное приглушить.
2. Hover state - подсветить incoming и outgoing edges разными оттенками.
3. Click edge - закрепить detail panel/popover с:
   - event type;
   - layer: `config`, `reducer`, `effect`;
   - source state и target;
   - guard/when;
   - routing для effect emissions;
   - source anchor action;
   - diagnostics, если есть.
4. Click state - закрепить список входящих/исходящих transitions и emissions.
5. Detail panel не dispatch-ит события и не мутирует simulation.

## Читаемость

Обязательные улучшения поверх прототипа:

1. Legend для цветов, dashed/solid semantics и wildcard node.
2. Понятные counters внутри state node или tooltips к ним. Не оставлять
   нерасшифрованные точки и числа.
3. Stable label collision pass для dense machines.
4. Long labels wrap/truncate предсказуемо без horizontal page overflow.
5. Fit view после layout и после первого измерения DOM nodes.
6. Zoom controls остаются доступны с клавиатуры.
7. `prefers-reduced-motion` не должен влиять на читаемость.
8. Empty/error states: missing machine, stale source, layout failed,
   unsupported renderer.

## Dependency policy

React Flow/ELK можно добавить только в этом post-MVP этапе:

1. Dependencies остаются app-local в `@lite-fsm/visualizer`.
2. `@lite-fsm/graph` не импортирует React Flow, ELK, DOM или canvas modules.
3. Canvas renderer лучше lazy-load-ить при первом открытии board-а.
4. Stage 12f должен продолжать проверять, что базовый MVP path не содержит
   concrete canvas renderer.

## Порядок реализации

Реализовывать после завершения Stage 12c-12f.

1. Обновить `apps/visualizer/DESIGN.md`: разрешить post-MVP machine canvas
   board и описать legend/detail behavior.
2. Расширить canvas state типами opened board, но не добавлять renderer ids в
   domain state.
3. Добавить pure `buildMachineCanvasModel(...)` поверх
   `GraphMachineWorkbenchModel`.
4. Покрыть adapter unit-тестами: initial, terminal, wildcard, self loop,
   reducer branches, folded reducer ids, effect emissions, unknown/dynamic
   targets, detached states, diagnostics/source anchors.
5. Добавить layout adapter и renderer.
6. Добавить L3 card header action `open graph`.
7. Добавить overlay/board, legend, hover highlight, click-to-pin detail.
8. Добавить stale source close behavior.
9. Добавить e2e: открыть из L3, закрыть, inspect edge/state, source action,
   dense machine без overflow, source edit закрывает board.

## Проверка

Минимальный набор:

```txt
pnpm --filter @lite-fsm/visualizer check-types
pnpm --filter @lite-fsm/visualizer test:unit
pnpm --filter @lite-fsm/visualizer test:e2e
```

Если меняется public API `@lite-fsm/graph/view-model`, дополнительно:

```txt
pnpm run test:types
pnpm run check-types
```

Docs build и команды, которые транзитивно запускают docs build, агент не
запускает.
