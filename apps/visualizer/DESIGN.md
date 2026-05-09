# Visualizer DESIGN.md

## Назначение

Этот документ описывает только дизайн `apps/visualizer/`. Root `DESIGN.md`
относится к `apps/playground/` и не является источником истины для
visualizer-а.

`apps/visualizer` - product UI для чтения систем `lite-fsm`: исходник,
инвентарь машин, каталог событий, рабочая область машин, ручная симуляция,
diagnostics и source anchors. Интерфейс не является лендингом, документацией
или демо-галереей.

## Регистр

- Тип поверхности: плотный инструментальный workspace.
- Сцена использования: разработчик разбирает event bus и reducer/effect
  маршруты вечером в редакторе на широком экране, рядом открыт код. Темная
  тема снижает контраст с IDE и удерживает внимание на технических labels.
- Цветовая стратегия: restrained dark neutrals с маленьким cyan accent и
  отдельной semantic palette для graph layers.
- Основная грамматика: compact topbar, segmented tabs with counters, split
  panes, scrollable lists, detail panels, machine cards, timeline, diagnostics
  console.

## Принципы

- Интерфейс обслуживает инспекцию. Не добавлять hero, marketing copy,
  декоративный canvas, landing sections или крупные иллюстративные blocks.
- Связи показываются выбором, подсветкой и detail rows. Не рисовать постоянную
  сетку edges в Stage 12.
- Labels API и graph ids остаются видимыми как code/data, поэтому mono style
  является частью UX, а не декоративным приемом.
- Состояния должны быть сканируемыми: layer, routing, confidence, diagnostics и
  simulation flags имеют стабильные badge/row styles.
- Компоненты используют familiar product affordances: tabs, buttons, search
  inputs, lists, panels, source overlays. Не изобретать нестандартные controls.
- Все стандартные иконки идут из `lucide-react`.

## Tokens

### Color

Все новые цвета задаются в OKLCH.

| Token | Value | Use |
| --- | --- | --- |
| `--vf-bg` | `oklch(0.145 0.018 248)` | App background |
| `--vf-surface` | `oklch(0.19 0.019 248)` | Panels and cards |
| `--vf-surface-raised` | `oklch(0.235 0.021 248)` | Headers, active tabs |
| `--vf-surface-soft` | `oklch(0.165 0.017 248)` | Inputs, nested list surfaces |
| `--vf-border` | `oklch(0.335 0.026 248)` | Primary borders |
| `--vf-border-soft` | `oklch(0.285 0.022 248)` | Row separators |
| `--vf-text` | `oklch(0.925 0.012 248)` | Primary text |
| `--vf-text-muted` | `oklch(0.68 0.027 248)` | Secondary labels |
| `--vf-text-quiet` | `oklch(0.53 0.03 248)` | Counters, inactive text |
| `--vf-accent` | `oklch(0.79 0.105 185)` | Current selection, focus, ready state |
| `--vf-accent-soft` | `oklch(0.79 0.105 185 / 0.13)` | Selected backgrounds |
| `--vf-config` | `oklch(0.78 0.12 73)` | Config rows and counts |
| `--vf-reducer` | `oklch(0.74 0.072 266)` | Reducer/self targets |
| `--vf-effect` | `oklch(0.76 0.105 150)` | Effect rows and producers |
| `--vf-routing` | `oklch(0.75 0.095 310)` | Routing badges |
| `--vf-warning` | `oklch(0.78 0.115 92)` | Manual timeline source, warnings |
| `--vf-danger` | `oklch(0.7 0.13 30)` | Errors, failed diagnostics |
| `--vf-domain` | `oklch(0.73 0.105 235)` | Domain machine badges |
| `--vf-actor` | `oklch(0.74 0.105 62)` | Actor machine badges |

### Typography

- Font stack: system sans for product UI,
  `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"`.
- Mono stack: `JetBrains Mono`, `SF Mono`, `ui-monospace`, `Menlo`, `Consolas`.
- Base size: `13px`, line-height `1.42`.
- Panel headings: `12px`, `600`, letter spacing `0.01em`.
- Eyebrows and counters: mono `10px..11px`, uppercase only for structural
  labels.
- Event/state/source ids: mono `11px..12px`, wrap with `overflow-wrap:anywhere`
  when inside constrained rows.
- No fluid type. Responsive behavior changes layout, not font sizes.

### Shape, Borders, Motion

- Radius: `6px` for compact controls, `8px` for panels and cards, `999px` for
  badges.
- Borders: one-pixel full borders. Do not use colored side-stripe borders.
- Shadows: only active machine cards may use a one-pixel focus ring through
  `box-shadow`; idle panels have no shadow.
- Motion: `140ms..220ms`, state feedback only. Do not animate layout
  properties.
- Focus: visible outline in `--vf-accent`, at least `2px`, with offset.

## Component Contracts

## UI Kit

Stage `12b-shadcn-foundation` uses an app-local shadcn setup in
`apps/visualizer/components.json`. It is independent from
`apps/playground/components.json`.

- Framework: Vite SPA, React, TypeScript, Tailwind CSS v4.
- shadcn base: Radix.
- shadcn style: `radix-nova`.
- Icon library: `lucide-react`.
- CSS entrypoint: `src/styles.css`.
- UI alias: `@/ui`.
- Utils alias: `@/lib/utils`.
- RSC: `false`.

Installed baseline components:

- `button` for topbar, panel actions, source actions and timeline actions.
- `badge` for status, layer, routing, diagnostic and simulation markers.
- `tabs` for the main Source/System/Events/Machines strip.
- `input`, `textarea` and `select` for source/search/send fixture controls.
- `card` only for graph-domain preview cards, not for every panel.
- `separator` for console/timeline divisions.
- `scroll-area` for source, workbench and console panes.
- `tooltip` for compact icon-only actions.
- `alert` for diagnostics and console entries.

