# Machine Canvas Board: Post-MVP ТЗ

## 1. Назначение

Post-MVP расширяет завершенный MVP Machine Canvas Board:

- detailed inspection;
- pinning;
- source actions;
- simulation overlay;
- density-aware visual hardening;
- keyboard inspection;
- production E2E coverage.

Все расширения строятся поверх MVP Machine Flow Model, board state, selectors и
renderer extension points.

## 2. Общие требования

### 2.1 Архитектура

- Post-MVP не меняет границы владения MVP.
- Graph semantics остаются в `packages/graph/view-model`.
- Post-MVP не добавляет второй compiler/analyzer.
- Post-MVP не читает raw graph document, source text, AST, React components или
  DOM для восстановления semantics.
- React Flow, ELK, DOM, canvas, viewport и measured sizes остаются только в
  `apps/visualizer`.
- Detail panel, simulation overlay и source actions строятся поверх semantic
  ids, row refs и source anchors из Machine Flow Model.
- App state хранит semantic pinned/focused ids, но не renderer ids,
  coordinates, edge paths или DOM measurements.
- `buildMachineFlowModel`, board state и renderer расширяются через MVP
  pipeline/registry/builder functions.

### 2.2 Product behavior

- Canvas остается read-only и не dispatch-ит FSM events.
- L3 остается владельцем manual simulator session и event dispatch.
- Canvas отражает existing simulation session поверх graph.
- Source actions используют существующую команду `source.overlay.opened`.
- Source edit, compile reset/failure, model failure и missing machine
  продолжают закрывать board или переводить его в controlled empty state.

### 2.3 Public API и справочники

- При изменении public types или exports обновить:
  - `tests/types/graph-view-model-api.tst.ts`;
  - `API-CHEATSHEET.md`;
  - `TYPES-CHEATSHEET.md`.
- Root export из `@lite-fsm/graph` не добавлять.

## 3. Этап 1. Machine Flow Model extensions

Домен: semantic data для detail, diagnostics, simulation overlay и real-world
cases.

Цель: расширить MVP Machine Flow Model без renderer concerns.

### 3.1 Pipeline extensions

Расширять существующие MVP владельцы:

- `FlowBuildContext`;
- target resolver registry;
- producer classifier;
- node role rules;
- edge grouping key rules;
- row/source attachment rules;
- legend builder;
- simulation flag attachment;
- density input counters.

Запрещено дублировать target/producer classification в renderer, detail
builders, selectors или JSX.

### 3.2 Wildcard effect detail

- Wildcard effect рендерится отдельным producer node.
- Wildcard effect не смешивается с wildcard state node.
- Wildcard effect не раскрывается fan-out из каждого real state.
- Detail показывает applicability к любому current state.
- Lifecycle detail показывает emitting effect row и accepted transition row.
- Wildcard config consumer сохраняет `via *` или `via any state`.
- Multiple emitted events сохраняют grouped rows, target labels, routing
  labels, guards, confidence и source anchors.
- Emission-only wildcard effects показывают routing/producer context без
  transition edge.

### 3.3 Emission-only detail и routing

- MVP `emission-only` groups остаются `MachineFlowEdgeGroup` без
  `targetNodeId`.
- Post-MVP добавляет routing/producer detail без изменения base
  classification.
- Routed emission-only groups не создают local state edge автоматически.
- Optional short annotations допускаются только как density-aware renderer
  extension; groups остаются targetless.
- Routing details сохраняют `self`, `actorId`, `groupId`, `groupTag`,
  dynamic/unknown labels и confidence.
- External side effects, persistence, router work, analytics и imperative
  updates остаются chips/detail без concrete emitted event.

### 3.4 Reducer alternatives и guards

- Context/payload-dependent reducer branches сохраняются в detail.
- Reducer override detail различает `config target` и `reducer override`.
- Folded reducer details используют `GraphConfigRow.foldedReducerTransitionIds`.
- `GraphConfigRow.foldedReducerRows` добавляется только при обязательном full
  guard/target detail requirement.
- Unknown branch confidence сохраняется явно.

### 3.5 Diagnostics, unknowns, actor и metadata

- Diagnostics прикрепляются к machine, state, edge group или row detail.
- Diagnostics не создают transition edges.
- Unknown rows видимы в detail и counters.
- Unknown targets создают compact synthetic nodes только при visible row
  reference.
- Renderer layout diagnostics не меняют Machine Flow semantics.
- Actor template canvas остается template-level.
- Global multi-machine edges не рисуются в single-machine canvas.
- Context-scoped behavior показывается через compact badges/detail при наличии
  данных во view-model.
- Single-state machines с множеством handled events группируют self loops по
  semantic edge kind.
