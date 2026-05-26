# Plugin system public API — промт комплексного ревью и рефакторинга

Запусти этот промт из корня `/Users/alexga/work/lite-fsm`.

## Роль главного агента

Ты главный агент. Твоя задача — провести итеративное ревью финальной реализации plugin system public API после завершения ТЗ:

- `spec/tz-plugin-system-public-api-finalization.md`;
- `spec/tz-plugin-system-public-api-finalization-log.md`.

Работа считается завершенной только когда новый независимый подагент после анализа текущего состояния возвращает результат `NO_ISSUES`, а финальные проверки главного агента проходят.

Главный агент не должен заменять собой подагентов. Каждый цикл ревью и рефакторинга выполняет новый подагент: он ищет проблемы, исправляет их, запускает проверки и возвращает отчет. Главный агент проверяет результат, запускает следующего подагента и останавливает цикл только по критерию завершения.

## Цель ревью

Проверить и упростить финальную реализацию plugin system public API без изменения публичного контракта.

Нужно найти и исправить:

- переусложненный код, который мешает последовательному чтению сверху вниз;
- дублирование validation, normalization, ownership checks или test setup;
- временные адаптеры, следы миграционных этапов, legacy path и dead code;
- неиспользуемые типы, generics, helpers, imports и tests;
- implementation-detail tests, которые фиксируют внутреннюю механику вместо публичного поведения;
- неочевидные casts, широкие internal types и усложненные conditional types, если их можно заменить более прямой моделью без потери inference;
- функции с несколькими ответственностями, где validate, transform и mutate смешаны без необходимости;
- нелинейные ветвления, которые можно заменить ранними `return`/`continue`;
- места, где public API surface или cheatsheets могут снова открыть legacy authoring API.

## Жесткие ограничения

- Не меняй documented public API: `definePlugin`, `defineStorageRuntime`, `PluginManagerEvents`, `PluginRouteMeta`, `PluginScopedDeps`, `PluginScopedTransition`, `PluginManagerExtensions`, `PluginMachineExtensions`, `EffectDeps`.
- Не возвращай legacy authoring API: `definePlugin({ ... })`, `install(ctx)`, `PluginInstallContext`, `PluginCapabilities`, public registry mutation, `createPluginStorage`, public `createPlugin`.
- Не меняй dispatch order, routing priority, snapshot format, hydrate/dehydrate contracts и error semantics.
- Не меняй error codes, если нет доказанной ошибки в текущем контракте.
- Не запускай запрещенные команды: `pnpm run build`, `pnpm --filter @lite-fsm/docs build`, `pnpm run docs:build`, `pnpm run pages:build*`, любой `next build` внутри `apps/docs`.
- Не делай широкие refactor-правки за пределами plugin system без прямой причины.
- Не удаляй тесты только ради сокращения. Тест можно удалить или переписать только если он дублирует сценарий, проверяет устаревшую механику или закрепляет implementation detail.
- Не трогай пользовательские изменения, не относящиеся к задаче. Перед каждым циклом учитывай текущий `git status --short`.

## Область анализа

Основная область:

- `packages/core/src/plugin.ts`;
- `packages/core/src/pluginStorage.ts`;
- `packages/core/src/createMachine.ts`;
- `packages/core/src/interfaces.ts`;
- `packages/core/src/index.ts`;
- `packages/core/src/runtime/kernel/*`;
- `packages/core/src/runtime/instance/*`;
- `tests/core/*plugin*`;
- `tests/core/plugins.test.ts`;
- `tests/core/routing-registry.test.ts`;
- `tests/core/dispatch-hooks.test.ts`;
- `tests/core/runtime-preset.test.ts`;
- `tests/core/runtime-ownership.test.ts`;
- `tests/types/*plugin*`;
- `tests/types/plugins.tst.ts`;
- `tests/types/exports-surface.tst.ts`;
- `tests/types/regression-matrix.tst.ts`;
- `tests/fixtures/plugin-system-documentation.ts`;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- `PLUGIN-SYSTEM-CHEATSHEET.md`;
- краткие placeholders в `apps/docs`, если они содержат plugin API examples.

Можно расширять область, если найденная проблема упирается в соседний core contract. Нельзя расширять область ради общего косметического рефакторинга.

## Перед первым циклом

Главный агент должен:

1. Прочитать `AGENTS.md`, исходное ТЗ и журнал реализации.
2. Зафиксировать текущее состояние `git status --short`.
3. Найти доступный инструмент запуска подагентов через `tool_search`, если инструмент не предоставлен явно.
4. Если инструмента подагентов нет, остановиться с блокером: эта задача требует независимых подагентов по условию.
5. Запустить первого подагента с шаблоном ниже.

## Цикл работы

Каждая итерация использует нового подагента. Номер итерации увеличивается на 1.

Главный агент передает подагенту:

- номер итерации;
- ссылки на это ТЗ ревью, финальное ТЗ и журнал;
- текущий `git status --short`;
- краткую сводку предыдущего цикла, если он был;
- запрет повторять уже отклоненные изменения.

Подагент должен:

1. Самостоятельно прочитать финальное ТЗ, журнал и релевантный код.
2. Провести ревью по цели и чеклисту.
3. Если проблемы найдены, исправить их минимальными изменениями.
4. Добавить или обновить runtime/type tests, если изменение влияет на поведение или публичные типы.
5. Запустить проверки, соразмерные изменению.
6. Вернуть один из статусов:
   - `FIXED`, если были внесены исправления;
   - `NO_ISSUES`, если после анализа нет проблем, которые нужно исправлять;
   - `BLOCKED`, если продолжение невозможно без решения человека.

Главный агент после каждого подагента должен:

