# Machine Canvas Board: лог реализации

Короткий изменяемый лог для реализации:

- [`GRAPH-VISUALIZER-MACHINE-CANVAS-MVP-SPEC.md`](GRAPH-VISUALIZER-MACHINE-CANVAS-MVP-SPEC.md)
- [`GRAPH-VISUALIZER-MACHINE-CANVAS-POST-MVP-SPEC.md`](GRAPH-VISUALIZER-MACHINE-CANVAS-POST-MVP-SPEC.md)

Не переносить сюда полный текст требований. Этот файл нужен только для
текущего фокуса, короткого чеклиста прогресса, списка измененных файлов,
команд проверки, решений, отложенных пунктов и заметок для передачи контекста.

## Статусы

```txt
[ ] к выполнению
[~] в работе
[x] выполнено
[!] заблокировано
[-] отложено с причиной
```

Пункт можно отмечать `[x]` только после реализации и проверки либо после
явной записи, почему проверка невозможна в текущем этапе.

## Текущий фокус

```txt
Этап: Post-MVP visual refactor. Node labels и metadata badges
Статус: [x] выполнено
Обновлено: 2026-05-13
Заметка: Имена состояний вынесены из одной строки с role badges, nodes
растут до 420px и переносят label; высота учитывает wrapped badge/stat rows;
in/out/loop стали нейтральными visual counters с direction glyphs; edge
labels учитывают state node obstacles.
```

## Чеклист этапов

- [x] Подготовка: отделить лог реализации от стабильного ТЗ.
- [x] MVP этап 1: Machine Flow Model в `packages/graph/view-model`.
- [x] MVP этап 2: состояние canvas и selectors в visualizer.
- [x] MVP этап 3: интеграция L3 board shell.
- [x] MVP этап 4: renderer на React Flow и ELK.
- [x] MVP этап 5: hardening и проверки.
- [ ] Post-MVP этап 1: расширение Machine Flow Model.
- [ ] Post-MVP этап 2: pinned state, selectors и source actions.
- [ ] Post-MVP этап 3: detail panel shell.
- [ ] Post-MVP этап 4: renderer extensions.
- [ ] Post-MVP этап 5: simulation overlay, accessibility и test matrix.

## Лог действий

Новые записи добавлять сверху.