Ownership rules:

- shadcn generated files live under `src/ui/*` and should stay generic.
- Visualizer-specific wrappers live in `src/ui/visualizer.tsx`: `Panel`,
  `PanelHeader`, `StatusBadge`, `LayerBadge`, `GraphRow`, `SourceSnippet`,
  `SourceEditorShell`, `DiagnosticsAlert`, `PaneScrollArea` and `IconButton`.
- Wrappers are presentational only. They do not import graph IR, simulator,
  services, store reducers or selectors.
- Standard controls use shadcn variants first. App-specific wrappers may add
  graph semantic color roles and dense row grammar.
- `SelectItem` always stays inside `SelectGroup`; `TabsTrigger` always stays
  inside `TabsList`; icon buttons use `Tooltip`.

Token policy:

- `src/styles.css` is the only app-level CSS owner for Tailwind/shadcn theme
  variables and visualizer graph semantic variables.
- shadcn semantic variables map to visualizer OKLCH tokens:
  `--background`, `--card`, `--popover`, `--border`, `--input`, `--ring`,
  `--primary`, `--muted`, `--accent`, `--destructive`.
- Graph-specific roles remain `--vf-*`: config, reducer, effect, routing,
  warning, danger, domain, actor, surfaces and borders.
- Feature components should prefer Tailwind utilities and shadcn variants.
  New CSS selectors are allowed only for theme variables or repeated graph
  grammar that cannot stay readable as utilities.

Allowed variants:

- `Button`: `outline`, `secondary`, `ghost` and `icon` sizes for fixture
  controls; `default` only for future primary user actions.
- `Badge`: `outline` plus wrapper tone classes; badges are not primary actions.
- `Tabs`: default segmented list; no underline-only tab style in this app.
- `Card`: only graph cards or card-like workbench previews, radius `8px`.
- `Alert`: diagnostics and simulator notices, using semantic visualizer colors.

Custom graph grammar that remains outside shadcn:

- Layer tags: `cfg`, `red`, `eff`, `sim`.
- Event/state/routing rows with stable columns and long-label wrapping.
- Source snippets with line numbers and selected source anchors.
- Timeline rows, relation chips and source-overlay fragments in later stages.

### App Shell

- Full viewport product shell with topbar and tab strip.
- Topbar contains brand mark, current source/status pill and console toggle.
- Tabs are segmented buttons with counters. Active tab uses raised surface and
  accent counter, not a colored underline.
- Mobile layout stacks topbar content and turns workspace panes into a single
  column.

### Panels

- Panel header contains eyebrow, concise title and optional actions.
- Panel body scrolls independently when content grows.
- Empty panels should show a representative task state, not marketing copy.
- Do not put a card inside another card. Use rows, sections or framed code
  blocks for inner structure.

### Lists And Rows

- Machine and topic rows use grid/flex layouts with stable counters.
- Selected rows use subtle accent background plus full border color. Related
  rows use accent tint. Dimmed rows lower opacity only when another relation is
  selected.
- Long event/state/guard/routing strings wrap predictably with
  `overflow-wrap:anywhere`; columns must not stretch the viewport.
- Counts use arrows consistently: producers `↑`, consumers `↓`.

### Badges

- Badges are mono, compact and stable in height.
- `domain`, `actor`, `config`, `reducer`, `effect`, `routing`, `diagnostic`,
  `simulation`, `terminal` each map to one color role.
- Badges do not become primary buttons. Clickable chips must have button
  affordance and focus-visible state.

### Source Editor And Overlay

- Source editor uses dark code surface, mono text and explicit action row.
- Source overlay is reserved for selected machine/source anchors. Stage 12b may
  show a static representative source block only as fixture content.
- Escape/backdrop close belongs to later behavior stages, but visual states
  must already be specified.

### L3 Cards And Timeline

- Machine cards show kind, current state, source affordance and grouped rows.
- State blocks show current state, initial/terminal badges and row layer tags.
- Transition rows use `cfg`; effect rows use `eff`; reducer/self information
  uses reducer color.
- Timeline rows show sequence, event, source kind and consumed transitions.
  Manual/external/effect sources have distinct semantic markers.

### Console And Diagnostics

- Console is a right rail or bottom rail depending on responsive space.
- Entries include origin, severity, message and optional graph/source target.
- Diagnostics colors are semantic, not decorative. Error, warning and info must
  remain readable on the dark surface.

## Accessibility

- Interactive targets should remain at least `32px` tall in dense desktop mode.
- `:focus-visible` is mandatory for tabs, buttons, chips, source actions and
  console rows.
- Contrast must remain sufficient for muted text and semantic badges.
- Keyboard navigation follows document order: console toggle, tabs, primary
  fixture actions, console controls.
- Labels such as event types and machine ids may be English/API terms; concise
  UI copy may stay English while specs remain Russian.

## Responsive Floor

- Minimum viewport width: `320px`.
- At narrow widths, workspace panes stack vertically, tab strip scrolls
  horizontally and cards keep stable row spacing.
- Long labels wrap instead of causing horizontal page overflow.
- Console remains reachable and does not overlap the active pane.

## Prohibited

- Landing pages, hero sections and marketing value props.
- Decorative gradient text, glass surfaces, blur cards or ornamental blobs.
- React Flow, ELK, canvas coordinates or edge routing in Stage 12.
- Custom SVG icon system when a lucide icon exists.
- Nested cards.
- Side-stripe accent borders.
- Hardcoded CSS/DOM copied from `music-app-mvp-flow.html`.
