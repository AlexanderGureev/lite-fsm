# Lite FSM CLI project graph export: implementation log

Назначение файла — коротко фиксировать факт реализации этапов MVP, выполненные
проверки и открытые блокеры. Это не changelog и не место для расширения ТЗ.

## Правила ведения

1. Обновлять после выполнения acceptance gate соответствующего stage-файла.
2. Фиксировать только факты: что реализовано, какие проверки запускались, какие
   blocking issues остались.
3. Не переносить сюда требования из stage-файлов; source of truth остается в
   [index](CLI-PROJECT-GRAPH-MVP-SPEC.md) и stage documents.
4. Если этап начат, но gate не выполнен, оставить статус `in progress` и
   кратко перечислить blockers.

## Текущий статус

| Этап | Scope | Статус | Факт реализации | Проверки | Блокеры |
| ---- | ----- | ------ | --------------- | -------- | ------- |
| 1 | Graph Compiler | done | Добавлен public `compileLiteFsmGraphProject` с host-based source units, file-aware locations, manager map traversal, named barrel/namespace rest resolution, `lite-fsm` core alias, simple typed helper provenance, deterministic project files/source metadata и stage-1 graph tests для `real-store-shape` + playground smoke manifest. | `pnpm --filter @lite-fsm/graph test:unit`; `pnpm --filter @lite-fsm/graph test:coverage`; `pnpm --filter @lite-fsm/graph check-types`; `pnpm run test:types`; `pnpm run check-types` | - |
| 2 | CLI | done | Добавлен private workspace package `@lite-fsm/cli` с binary `lite-fsm`, command `export-graph`, command-agnostic project graph builder, tsconfig lookup, TypeScript module resolver/source cache over `CliFileSystem`, versioned JSON export envelope `lite-fsm.project-graph-export/v1`, canonical `real-store-shape` export fixture и CLI tests в `tests/cli/**` для command/options/resolver/cache/export/write policy + playground smoke manifest. | `pnpm run test`; `pnpm run test:coverage`; `pnpm --filter @lite-fsm/cli test:unit`; `pnpm --filter @lite-fsm/cli test:coverage`; `pnpm --filter @lite-fsm/cli check-types`; `pnpm --filter @lite-fsm/cli build`; `node packages/cli/dist/bin/lite-fsm.js --help`; `node packages/cli/dist/bin/lite-fsm.js export-graph --entry packages/graph/test-fixtures/real-store-shape/store/index.ts --tsconfig packages/graph/test-fixtures/real-store-shape/tsconfig.json --out .tmp/lite-fsm-real-store-shape.graph.json`; `pnpm run check-types`; `pnpm run lint` | - |
| 3 | Visualizer | not started | - | - | - |

## Финальная приемка

Статус: not started.

Фиксировать здесь дату/commit или короткую ссылку на результат финальных проверок
после прохождения всех трех stage acceptance gates.
