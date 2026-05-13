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
Этап: MVP 1. Machine Flow Model
Статус: [x] выполнено
Обновлено: 2026-05-13
Заметка: реализация начинается с MVP этапа 1. Post-MVP выполняется после
завершения MVP.
```

## Чеклист этапов

- [x] Подготовка: отделить лог реализации от стабильного ТЗ.
- [x] MVP этап 1: Machine Flow Model в `packages/graph/view-model`.
- [ ] MVP этап 2: состояние canvas и selectors в visualizer.
- [ ] MVP этап 3: интеграция L3 board shell.
- [ ] MVP этап 4: renderer на React Flow и ELK.
- [ ] MVP этап 5: hardening и проверки.
- [ ] Post-MVP этап 1: расширение Machine Flow Model.
- [ ] Post-MVP этап 2: pinned state, selectors и source actions.
- [ ] Post-MVP этап 3: detail panel shell.
- [ ] Post-MVP этап 4: renderer extensions.
- [ ] Post-MVP этап 5: simulation overlay, accessibility и test matrix.

## Лог действий

Новые записи добавлять сверху.

```txt
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
```

## Лог проверок

Новые записи добавлять сверху.

```txt
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