```txt
2026-05-13
- Визуальный рефакторинг Machine Canvas node cards: state label теперь
  занимает собственную строку и переносится вместо ellipsis; role badges
  вынесены в отдельную metadata row.
- `in`, `out`, `loop` заменены на нейтральные `← IN`/`→ OUT`/`↺ LOOP`
  counters, чтобы не пересекаться с edge semantic colors; wildcard `*`
  сохраняет увеличенный symbol treatment через `data-node-label-kind`.
- Render policy увеличивает max node width до 420px и рассчитывает высоту по
  label lines, wrapped badge/stat rows, emission rows и side degree;
  `apps/visualizer/DESIGN.md` обновлен под новый контракт.
- Edge label collision resolver теперь учитывает node boxes как obstacles и
  сдвигает labels по route `t`, чтобы они не попадали под карточки состояний.

2026-05-13
- Реализован MVP stage 5 hardening: добавлены compiled fixtures для compact
  onboarding и inline xstate-like source, matrix tests поверх
  `compileLiteFsmGraph` -> `buildGraphVisualizerModel` ->
  `buildMachineFlowModel` -> render draft.
- Усилены component tests для read-only React Flow props, edge direction
  metadata, zoom controls, long labels и кликов по graph items без dispatch.
- Добавлен E2E Machine Canvas hardening spec без screenshot snapshots:
  wildcard state/effect, self loop, grouped `+N`, self-emitted edges,
  emission-only chips, actor template, hover popover, close, source
  invalidation и horizontal overflow assertions.

2026-05-13
- Финальное review/hardening этапа 4: strict coverage расширен на
  `MachineCanvasGraph.tsx`; layout cancellation, stale layout state, fallback
  self-loop geometry и renderer metadata вынесены в тестируемые view helpers.
- Добавлены regression tests для Graph renderer popover bounds, fallback
  badges/semantic refs, same-flow layout key reuse и fit-view cleanup.

2026-05-13
- Реализован Machine Canvas renderer: lazy `MachineCanvasGraph`, React Flow
  static graph, ELK layered layout, custom state nodes, grouped edge labels,
  manual self loops, emission-only source chips, legend и hover popover.
- Добавлены pure renderer policy/geometry/layout modules с 100% coverage и
  focused component/E2E tests для renderer smoke.

2026-05-13
- Финальное review/hardening этапа 3: добавлены regression tests для Escape
  cleanup, Shell controlled missing states, нескольких graph actions и
  renderer-placeholder boundaries; `MachineCanvasBoard` label logic упрощена.

2026-05-13
- Реализован L3 board shell: machine card graph action dispatch-ит
  `canvas.machine-board.opened`, Shell подключает `selectMachineCanvasBoard`,
  Machines tab рендерит full-workspace `MachineCanvasBoard` overlay.
- Board shell показывает ready/missing-model/missing-machine states, header из
  `MachineFlowMachine`, close action и Escape close без изменения L3 selection
  или simulator session.
- Добавлены stable `VISUALIZER_TEST_IDS.canvas.*` и component/Shell tests.

2026-05-13
- Финальное hardening/review этапа 2: добавлены tests для canvas helpers,
  reducer edge cases, selector current/no-current paths и прежних UI coverage
  gaps.
- Удалены dead private branches в `SystemPanel` и unreachable
  `compileStatusLabel("blocked")`; `closeMachineBoard` теперь удаляет optional
  `machineBoard` field вместо записи `undefined`.

2026-05-13
- Реализован app-level Machine Canvas Board state: `sourceVersion`,
  `machineId`, adapter `machine-canvas` и pure open/close/invalidation helpers.
- Добавлены workbench commands `canvas.machine-board.opened/closed`,
  controlled failures `missing-model` / `missing-machine` и invalidation на
  source edit, compile reset/failure и model failure.
- Добавлен selector `selectMachineCanvasBoard`, который вызывает
  `buildMachineFlowModel` и возвращает controlled states без renderer/layout
  данных.
- Добавлены focused reducer и selector tests для MVP этапа 2.

2026-05-13
- Финальное ревью: убраны мертвые internal fields, `EdgeDraft.rows`
  сужен до edge-producing row refs, `MachineFlowEdgeGroup.diagnostics`
  заполняется из topic diagnostics.
- Добавлен regression test на topic diagnostics и на то, что
  diagnostic/unknown rows не становятся edge rows.

2026-05-13
- Усилено покрытие `machine-flow*`: убраны `v8 ignore`, добавлены cases для
  current fallback, role priority, reducer-only layer, empty topics,
  producer metadata fallback и deterministic encoded semantic ids.

2026-05-13
- Реализован `buildMachineFlowModel` как renderer-agnostic projection поверх
  `GraphVisualizerModel`.
- Добавлены semantic ids, Machine Flow public types, grouping, producer
  classification, target resolving, lifecycle pairing и node stats.
- Добавлены package-local graph unit/coverage scripts для `machine-flow*`.

```

## Измененные файлы

Добавлять файлы по этапам по мере работы.

