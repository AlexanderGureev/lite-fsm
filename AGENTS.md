# AGENTS.md

## Проект

`lite-fsm` — легковесная TypeScript-библиотека для FSM.

- `lite-fsm`: независимые от фреймворков `createMachine`, `MachineManager`, эффекты и middleware.
- `lite-fsm/react`: React-контекст и хуки.
- `lite-fsm/middleware`: опциональные интеграции, такие как DevTools и Immer.

## Жесткие правила

- Держи публичный API небольшим, предсказуемым и строго типизированным.
- При изменении публичного API или типов обновляй `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`; они должны оставаться справочниками возможностей, а не changelog.

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

- `src/core/`: FSM runtime, manager, types и interfaces.
- `src/react/`: React provider, context и hooks.
- `src/middleware/`: middleware entrypoints и integrations.
- `tests/`: runtime tests, smoke tests и Tstyche type tests.
- `docs/` и `playground/`: документация и demos.

## Команды

- Основные проверки: `npm run test`, `npm run test:types`, `npm run check-types`, `npm run lint`.
- Релизные проверки: `npm run build`, `npm run verify:release`.