- Persistence и hydration/dehydration являются metadata, не transition edges.

### 3.6 Simulation flags

- Public type extension добавляет node stats:
  - `availableRows`;
  - `suggestedRows`.
- Public type extension добавляет `MachineFlowEdgeGroup.simulation`:
  - `available`;
  - `suggested`;
  - `recentlyFired`;
  - `inspected`.
- Прикреплять simulation flags к row refs и edge groups:
  - `available`;
  - `suggested`;
  - `recentlyFired`;
  - `inspected`.
- Grouped edge получает flag, если хотя бы один row внутри group имеет flag.
- Detail сохраняет row-level flags.

### 3.7 Row detail refs

MVP `MachineFlowRowRef` расширяется или дополняется
`MachineFlowRowDetailRef`. Detail refs строятся в Machine Flow Model pipeline.

Requirements:

- Сохранять discriminated union.
- Не добавлять fake fields для diagnostic/unknown rows.
- Config/reducer rows: `transitionId`, `acceptedTransitionId`,
  `sourceStateId`, `sourceStateKey`, target summary, guard/condition summary,
  folded reducer ids.
- Effect rows: `emissionId`, `sourceStateId?`, `sourceStateKey`, routing
  summary, guard/when summary, emitted event type.
- Self-emitted lifecycle edge: row roles для emitting effect row и accepted
  transition row.
- Wildcard consumer: `via *` / `via any state` без renderer-side inference.
- Grouped edge: row-level simulation flags и source actions.
- Diagnostics/unknown rows: own identity, severity/reason, confidence и
  anchors.

### 3.8 Density inputs

- Machine Flow Model предоставляет counts/refs, нужные renderer density policy.
- Density level остается renderer-owned: `normal`, `dense`, `very-dense`.
- `normal`: accepted transitions и self-emitted lifecycle edges видимы;
  optional annotations разрешены для emission-only effects.
- `dense`: accepted и self-emitted edges видимы; emission-only effects folded
  into source-node chips/detail.
- `very-dense`: lifecycle shape видима; labels группируются агрессивно;
  emission-only effects folded.
- State node, участвующий в visible transition, не скрывается.
- Self-emitted lifecycle edges не скрываются раньше emission-only annotations.

### 3.9 Тесты этапа 1

- Unit: wildcard effect detail показывает `via *`.
- Unit: wildcard effect detail сохраняет emitting row и accepted row.
- Unit: emission-only detail сохраняет routing/producer context.
- Unit: expanded row refs сохраняют transition/emission ids, source state,
  routing/guard summaries и lifecycle row roles.
- Unit: dynamic, blocked и unknown synthetic targets.
- Unit: diagnostics и source anchors.
- Unit: density thresholds.
- Unit: single-state service machines.
- Unit: context-scoped/persistence badges при наличии данных.
- Unit: simulation flags на rows и grouped edges.

## 4. Этап 2. Canvas state и selectors

Домен: pinned state, detailed selectors, source actions и simulation overlay
projection.

Цель: добавить app-local detail state без renderer state в workbench.

### 4.1 Pinned item state

```ts
type MachineCanvasPinnedItem =
  | { kind: "state"; nodeId: string }
  | { kind: "edge-group"; groupId: string }
  | { kind: "row"; rowId: string }
  | { kind: "diagnostic"; diagnosticId: string };

type MachineCanvasBoardState = {
  sourceVersion: number;
  machineId: string;
  pinned?: MachineCanvasPinnedItem;
};
```

Requirements:

- Hover item не хранится в reducer state.
- Hover остается renderer-local.
- Pin хранит только semantic item.

### 4.2 Commands

- Добавить `canvas.machine-board.item-pinned`.
- Pin обновляет semantic pinned item.
- Pin очищается при close и source/model invalidation.
- Pin сохраняется при unrelated commands.
- Если pinned item исчез после recompile, selector возвращает unpinned detail
  state.

### 4.3 Selector extensions

- `selectMachineCanvasBoard` добавляет pinned detail state.
- Graph source anchors мапятся на existing source actions.
- Selector не переинтерпретирует graph semantics.
- Selector не перестраивает edge groups.
- Selector output сохраняет refs при изменении unrelated slices:
  - console open/close;
  - L1 hover;
  - L2 query;
  - source overlay open/close.
- Selector output обновляется при изменении:
  - visualizer model;
  - canvas board state;
  - simulation overlay;
  - inspected timeline step;
  - selected machine removal after recompile.

### 4.4 Тесты этапа 2