```txt
Visual refactor
- apps/visualizer/src/canvas/machine-canvas-render-policy.ts
- apps/visualizer/src/canvas/machine-canvas-render-policy.test.ts
- apps/visualizer/src/canvas/machine-canvas-geometry.ts
- apps/visualizer/src/canvas/machine-canvas-geometry.test.ts
- apps/visualizer/src/canvas/layout-machine-canvas.ts
- apps/visualizer/src/canvas/layout-machine-canvas.test.ts
- apps/visualizer/src/features/machines/MachineCanvasGraph.tsx
- apps/visualizer/src/features/machines/MachineCanvasGraph.test.tsx
- apps/visualizer/src/styles.css
- apps/visualizer/tests/e2e/machine-canvas.spec.ts
- apps/visualizer/DESIGN.md
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md


Подготовка
- GRAPH-VISUALIZER-MACHINE-CANVAS-MVP-SPEC.md
- GRAPH-VISUALIZER-MACHINE-CANVAS-POST-MVP-SPEC.md
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md

MVP этап 1
- packages/graph/src/view-model/machine-flow.ts
- packages/graph/src/view-model/machine-flow-types.ts
- packages/graph/src/view-model/machine-flow-ids.ts
- packages/graph/src/view-model/index.ts
- packages/graph/package.json
- packages/graph/vitest.config.ts
- tests/graph/machine-flow.test.ts
- tests/types/graph-view-model-api.tst.ts
- API-CHEATSHEET.md
- TYPES-CHEATSHEET.md
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md

MVP этап 2
- apps/visualizer/src/canvas/types.ts
- apps/visualizer/src/canvas/noop-adapter.ts
- apps/visualizer/src/canvas/noop-adapter.test.ts
- apps/visualizer/src/canvas/index.ts
- apps/visualizer/src/canvas/machine-canvas-selectors.ts
- apps/visualizer/src/canvas/machine-canvas-selectors.test.ts
- apps/visualizer/src/features/events/EventCatalogPanel.test.tsx
- apps/visualizer/src/features/machines/MachinesPanel.test.tsx
- apps/visualizer/src/features/shell/Shell.tsx
- apps/visualizer/src/features/shell/Shell.test.tsx
- apps/visualizer/src/features/system/SystemPanel.tsx
- apps/visualizer/src/features/system/SystemPanel.test.tsx
- apps/visualizer/src/ui/visualizer.test.tsx
- apps/visualizer/src/workbench/types.ts
- apps/visualizer/src/workbench/reducer.ts
- apps/visualizer/src/workbench/machine-canvas-reducer.test.ts
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md

MVP этап 3
- apps/visualizer/src/features/machines/MachineCanvasBoard.tsx
- apps/visualizer/src/features/machines/MachineCanvasBoard.test.tsx
- apps/visualizer/src/features/machines/MachinesPanel.tsx
- apps/visualizer/src/features/machines/MachinesPanel.test.tsx
- apps/visualizer/src/features/shell/Shell.tsx
- apps/visualizer/src/features/shell/Shell.test.tsx
- apps/visualizer/src/test-ids.ts
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md

MVP этап 4
- apps/visualizer/package.json
- pnpm-lock.yaml
- apps/visualizer/src/canvas/machine-canvas-render-types.ts
- apps/visualizer/src/canvas/machine-canvas-render-policy.ts
- apps/visualizer/src/canvas/machine-canvas-render-policy.test.ts
- apps/visualizer/src/canvas/machine-canvas-geometry.ts
- apps/visualizer/src/canvas/machine-canvas-geometry.test.ts
- apps/visualizer/src/canvas/layout-machine-canvas.ts
- apps/visualizer/src/canvas/layout-machine-canvas.test.ts
- apps/visualizer/src/features/machines/MachineCanvasGraph.tsx
- apps/visualizer/src/features/machines/MachineCanvasGraph.test.tsx
- apps/visualizer/src/features/machines/machine-canvas-graph-view.ts
- apps/visualizer/src/features/machines/machine-canvas-graph-view.test.ts
- apps/visualizer/src/features/machines/MachineCanvasBoard.tsx
- apps/visualizer/src/features/machines/MachineCanvasBoard.test.tsx
- apps/visualizer/src/test-ids.ts
- apps/visualizer/src/styles.css
- apps/visualizer/vitest.config.ts
- apps/visualizer/tests/e2e/shell.spec.ts
- apps/visualizer/DESIGN.md
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md

MVP этап 5
- apps/visualizer/tests/fixtures/machine-canvas-sources.ts
- apps/visualizer/src/canvas/machine-canvas-fixture-matrix.test.ts
- apps/visualizer/src/features/machines/MachineCanvasGraph.tsx
- apps/visualizer/src/features/machines/MachineCanvasGraph.test.tsx
- apps/visualizer/src/features/machines/MachineCanvasBoard.test.tsx
- apps/visualizer/tests/e2e/machine-canvas.spec.ts
- GRAPH-VISUALIZER-MACHINE-CANVAS-IMPLEMENTATION-LOG.md
```