1. Проверить отчет на конкретность: какие проблемы найдены, какие файлы изменены, какие проверки запущены.
2. Проверить `git diff --check`.
3. Если подагент изменил код, просмотреть diff и запустить недостающие targeted checks.
4. Если проверки упали, исправить очевидную инфраструктурную проблему или запустить следующего подагента с описанием failure.
5. Если подагент вернул `FIXED`, запустить следующего нового подагента.
6. Если подагент вернул `NO_ISSUES`, выполнить финальные проверки главного агента.
7. Если подагент вернул `BLOCKED`, не скрывать блокер и не считать задачу завершенной.

Не останавливайся после первого успешного исправления. Цикл продолжается, пока отдельный новый подагент не вернет `NO_ISSUES`.

Если три последовательных подагента не могут продвинуться из-за одного и того же блокера, главный агент возвращает `BLOCKED` с точным описанием блокера, уже выполненных проверок и минимального решения, которое требуется от человека.

## Шаблон промта для каждого подагента

````md
Ты подагент итерации <N> в задаче комплексного ревью и рефакторинга plugin system public API.

Работай в `/Users/alexga/work/lite-fsm`.

Прочитай:

- `AGENTS.md`;
- `spec/tz-plugin-system-public-api-finalization.md`;
- `spec/tz-plugin-system-public-api-finalization-log.md`;
- `spec/tz-plugin-system-public-api-refactor-review-prompt.md`.

Текущий статус worktree от главного агента:

```text
<git status --short>
```

Сводка предыдущего цикла:

```text
<summary or "Нет предыдущего цикла.">
```

Твоя задача — найти и исправить проблемы читаемости, переусложнения, legacy/dead code и избыточных тестов в финальной реализации plugin system public API. Не меняй public API, dispatch order, routing priority, snapshot format, hydrate/dehydrate behavior и error semantics.

Обязательный порядок:

1. Проведи source audit и type surface audit.
2. Найди минимум одну реальную проблему или докажи, что проблем нет.
3. Если проблема есть, исправь ее минимально и добавь/обнови проверки.
4. Запусти релевантные команды проверки.
5. Верни отчет строго в формате ниже.

Чеклист ревью:

- legacy names и paths отсутствуют в source/tests/public examples;
- validation и normalization имеют одного владельца;
- runtime registry читает normalized entries последовательно и без второго legacy path;
- `instance` storage идет через тот же normalized pipeline;
- public exports остаются минимальными;
- helper types не содержат мертвых generics и промежуточных aliases без пользы;
- tests проверяют public behavior, а не временную механику этапов;
- нет неиспользуемых imports, helpers, types, casts и fixture data;
- функции читаются линейно: validate, transform, mutate не смешаны без причины.

Аудит legacy должен включать как минимум:

```sh
rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|ctx\\.storage\\.register|\\bcreatePlugin\\b|ActionRegistry|DispatchRegistry|ManagerExtensionRegistry|DepsExtensionRegistry|ScopedDepsFactory|ScopedTransitionFactory|Object\\.assign\\([^\\n]*\\{ keys|auditTarget" packages/core/src tests/core tests/types API-CHEATSHEET.md TYPES-CHEATSHEET.md PLUGIN-SYSTEM-CHEATSHEET.md tests/fixtures apps/docs
```

Разрешены только совпадения в исторических спецификациях или в этом ревью-промте. В рабочем source, tests и public examples совпадений быть не должно.

Запрещенные команды:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Формат отчета:

```md
## Статус
`FIXED | NO_ISSUES | BLOCKED`

## Что проверено
- ...

## Найденные проблемы
- ...

## Исправления
- ...

## Файлы
- ...

## Проверки
- `<command>` — pass/fail/not run, причина

## Остаточные риски
- ...

## Следующий цикл
Что должен проверить следующий подагент. Если статус `NO_ISSUES`, напиши: `Следующий цикл не требуется`.
```
````

## Финальные проверки главного агента

После первого `NO_ISSUES` главный агент запускает финальный gate:

```sh
git diff --check
pnpm --filter @lite-fsm/core check-types
pnpm exec tstyche tests/types/plugin-system-documentation.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts
pnpm exec vitest run tests/core/plugin-system-documentation.test.ts tests/core/plugins.test.ts tests/core/routing-registry.test.ts tests/core/dispatch-hooks.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage9.test.ts tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts
pnpm run test:types
pnpm run check-types
pnpm run lint
pnpm run test:coverage
```

Если финальный gate падает, задача не завершена. Исправь очевидную причину или запусти нового подагента с failure summary.

Если `pnpm run test:coverage` слишком дорогой для текущего запуска, это можно заменить focused coverage только при явном согласии пользователя. Без full coverage итоговый статус не может быть `complete`, только “требуется финальная проверка”.

## Критерий полной готовности

Задача завершена только если выполнены все условия:

- последний подагент является новым независимым циклом и вернул `NO_ISSUES`;
- главный агент проверил diff после этого цикла;
- финальные проверки прошли или явно зафиксировано, какие проверки не были запущены и почему;
- legacy audit не нашел совпадений в source, tests и public examples;
- все изменения имеют runtime/type coverage по риску;
- новый и измененный чистый код сохраняет 100% coverage по statements, branches, functions и lines;
- public API, dispatch order, routing priority, snapshot format и error semantics не изменены;
- финальный ответ содержит номера циклов, статус каждого подагента, список измененных файлов, проверки и остаточные риски.

## Формат финального ответа главного агента

Финальный ответ пиши по-русски:

```md
Готово.

Циклы:
- Итерация 1: `FIXED` — ...
- Итерация 2: `NO_ISSUES` — ...

Изменения:
- ...

Проверки:
- `...` — pass

Остаточные риски:
- ...
```

Если есть блокер, вместо `Готово` напиши `Заблокировано` и укажи конкретное решение, которое требуется от человека.
