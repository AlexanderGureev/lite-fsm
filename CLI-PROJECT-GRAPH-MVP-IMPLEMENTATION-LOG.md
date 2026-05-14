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
| 2 | CLI | not started | - | - | - |
| 3 | Visualizer | not started | - | - | - |

## Финальная приемка

Статус: not started.

Фиксировать здесь дату/commit или короткую ссылку на результат финальных проверок
после прохождения всех трех stage acceptance gates.