## Лог проверок

Новые записи добавлять сверху.

```txt
2026-05-13
- PASS `pnpm --filter @lite-fsm/visualizer check-types`
- PASS `pnpm --filter @lite-fsm/visualizer exec vitest run --config vitest.config.ts src/canvas/machine-canvas-render-policy.test.ts src/features/machines/MachineCanvasGraph.test.tsx`
  `src/canvas/machine-canvas-geometry.test.ts src/canvas/layout-machine-canvas.test.ts`
  — 4 files, 19 tests.
- PASS `agent-browser` visual check at `http://127.0.0.1:5174/` on sample
  `trackInstance` actor and onboarding fixture: full node labels visible,
  wrapped badges fit node height, neutral direction counters do not reuse edge
  colors; onboarding returned 6 state nodes, 7 edge labels and `[]` overlaps.
- PASS `pnpm --filter @lite-fsm/visualizer test:coverage` — 33 files,
  213 tests, 100% statements/branches/functions/lines
  (1820 statements, 1184 branches, 572 functions, 1551 lines).
- PASS `pnpm --filter @lite-fsm/visualizer test:e2e` — 15 tests.
- PASS `pnpm run lint` — 0 errors; 2 warnings in ignored generated
  `packages/graph/coverage/*/block-navigation.js`.
- PASS `git diff --check`

2026-05-13
- PASS `pnpm --filter @lite-fsm/visualizer check-types`
- PASS `pnpm --filter @lite-fsm/visualizer test:unit` — 33 files,
  212 tests.
- PASS `pnpm --filter @lite-fsm/visualizer test:coverage` — 100%
  statements, branches, functions и lines; 1788 statements, 1163 branches,
  564 functions, 1520 lines.
- PASS `pnpm --filter @lite-fsm/visualizer test:e2e` — 15 tests.
- PASS `pnpm run check-types`
- PASS `pnpm run lint` — 0 errors; 2 warnings in ignored generated
  `packages/graph/coverage/*/block-navigation.js`.
- PASS `pnpm run build:packages`
- PASS `git diff --check`

2026-05-13
- PASS `pnpm --filter @lite-fsm/visualizer check-types`
- PASS `pnpm --filter @lite-fsm/visualizer test:unit` — 32 files,
  209 tests.
- PASS `pnpm --filter @lite-fsm/visualizer test:coverage` — 100%
  statements, branches, functions и lines; 1788 statements, 1163 branches,
  564 functions, 1520 lines.
- PASS `pnpm --filter @lite-fsm/visualizer test:e2e` — 13 tests.
- PASS `pnpm run check-types`
- PASS `pnpm run lint` — 0 errors; 2 warnings in ignored generated
  `packages/graph/coverage/*/block-navigation.js`.
- PASS `git diff --check`

2026-05-13
- PASS `pnpm --filter @lite-fsm/visualizer check-types`
- PASS `pnpm --filter @lite-fsm/visualizer test:unit` — 27 files,
  182 tests.
- PASS `pnpm --filter @lite-fsm/visualizer test:coverage` — 100%
  statements, branches, functions и lines.
- PASS `pnpm run check-types`
- PASS `git diff --check`
- PASS `pnpm run lint` — 0 errors; 2 warnings in ignored generated
  `packages/graph/coverage/*/block-navigation.js`.

2026-05-13
- PASS `pnpm --filter @lite-fsm/visualizer check-types`
- PASS `pnpm --filter @lite-fsm/visualizer test:unit` — 26 files,
  173 tests.
