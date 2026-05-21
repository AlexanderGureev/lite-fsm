# Testing

Тесты обязательны для новой или измененной бизнес-логики. Используй test runner и validation commands проекта; не навязывай новый инструмент без запроса.

## Что проверять

- Разрешенные transitions: событие в допустимом state меняет `state/context`.
- Игнорируемые transitions: отсутствующий переход не меняет machine.
- `null` transitions: событие принято, reducer обработал payload без обязательной смены state.
- Guard-through-reducer: reducer явно выбирает target state по payload/context.
- Effects lifecycle: `*_PENDING` отправляет `*_RESOLVED`/`*_REJECTED`, а rejected payload содержит сериализованную ошибку для UI/логирования/тестов.
- Late async: `createEffect({ type: "latest" })` не применяет устаревший result.
- Actors: spawn через `__INIT`, routing, terminal removal.
- Selectors: projection строится из state и не мутирует model.
- Persistence/hydration: snapshot shape, restore strategy, custom hooks idempotency.

## Runtime tests

Создавай manager через тот же `makeStore` или test factory с typed deps.

```ts
test("FETCH_ITEMS переводит список в загрузку", () => {
  const manager = makeStore({ api: fakeApi });

  manager.transition({ type: "FETCH_ITEMS", payload: { key: "main" } });

  expect(manager.getState().itemList.context.lists.main.status).toBe("loading");
});
```

Для effects используй fake deps и контролируемые promises/timers. Не обращайся к real network/storage.

## Forbidden/ignored events

Проверяй, что machine игнорирует событие, если transition отсутствует в текущем state.

```ts
const before = manager.getState().checkout;
manager.transition({ type: "SUBMIT_ORDER_RESOLVED", payload: { id: "1" } });
expect(manager.getState().checkout).toEqual(before);
```

## Actor tests

Проверяй:

- unscoped start event создает actor;
- `meta.actorId` доставляет событие конкретному actor;
- terminal target удаляет actor record;
- domain machine сохраняет итог, если он нужен после удаления actor.

## Selector tests

Тестируй только именованные selectors из `src/store/selectors/` — нетривиальные projection с агрегацией.

```ts
const view = selectDownloadView(state);
expect(view.isBusy).toBe(true);
```

Selector не должен вызывать `transition`, читать browser API или мутировать state.

Inline `useAppSelector((s) => ...)` в компоненте отдельно не тестируется — он проверяется в составе компонент-теста или e2e-сценария.

## Type checks

Для type contracts используй существующий workflow проекта:

- `tsc --noEmit`;
- existing type-test runner, если он уже есть;
- package scripts из `package.json`.

Не добавляй Tstyche или другой type-test runner только потому, что он используется в `lite-fsm` repository.

## Validation discovery

Перед запуском checks прочитай `package.json`, workspace config и project instructions.

Запускай минимально релевантные checks:

- unit tests для измененных machines/effects/selectors;
- type check для changed TypeScript surface;
- lint только если проект ожидает его для таких изменений.

Если checks не запускались, явно укажи причину: нет команды, зависимость не установлена, команда запрещена project instructions, или задача была только проектной консультацией.