- Reducer: pin обновляет semantic item.
- Reducer: close очищает pinned item.
- Reducer: source edit очищает pinned item.
- Selector: mapping для source action.
- Selector: pinned state detail.
- Selector: pinned edge group detail.
- Selector: stale pinned item -> unpinned detail.
- Selector: referential stability.
- Selector: simulation overlay updates.
- Selector: inspected timeline row highlight.

## 5. Этап 3. Detail panel shell

Домен: React shell, detail panel и source action wiring.

Цель: добавить секционную detail panel без вычисления graph semantics в JSX.

### 5.1 Detail view contract

Detail panel использует единый view format. Type names следуют local
conventions при сохранении формы contract.

```ts
type MachineCanvasDetailView = {
  title: string;
  subtitle?: string;
  badges: readonly MachineCanvasDetailBadge[];
  sections: readonly MachineCanvasDetailSection[];
  sourceActions: readonly MachineCanvasSourceAction[];
  diagnostics: readonly MachineCanvasDiagnosticView[];
};

type MachineCanvasDetailSection =
  | { kind: "summary"; rows: readonly MachineCanvasDetailKeyValue[] }
  | { kind: "events"; events: readonly MachineCanvasDetailEvent[] }
  | { kind: "rows"; rows: readonly MachineCanvasDetailRow[] }
  | { kind: "routing"; values: readonly MachineCanvasDetailKeyValue[] }
  | { kind: "guards"; guards: readonly MachineCanvasDetailGuard[] }
  | { kind: "producers"; producers: readonly MachineCanvasDetailProducer[] }
  | { kind: "diagnostics"; diagnostics: readonly MachineCanvasDiagnosticView[] }
  | { kind: "source"; actions: readonly MachineCanvasSourceAction[] };
```

UI рендерит готовые sections.

### 5.2 Detail builders

Обязательные builders:

- state detail;
- edge group detail;
- row detail;
- diagnostic detail;
- empty/unpinned detail.

Каждый builder возвращает один `MachineCanvasDetailView`. Shared helpers для
source actions, diagnostics, badges и key-value rows допускаются при двух и
более usage sites.

### 5.3 Board shell additions

- Header содержит source action.
- Body содержит detail panel area.
- Detail panel сворачивается при недостаточной ширине.
- На узких ширинах detail panel открывается как controlled inline drawer или
  bottom panel.
- Mouse click pins graph item.
- Keyboard equivalent для focusable graph items реализуется в этапе 5.

### 5.4 Source actions

- Source action использует `source.overlay.opened`.
- Source action disabled при отсутствующих или неоднозначных anchors.
- Закрытие source overlay не закрывает canvas board.
- Source edit закрывает canvas board через invalidation.

### 5.5 Тесты этапа 3

- Component: detail panel рендерит unpinned state.
- Component: detail panel рендерит state detail.
- Component: detail panel рендерит edge detail.
- Component: source action dispatch-ит source overlay command.
- Component: missing source anchors показывают disabled action.

## 6. Этап 4. Renderer extensions

Домен: density rendering, advanced visual grammar, detail/pin integration и
layout hardening.

Цель: расширить MVP renderer без изменения Machine Flow semantics.

### 6.1 Density rendering

Thresholds:

```txt
normal: states <= 12 и visible edges <= 40
dense: states <= 30 и visible edges <= 120
very-dense: выше dense thresholds
```

- Normal mode рисует accepted и self-emitted lifecycle edges; emission-only
  effects остаются source-node chips/counters и optional annotations.
- Dense mode fold-ит emission-only effects в source-node chips/detail.
- Very-dense mode сохраняет lifecycle shape и агрессивно группирует labels.
- Thresholds покрыты unit tests.

### 6.2 Wildcard effect visual hardening

- Legend/detail различает wildcard effect node и wildcard state node.
- Wildcard effect lifecycle edges сохраняют dashed green grammar во всех
  density modes.
- Wildcard effect labels и chips читаемы в dense/very-dense graphs.
- Wildcard effect hover/click states подсвечивают producer node, consumer target
  и grouped rows.

### 6.3 Emission-only rendering

- `emission-only` groups render as chip/detail by default.
- Optional short dashed annotation разрешена только как density-aware
  enhancement.
- Renderer сохраняет groups targetless.
- State-to-state edge для emission-only не создается.
- В dense/very-dense mode emission-only folded в source-node chips/detail.

### 6.4 Highlight state

Highlight state строится pure function:

```txt
hovered/pinned/focused item
+ MachineFlowModel
+ simulation flags
-> highlight state для nodes и edges
```

Hover, click, current, available, suggested, recently fired и inspected states
не вычисляются ad hoc внутри React markup.

### 6.5 Layout hardening

- Повторять fit view после DOM node measurement, когда measured sizes меняют
  graph bounds.