- PASS `pnpm --filter @lite-fsm/visualizer test:coverage` — 100%
  statements, branches, functions и lines.
- PASS `pnpm run check-types`
- PASS `git diff --check`
- PASS `pnpm run lint` — 0 errors; 2 warnings in ignored generated
  `packages/graph/coverage/*/block-navigation.js`.

2026-05-13
- PASS `pnpm --filter @lite-fsm/graph check-types`
- PASS `pnpm --filter @lite-fsm/graph test:unit` — 11 tests.
- PASS `pnpm --filter @lite-fsm/graph test:coverage` — 100% statements,
  branches, functions и lines для `machine-flow*`, без ignored branches.
- PASS `pnpm run check-types`

2026-05-13
- PASS `pnpm --filter @lite-fsm/graph test:unit` — 10 tests.
- PASS `pnpm --filter @lite-fsm/graph test:coverage` — 100% statements,
  branches, functions и lines для `machine-flow*`, без ignored branches.
- PASS `pnpm --filter @lite-fsm/graph check-types`
- PASS `pnpm run test:types`
- PASS `pnpm run check-types`

2026-05-13
- PASS `pnpm --filter @lite-fsm/graph check-types`
- PASS `pnpm --filter @lite-fsm/graph test:unit`
- PASS `pnpm --filter @lite-fsm/graph test:coverage`
- PASS `pnpm run test:types`
- PASS `pnpm run check-types`

```

## Решения и отложенные пункты

Новые записи добавлять сверху.

```txt
2026-05-13
- Stage 5 не добавляет screenshot snapshots: visual stability проверяется через
  DOM visibility, semantic data attributes и horizontal overflow assertions.
- Xstate-like fixture зафиксирован inline строкой в visualizer test fixtures;
  реальные файлы `xstate/*` и playground modules не импортируются и не читаются.
- `data-edge-direction` является renderer-local test hook для self-loop E2E
  assertions, не частью public graph API.

2026-05-13
- Stage 4 добавляет `@xyflow/react` и `elkjs` только в
  `apps/visualizer`; graph package exports не меняются.
- `MachineCanvasGraph.tsx` включен в strict visualizer coverage; async layout
  cancellation и derived renderer metadata вынесены в `machine-canvas-graph-view`
  для прямого unit-покрытия без изменения Workbench state.
- `emission-only` edge groups рендерятся только source-node chips/counters.

2026-05-13
- Этап 3 не добавляет `@xyflow/react`, `elkjs`, layout state, coordinates или
  React Flow ids; ready body содержит controlled renderer-loading slot.
- Header Machine Canvas Board читает current только из
  `MachineFlowMachine.currentStateKey`; initial state не используется как
  fallback current.

2026-05-13
- Closed Machine Canvas state не хранит `machineBoard: undefined`; optional
  field удаляется, а `items` сохраняет исходную ссылку.
- Приватные UI ветки, недостижимые из текущих props/contracts, удалены вместо
  покрытия искусственными тестами.

2026-05-13
- Machine Canvas Board state хранит только semantic `sourceVersion` и
  `machineId`; viewport, hover, React Flow ids, coordinates и layout output не
  сохраняются в workbench.
- `machineBoard` является source of truth для opened board; adapter фиксирует
  только active canvas mode.
- Missing machine в reducer проверяется через latest
  `model.workbenchMachines[machineId]`; selector дополнительно пробрасывает
  `missing-machine` из `buildMachineFlowModel`.

2026-05-13
- Root import `@lite-fsm/graph` не получил Machine Flow export; public API
  доступен только через `@lite-fsm/graph/view-model`.
- `MachineFlowModel` не хранит React Flow ids, layout coordinates, DOM state
  или renderer style hints.
- Diagnostic/unknown workbench rows остаются non-edge rows: они учитываются в
  diagnostics/counters, но не создают `MachineFlowEdgeGroup`.

```

## Заметки для передачи контекста

Новые записи добавлять сверху.

```txt

```
