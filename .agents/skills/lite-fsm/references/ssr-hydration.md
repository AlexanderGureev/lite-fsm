# SSR и Hydration

Читай этот файл для Next/SSR, server data seeding, `MachineManagerSnapshot`, `FSMHydrationBoundary`, `hydrate`, `dehydrate` и persist restore timing.

## Контракт

- Snapshot - транспорт состояния, не отдельный путь бизнес-логики.
- `hydrate` применяет snapshot, но не запускает effects.
- Продолжение процесса после hydration начинается обычным event.
- Server/client logic не должна расходиться по правилам поведения.
- Snapshot должен содержать только state, который безопасно передать и восстановить.

## Core snapshot

Manager умеет:

```ts
const snapshot = manager.dehydrate({ machines: ["session", "profile"] });
manager.hydrate(snapshot, { strategy: "merge" });
```

Default snapshot machine — `{ state, context }`, если custom hooks не заданы. Custom `dehydrate` задает transport shape; пример domain hooks — в `persistence.md`.

`strategy` управляет тем, как применяется входящий snapshot:

- `"merge"` (default) — ключи domain machines из snapshot применяются; actors, сохраняемые в snapshot, вне входящего набора остаются на месте.
- `"replace"` — ключи domain machines из snapshot применяются; actors, отсутствующие во входящем наборе, удаляются. Для domain machines семантику замены задает `hydrate` hook.

В обоих режимах отсутствующие в snapshot machine keys остаются как есть — `strategy` не делает глубокого merge `context` и не сбрасывает весь manager.

## React hydration boundary

Для React/Next используй `FSMHydrationBoundary`, когда server передает готовый snapshot в client tree.

```tsx
import type { PropsWithChildren } from "react";
import type { MachineManagerSnapshot } from "@lite-fsm/core";
import { FSMHydrationBoundary } from "@lite-fsm/react";

import type { AppMachines } from "@/store";

type Props = PropsWithChildren<{ snapshot: MachineManagerSnapshot<AppMachines> }>;

export function WidgetSeedBoundary({ snapshot, children }: Props) {
  return <FSMHydrationBoundary snapshot={snapshot}>{children}</FSMHydrationBoundary>;
}
```

Boundary показывает snapshot subtree уже на первом render и применяет его в layout effect. Если после hydrate нужен запуск логики, передай событие через `transitionAfterHydrate` — оно dispatch-ится один раз после commit snapshot в live manager:

```tsx
<FSMHydrationBoundary
  snapshot={snapshot}
  transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}
>
  <Screen />
</FSMHydrationBoundary>
```

`transitionAfterHydrate` принимает один action или `readonly ManagerAction<P>[]`. Plain action сериализуем через RSC, поэтому boundary можно собирать в server component. Под StrictMode повторный mount с тем же `snapshot + strategy + transitionAfterHydrate` не дублирует dispatch.

Не вкладывай boundaries с разным snapshot на один и тот же machine key: parent перезапишет child.

## `getServerSnapshot`

`FSMContextProvider` может получить `getServerSnapshot?: () => MachinesState<S>`. Это root runtime state для `useSyncExternalStore`, не dehydrated envelope.

Используй стабильный server snapshot для SSR pass. Не создавай новый несовместимый shape.

## Next App Router

Provider — client component (см. `bootstrap.md`). Server components загружают данные и передают snapshot в client `FSMHydrationBoundary`, но не запускают client effects.

```tsx
<Providers>
  <FSMHydrationBoundary snapshot={snapshot}>
    <Screen />
  </FSMHydrationBoundary>
</Providers>
```

## Persist restore timing

Persist restore и SSR snapshot - разные источники initial state. Нужен явный порядок:

- server snapshot для данных текущей страницы;
- persist restore для durable client state;
- ordinary events для догрузки, retry и refresh.

Не смешивай restore с бизнес-правилами. UI, который должен скрыть данные до завершения restore, читает persist status hooks из `@lite-fsm/persist/react`.

## Actors в snapshot

Runtime actors не попадают в snapshot по умолчанию. Actor template должен иметь `persistence: "snapshot"`, чтобы записи акторов сохранялись.

Сохраняй actor только если его runtime state действительно является durable data. Для завершившихся процессов итог лучше хранить в domain machine.
