# SSR Demo 3 Architecture

`ssr-demo-3` is the snapshot API reference route. It keeps the same UX as `ssr-demo-2`: a server-loaded grid manifest, per-widget streaming seeds, client grid pagination, and client widget pagination. The difference is the hydration contract.

## Snapshot Hydration

Server components build partial `MachineManagerSnapshot` envelopes and pass them to `FSMHydrationBoundary`.

- `SSRDemo3Screen` loads the first grid page and hydrates `ssrDemo3Grid`.
- `SSRDemo3WidgetSeedLoader` streams each widget seed independently and hydrates `ssrDemo3EntityList`.
- Client append paths use normal domain events: `FETCH_DEMO3_GRID_PAGE` and `FETCH_DEMO3_ENTITY_LIST`.

There are no `*Initialize` bridge components and no `INITIAL_*` events in this route. Store seeding is owned by `FSMHydrationBoundary`.

Streamed widget boundaries can hydrate after the root provider has already mounted during direct page entry. The React API deliberately does not try to infer that from browser lifecycle events. Instead, the route passes the same server seed into the client consumer as first-render fallback data. That keeps server HTML and the first client render identical, while `FSMHydrationBoundary` catches the shared store up in a layout effect when needed.

## Machine Hooks

`ssrDemo3Grid` and `ssrDemo3EntityList` are route-specific machines. They do not modify the old `ssr-demo` or `ssr-demo-2` contracts.

Their `hydrate` hooks merge partial snapshots into the runtime state and return `prev` when incoming content is unchanged. That gives the demo two layers of idempotency:

- Boundary-level idempotency skips the same snapshot object and strategy by reference.
- Machine-level idempotency skips new snapshot objects with the same content.

The demo uses runtime-shaped snapshots because the route is showing SSR cache hydration rather than custom transport serialization. A custom `dehydrate` shape can be added per machine without changing the boundary contract.

## Compatibility Notes

The playground store sets `schemaVersion: 1`, so `getSnapshot()` and `dehydrate()` include a versioned envelope. Unknown machine keys are skipped by core during hydrate, which keeps rolling deploy and stale-cache scenarios forgiving.

`ssr-demo` and `ssr-demo-2` remain available as side-by-side references:

- `ssr-demo`: baseline bridge API with `widgetFeed`.
- `ssr-demo-2`: manifest-first grid using bridge events and `entityList`.
- `ssr-demo-3`: manifest-first grid using `FSMHydrationBoundary` and manager snapshots.