- Layout debounce on machine change добавляется при дорогом layout.
- Repeated/blocking layout diagnostics контролируемые и не приводят к crash.
- Edge label collision pass не двигает labels за viewport.
- Long guards/details читаются в detail panel.

### 6.6 Тесты этапа 4

- Unit: density thresholds.
- Unit: highlight-state builder.
- Component: wildcard state/effect nodes различимы.
- Component: emission-only chips/detail видимы.
- Component: pinned item меняет highlight state.
- Component: layout failure показывает controlled state.

## 7. Этап 5. Interaction, simulation overlay и E2E

Домен: user behavior, accessibility, simulation highlights и test matrix.

Цель: довести board до production-ready фичи.

### 7.1 State inspection

Hover state:

- Подсветить node.
- Подсветить incoming edges.
- Подсветить outgoing edges отдельным tone.
- Приглушить unrelated graph elements.
- Показать compact hover title при truncated label.

Click state:

- Pin detail panel.
- Показать state key.
- Показать badges.
- Показать diagnostics.
- Показать source action.
- Показать incoming transitions.
- Показать outgoing transitions.
- Показать emissions.
- Показать current flag.
- Показать available outgoing transition count.
- Показать suggested emission count.
- Показать recently fired row refs.

### 7.2 Edge inspection

Hover edge:

- Подсветить edge path и label.
- Подсветить source и target nodes.
- Показать compact preview с first event.
- Показать count.
- Показать edge kind.
- Показать producer category.
- Показать guard summary.

Click edge:

- Pin detail panel.
- Показать grouped events и rows.
- Показать layer facts для config/reducer/effect.
- Показать source и target.
- Показать routing.
- Показать guard/when.
- Показать source anchors.
- Показать diagnostics.
- Показать producer/consumer context из Machine Flow detail refs.
- Для self-emitted transition показать emitting effect row и accepted
  transition row.

### 7.3 Simulation overlay

Когда L3 simulator session существует:

- Current state node использует semantic current-state tone.
- Available config/reducer edges выделяются.
- Suggested self-emitted lifecycle edges выделяются.
- Suggested emission-only effects выделяются как chips/detail.
- Recently fired rows получают temporary accent class.
- Inspected timeline step подсвечивает matching row refs.

Когда simulator session отсутствует:

- Static graph остается usable.
- Header показывает `simulation idle`.
- Canvas не показывает dispatch controls.

### 7.4 Accessibility и keyboard

- Graph action доступен с клавиатуры.
- Close action доступен с клавиатуры.
- Zoom controls управляются с клавиатуры.
- Click-to-pin имеет keyboard equivalent для focusable graph items.
- Custom nodes/labels имеют accessible names.
- Hover-only data доступна через click-to-pin.
- Long guards/details читаются без hover.

### 7.5 E2E coverage

- Открыть compiled source.
- Скомпилировать visualizer.
- Выбрать machine в L3.
- Открыть graph board.
- Проверить state nodes.
- Проверить edge labels.
- Проверить dashed green self-emitted lifecycle edges.
- Проверить, что wildcard state и wildcard effect nodes различимы.
- Проверить wildcard effect lifecycle detail с `via *`.
- Проверить current state highlight до и после event dispatch в L3.
- Кликнуть edge label и проверить detail panel.
- Использовать source action из detail.
- Закрыть source overlay.
- Закрыть canvas board.
- Проверить, что source edit закрывает canvas board.
- Проверить dense fixture: нет horizontal overflow, graph видим после fit view.

### 7.6 Fixture matrix extension

Post-MVP использует MVP fixture matrix и добавляет проверки:

- detail expansion;
- pinning;
- source actions;
- simulation overlay;
- keyboard inspection;
- density hardening.

Post-MVP fixtures не становятся runtime demo data.

### 7.7 Post-MVP acceptance criteria

- Grouped edges имеют detail expansion.
- Producer category видима через legend/detail.
- Dashed green lifecycle edges имеют click-to-pin detail.
- Wildcard effect detail показывает producer node и consumer target.
- Wildcard effect hover/click states показывают grouped emitted events.
- Emission-only groups видимы как node chips/detail.
- Actor templates показывают `__INIT`, terminal states и routing metadata без
  per-instance nodes.
- Technical row/source/routing details доступны через hover/detail.
- Simulation overlay подсвечивает current, available, suggested, inspected и
  recently fired rows.
- Source action из detail открывает existing source overlay.
- Keyboard users могут открыть board, закрыть board, использовать zoom controls
  и инспектировать focusable graph items.
- Dense и real-world machines остаются читаемыми.
- Post-MVP features добавлены поверх MVP architecture без полного переписывания.
