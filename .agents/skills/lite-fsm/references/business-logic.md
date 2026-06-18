# Business Logic

## Главный контракт

`lite-fsm` владеет логикой приложения. События идут через общий `MachineManager`; каждый machine явно подписывается на события через `config`; reducers меняют только свой slice; effects читают root state через `getState` и отправляют новые events.

UI собирает payload из пользовательского ввода, вызывает `transition(...)` и читает projection через selectors. UI не решает, какие machines обновить, какие retry/cancel/rollback events отправить и какие внешние подписки держать.

## Язык событий

Событие — контракт приложения. Называй событие как domain intent или факт, а не как DOM-деталь.

- Пиши `FETCH_ITEMS`, `SAVE_PROFILE`, `OPEN_LOGIN_MODAL`, не `BUTTON_CLICKED`.
- Результат async effect возвращай событием `*_RESOLVED` или `*_REJECTED`. Если в проекте уже зафиксирована другая конвенция (например, `*_RESOLVE`/`*_REJECT`), следуй ей.
- `*_REJECTED` payload содержит сериализованную ошибку, пригодную для UI, логирования и тестов; минимальная форма — `{ error: string }`.
- Если причина действия важна для логики, передай ее в payload (например, `payload.source: "menu" | "shortcut"`).
- Типизируй события union из `FSMEvent<...>`.

## Типы machines

Разделяй фичу по владельцам ответственности, а не по React-компонентам.

- Domain: источник истины, агрегаты, кеши, сессии, серверные факты.
- Process: сценарий с lifecycle, async, retry, cancel, error paths.
- View: видимость модалок, баннеров, выбранная вкладка, метаданные страницы.
- Technical: подписка на browser/platform/external source и трансляция внешнего факта в app event.
- Observer: аналитика, логирование, центральный сбор ошибок по доменным событиям.
- Coordinator: orchestration нескольких исполнителей через `getState` и events.

Coordinator — опциональный тип. Любой effect может читать `getState` и сам решать, какие события отправить дальше. Заводи отдельный coordinator только когда orchestration перестает относиться к core-ответственности владельца и становится самостоятельной задачей (например, игровой tick, который ходит по нескольким системам, или reset-операция, затрагивающая несколько доменных машин).

Пример фичи из четырех связанных машин разных типов: `feature-example.md`.

## Форма файла machine

Один модуль описывает одну машину или один actor template. Простой модуль — файл `src/store/machines/<kebab-case>.ts`. Сложный модуль — папка `src/store/machines/<kebab-case>/` с `index.ts` как entry point и локальными `types.ts`, `helpers.ts`, `events.ts` или `effects.ts`.

`index.ts` читается сверху вниз:

1. imports;
2. `Events`;
3. `Context` type alias;
4. `initialContext` с этим типом;
5. локальные чистые helpers, если inline-форма теряет читаемость или helper переиспользуется;
6. `createMachine({ config: {...}, initialState, initialContext, reducer, effects })`.

По умолчанию держи всю конфигурацию автомата inline внутри `createMachine({ ... })`: `config`, `reducer` и `effects` должны читаться как единый контракт машины. Отдельные `const config = createConfig(...)`, `const reducer = createReducer(...)` и `const effect = createEffect(...)` используй только когда автомат слишком большой для чтения в одном объекте или часть конфигурации нужно переиспользовать между machines, effects или тестами.

Async effect по умолчанию — обычная inline-функция в `effects`. Заводи `createEffect(...)` только для реальной семантики его опций (`latest`, `cancelFn`), а не ради консистентности. Если `config` и UI не позволяют повторно запустить процесс до завершения, `latest` не нужен и только заставляет читать код как потенциально конкурентный.

### Helpers рядом с машиной

Условия и трансформации, нужные одной машине, держи inline в reducer или effect.

Выноси `helpers.ts` рядом с машиной, когда:

- одна и та же проверка нужна нескольким машинам одной фичи (например, `shouldShowOnboardingPrompt` используется в `onboarding`, `onboardingPrompt` и `profileHintAnimation`);
- inline-форма теряет читаемость из-за длины.

Helpers — чистые функции от состояния или payload, без side effects и без отправки событий. Они не превращаются во второй слой бизнес-логики и не дублируют ответственность effects.

## Config как подписка

