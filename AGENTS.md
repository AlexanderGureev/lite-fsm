# AGENTS.md

## Проект

`lite-fsm` — легковесная TypeScript-библиотека для FSM.

- `@lite-fsm/core`: независимые от фреймворков `createMachine`, `MachineManager`, эффекты и core types.
- `@lite-fsm/react`: React-контекст и хуки.
- `@lite-fsm/middleware`: опциональные интеграции, такие как DevTools и Immer.
- `@lite-fsm/persist`: persistence helpers.

## Жесткие правила

- Держи публичный API небольшим, предсказуемым и строго типизированным.
- При изменении публичного API или типов обновляй `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`; они должны оставаться справочниками возможностей, а не changelog.
- Агентам запрещено запускать сборку документации и команды, которые транзитивно ее запускают: `pnpm run build`, `pnpm --filter @lite-fsm/docs build`, `pnpm run docs:build`, `pnpm run pages:build*` и любые `next build` внутри `apps/docs`. Если нужна проверка docs build, явно передай ее пользователю; для агентной проверки пакетов используй `pnpm run build:packages`.

## Стиль кода

- Вноси минимальное корректное изменение. Не добавляй helpers без второго места использования, абстракции "на всякий случай" и copy-paste, который будет расходиться.
- Предпочитай простые TypeScript-функции и `type` aliases классам или фреймворкоподобным абстракциям.
- Код должен читаться сверху вниз. Называй намерение, а не механику.
- Пиши линейный код: предпочитай ранние `return`/`continue` вложенным `if-else`.
- Держи одну концепцию на функцию: разделяй шаги validate, transform и mutate.
- Держи одного владельца на каждую ответственность. Не дублируй validation или canonicalization между слоями.
- Сначала валидируй входные данные, затем выводи состояние.
- Удаляй мертвые generics: никаких `_phantom?: P` placeholders для type parameters, не используемых в field types.
- Используй дискриминирующие поля режима (`mode: "preview" | "commit"`) вместо связанных boolean-флагов.
- Выноси type alias, когда сложная сигнатура встречается больше одного раза.
- Комментарии должны объяснять неочевидное намерение или ограничения, а не пересказывать код.

## Тестирование

- Тесты обязательны для изменений поведения: покрывай runtime через Vitest и публичные типы через Tstyche.
- Названия тестов (`describe`, `it`, `test`) пиши на русском; идентификаторы кода и термины API оставляй на английском.

## Структура

- `packages/core/src/`: FSM runtime, manager, types и interfaces.
- `packages/react/src/`: React provider, context и hooks.
- `packages/middleware/src/`: middleware entrypoints и integrations.
- `packages/persist/src/`: persistence helpers.
- `packages/graph/`: private/experimental graph tooling workspace.
- `tests/`: runtime tests, smoke tests и Tstyche type tests.
- `apps/docs/` и `apps/playground/`: документация и demos.

## Команды

- Основные проверки: `pnpm run test`, `pnpm run test:types`, `pnpm run check-types`, `pnpm run lint`.
- Релизные проверки: `pnpm run build`, `pnpm run verify:release`.