`config` перечисляет допустимые события для каждого state.

- Отсутствующий переход означает, что machine игнорирует событие в этом state.
- `null` — self-transition: событие принято, reducer и effects выполнятся, `nextState` равен текущему.
- `null` подходит для обработки payload без смены state и для guard-through-reducer, где reducer сам назначает `state.state`.
- Для доменной и процессной логики используй явные transitions из конкретных state.
- Wildcard `"*"` уместен в observer-машинах (аналитика, центральный error catcher) и в случаях, когда событие правда должно работать из любого state (например, глобальный reset). Не пиши `"*"` в domain/process-машине ради экономии строк.
- Reset/cancel объявляй явно в тех state, где они допустимы.

## Reducer

Reducer получает только свой `slice`, `action` и helpers. Он архитектурно не имеет доступа к root state и не может менять чужой slice.

Правила:

- Immer-style reducer является baseline; manager должен использовать `immerMiddleware`.
- В начале стандартного reducer ставь `state.state = nextState`.
- Reducer всегда ветвится через `switch (action.type)`, даже если обрабатывается один тип события. Не используй `if (action.type !== "...") return` и цепочки `if` по типу: единая структура `switch` читается лучше и не разъезжается при добавлении новых событий. Guard-стиль `if (action.type !== ...)` уместен в effects, но не в reducer.
- Не добавляй `default` по умолчанию.
- Каждый `case` завершай `return`. Ветку с локальными объявлениями (`const ...`) оборачивай в блок `case "X": { ... }`.
- Reducer меняет только `state.context` и `state.state` своего machine.

Guard-through-reducer допустим, когда target state зависит от payload или current context и это нельзя выразить статическим `config`.

## Context

Context хранит модель владельца machine.

- Domain: агрегаты, кеши, серверные факты, настройки, сессии.
- Process: request params, status, error, retry/cancel данные.
- View: состояние представления, если оно — часть app logic.
- Не храни derived values, которые selector посчитает из одного источника.
- Не дублируй один источник истины в нескольких machines.

Объявляй `type Context = {...}` отдельной строкой и используй его в `const initialContext: Context = {...}`. Это упрощает чтение, тестирование и переиспользование типа в selectors. Inline-форма приемлема только для тривиального пустого context (`initialContext: {}`).

## Effects

Effect выполняет внешнюю работу при входе в state и возвращает результат новым событием. Не меняет state напрямую, читает root через `getState`, ошибки превращает в `*_REJECTED` с сериализованным payload. Для обычного one-shot process используй inline async effect.

Деталі (`createEffect`, `condition`, middleware, deps grouping) — в `effects.md`.

## External subscriptions

Подписки на browser, platform и postMessage держи в technical-машинах: внешний callback только отправляет event, последний внешний факт хранится в `context`.

Шаблон technical bridge — в `system-patterns.md`.

## Actors

Dictionary в domain context подходит для набора данных с общим lifecycle. Actor template нужен, когда у каждого экземпляра есть собственные `state`, `context`, effects, cancel/retry, terminal lifecycle или routing.

Итог процесса храни в domain machine, если данные нужны после terminal target — actor удаляется из runtime state.

Шаблон и routing — в `actors.md`.

## Selectors и UI

Узкие чтения держи inline в компоненте:

```tsx
const isPending = useAppSelector((s) => s.loginFlow.state === "LOGIN_PENDING");
const user = useAppSelector((s) => s.session.context.user);
```

Выноси именованный selector в `src/store/selectors/` только когда выполнено одно из условий:

- projection агрегирует данные из нескольких machines (`state.trackDownload` + `state.albumDownload` + `state.session`);
- projection нетривиальна: фильтрация, маппинг по `Object.entries`, вычисляемые поля, нормализация;
- одна и та же projection нужна в трех и более местах.

Правила:

- Selector — чистая функция от `AppState`. Никаких `transition`, side effects, мутаций.
- Derived-поля не дублируй в `context`, если selector может посчитать их из одного источника.
- React-компоненты ходят в state только через typed hooks из `src/store/hooks.ts`.
- UI может передать `meta.actorId` в `transition`, если `actorId` пришел из selector item и пользователь действует над конкретным actor.
- Broadcast/group/tag routing и сложные decisions живут в effects/machines, не в UI.
