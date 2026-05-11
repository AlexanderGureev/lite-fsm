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
- Визуальный словарь: плотность, eyebrow grammar, density rows, chip-list,
  ref-row. Реализация остаётся через Tailwind + shadcn + `--vf-*` токены.

## Tokens

### Color

Все цвета задаются в OKLCH. Ниже приведены исходные hex-значения дизайна
и их точные OKLCH-эквиваленты для воспроизведения.

#### Поверхности и фон

Уровни поверхностей образуют пять ступеней: от самого тёмного фона до
поднятых заголовков и хот-стейт при наведении.

OKLCH L-значения вычислены из исходных hex через sRGB gamma → linear → OKLab M1+M2
матрицы (алгоритм Björn Ottosson). Хроматичность и hue взяты из вычисленного OKLab
для каждого hex.

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| `--vf-bg` | `oklch(0.178 0.012 268)` | `#0f1116` | App background |
| `--vf-bg-elevated` | `oklch(0.196 0.015 268)` | _(derived)_ | Reserved elevated surface |
| `--vf-surface` | `oklch(0.215 0.018 268)` | `#161922` | Panels and cards |
| `--vf-surface-soft` | `oklch(0.244 0.020 268)` | `#1c2029` | Inputs, nested list surfaces |
| `--vf-surface-raised` | `oklch(0.272 0.022 268)` | `#232734` | Headers, active tabs |
| `--vf-surface-hot` | `oklch(0.295 0.024 268)` | _(derived)_ | shadcn accent hover surface |

#### Границы

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| `--vf-border` | `oklch(0.315 0.025 268)` | `#2c3140` | Primary borders |
| `--vf-border-soft` | `oklch(1 0 0 / 0.06)` | `rgba(255,255,255,0.06)` | Row separators |

#### Текст

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| `--vf-text` | `oklch(0.936 0.008 252)` | `#e9ecf2` | Primary text |
| `--vf-text-muted` | `oklch(0.668 0.019 258)` | `#9aa1b1` | Secondary labels |
| `--vf-text-quiet` | `oklch(0.507 0.024 261)` | `#6b7385` | Counters, inactive text |

#### Accent

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| `--vf-accent` | `oklch(0.807 0.098 184)` | `#7dd3c2` | Current selection, focus, ready state |
| `--vf-accent-strong` | `oklch(0.855 0.115 184)` | _(derived)_ | Strong focus/active accent |
| `--vf-accent-soft` | `oklch(0.807 0.098 184 / 0.14)` | `rgba(125,211,194,0.14)` | Selected backgrounds |
| `--vf-accent-border` | `oklch(0.807 0.098 184 / 0.42)` | _(derived)_ | Selected borders and ready badges |
| `--vf-counter-surface` | `oklch(0.936 0.008 252 / 0.08)` | _(derived)_ | Compact counters inside tabs |
| `--vf-row-hover` | `oklch(0.936 0.008 252 / 0.035)` | _(derived)_ | Dense row hover |
| `--vf-row-related` | `oklch(0.807 0.098 184 / 0.06)` | _(derived)_ | Related row tint |
| `--vf-glow-current` | `oklch(0.807 0.098 184 / 0.55)` | _(derived)_ | Pulse glow for current state dot |

#### Семантические цвета графа

Каждый semantic role имеет три токена: base, soft fill (alpha 0.10–0.13),
border (alpha 0.42).

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| `--vf-config` | `oklch(0.772 0.130 67)` | `#e6a957` | Config rows and counts |
| `--vf-config-soft` | `oklch(0.772 0.130 67 / 0.12)` | | Config badge fill |
| `--vf-config-border` | `oklch(0.772 0.130 67 / 0.42)` | | Config badge border |
| `--vf-reducer` | `oklch(0.757 0.068 264)` | `#a8b8e0` | Reducer/self targets |
| `--vf-reducer-soft` | `oklch(0.757 0.068 264 / 0.1)` | | Reducer badge fill |
| `--vf-reducer-border` | `oklch(0.757 0.068 264 / 0.42)` | | Reducer badge border |
| `--vf-effect` | `oklch(0.769 0.087 155)` | `#82c79c` | Effect rows and producers |
| `--vf-effect-soft` | `oklch(0.769 0.087 155 / 0.12)` | | Effect badge fill |
| `--vf-effect-border` | `oklch(0.769 0.087 155 / 0.42)` | | Effect badge border |
| `--vf-routing` | `oklch(0.726 0.107 307)` | `#c79de0` | Routing badges |
| `--vf-routing-soft` | `oklch(0.726 0.107 307 / 0.12)` | | Routing badge fill |
| `--vf-routing-border` | `oklch(0.726 0.107 307 / 0.42)` | | Routing badge border |
| `--vf-warning` | `oklch(0.784 0.110 80)` | `#d8b86b` | Manual timeline source, warnings |
| `--vf-warning-soft` | `oklch(0.784 0.110 80 / 0.13)` | | Warning/diagnostic fill |
| `--vf-warning-border` | `oklch(0.784 0.110 80 / 0.42)` | | Warning/diagnostic border |
| `--vf-danger` | `oklch(0.672 0.131 19)` | `#e07a6e` | Errors, failed diagnostics |
| `--vf-danger-soft` | `oklch(0.672 0.131 19 / 0.11)` | | Error fill |
| `--vf-danger-border` | `oklch(0.672 0.131 19 / 0.42)` | | Error border |
| `--vf-domain` | `oklch(0.740 0.100 231)` | `#7eb6f0` | Domain machine badges |
| `--vf-domain-soft` | `oklch(0.740 0.100 231 / 0.1)` | | Domain badge fill |
| `--vf-domain-border` | `oklch(0.740 0.100 231 / 0.42)` | | Domain badge border |
| `--vf-actor` | `oklch(0.728 0.104 56)` | `#d6a06b` | Actor machine badges |
| `--vf-actor-soft` | `oklch(0.728 0.104 56 / 0.1)` | | Actor badge fill |
| `--vf-actor-border` | `oklch(0.728 0.104 56 / 0.42)` | | Actor badge border |

#### Производные токены счётчиков

| Token | Значение | Use |
| --- | --- | --- |
| `--vf-counter-in` | `= --vf-config` | Producer count arrows (↑) |
| `--vf-counter-out` | `= --vf-effect` | Consumer count arrows (↓) |

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
- Borders: one-pixel full borders by default. Side-stripe accents
  (`box-shadow: inset 2px 0 0 var(--vf-accent)` или `inset 3px 0 0`) разрешены
  только для двух ролей: current state в machine card и selected/related rows
  в L1/L2/L3 picker. Любые другие side-stripes запрещены.
- Shadows: только active machine card может использовать one-pixel focus ring
  через `box-shadow`; idle panels не имеют тени. Для current state допустим
  компактный pulse-glow на одной точке-индикаторе, не на ряду или карточке
  целиком.
- Motion: `140ms..220ms`, state feedback only. Do not animate layout
  properties. Допустимы `pulseGlow` на current-state pulse dot и `rowAppear`
  flash на recently-fired ряду.
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
- `input` and `select` for search/send fixture controls; the Source editor is
  owned by the CodeMirror-backed `SourceEditorShell`.
- `card` only for graph-domain preview cards, not for every panel.
- `separator` for console/timeline divisions.
- `scroll-area` for source, workbench and console panes.
- `tooltip` for compact icon-only actions.
- `alert` for diagnostics and console entries.
- `dialog` for source overlay anchors opened from System, Events and Console.

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
- Source snippets use the CodeMirror-backed `SourceEditorShell` in read-only
  mode when they need syntax highlighting, line numbers and selected anchors.
- Source-overlay fragments with line clipping and fallback rows when anchors have
  no source location.
- Timeline rows and relation chips in later stages.

Testing hooks:

- Stable `data-testid` values live in `src/test-ids.ts`.
- Test ids are reserved for app shell anchors, tabs, primary controls, panels,
  representative rows, console entries and timeline controls.
- Accessibility names and roles remain the first user-facing contract. Test ids
  are a stable e2e convenience for text that may change during later stages.
- UI assertions should target stable hooks such as `data-status`, `data-count`,
  `data-machine-id`, `data-event-type` and `data-row-id`, not display copy.
- Do not derive test ids from display labels. Use domain ids (`machineId`,
  `eventType`, `rowId`, `diagnosticId`, `stepId`) for future data-driven lists.

### App Shell

- Full viewport product shell with one compact topbar and one full-width active
  workspace pane. Source, System, Events and Machines are peer tabs; Source is
  not a permanent side rail.
- Topbar contains brand mark, segmented tabs, current source/status pills and
  console toggle.
- Tabs are segmented buttons with counters. Active tab uses raised surface and
  accent counter, not a colored underline.
- Active tab content owns the available width. L1/L2 panels must not share
  horizontal space with Source or Console.
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
- Density rows (≤32px высоты) для L1/L2/L3 picker: `[badge?] · <b mono>{id}</b>`
  inline + counters справа.
- Selected rows use side-stripe `--vf-accent` accent + accent-tint background.
  Related rows используют accent tint без stripe. Dimmed rows lower opacity
  only when another relation is selected (`opacity ~0.32`).
- Long event/state/guard/routing strings wrap predictably with
  `overflow-wrap:anywhere`; columns must not stretch the viewport.
- Counts use arrows consistently: producers `↑`, consumers `↓`.

### L1/L2 Read-Only Views

- `System` is the L1 system view. It is split into machines, topics and
  details zones inside the workbench panel; narrow viewports stack the zones in
  one column.
- L1 machine/topic filters are case-insensitive text queries over ids, titles,
  kind/group tags, topic names and visible semantic labels.
- L1 relation state is shown with row tint, border and dimming. Do not draw
  persistent edges, routes or canvas layers.
- Machine details can open source anchors or prepare the Machines placeholder
  with the selected machine for Stage 12e.
- Topic details can open the selected topic in the L2 `Events` catalog.
- `Events` is the L2 topic catalog. It is split into topic list and details;
  narrow viewports stack list above detail.
- L2 details show producers, consumers, routing values, source state, guard,
  confidence, branch targets and dynamic/unknown labels from the visualizer
  model only.
- Empty states must distinguish no model, no search matches, no selected topic
  and no producers/consumers.

### Badges

- Badges are mono, compact and stable in height.
- `domain`, `actor`, `config`, `reducer`, `effect`, `routing`, `diagnostic`,
  `simulation`, `terminal` each map to one color role.
- Badges do not become primary buttons. Clickable chips must have button
  affordance and focus-visible state.

### Source Editor And Overlay

- Source editor is a full-width tab with dark code surface, mono text, explicit
  action row and a compact projection summary. It does not remain mounted beside
  System/Events after the source pipeline opens the model.
- Source overlay uses app-local shadcn `Dialog` and opens from L1 rows, L2 rows
  and console targets with a concise title and prioritized source anchors.
- Overlay snippets are derived from the current `SourceSession.source`,
  `sourceVersion` and `GraphSourceAnchor[]`; they render as read-only
  CodeMirror fragments with original line numbers, clipped context and fallback
  rows when a source location is missing.
- Close behavior is the standard Dialog close button, Escape and backdrop.
  Source edits/recompile clear the overlay through app state.

### L3 Cards And Timeline

- Machine cards show kind, current state, source affordance and grouped rows.
- State blocks show current state, initial/terminal badges and row layer tags.
  Current state получает side-stripe accent + лёгкий accent tint + pulse-dot
  слева от заголовка (анимация `pulseGlow`, 1.4s).
- Transition rows use `cfg`; effect rows use `eff`; reducer/self information
  uses reducer color.
- Recently-fired ряды могут получать `rowAppear` flash (warning bg на 0.4s)
  до следующего шага.
- Timeline rows show sequence, event, source kind and consumed transitions.
  Manual/external/effect sources have distinct semantic markers.

### Console And Diagnostics

- Console is a right-side overlay drawer. It is closed by default, opens above
  the active workspace, dims the underlying pane and never changes the active
  tab layout width.
- Entries include origin, severity, message and optional graph/source target.
- Diagnostics colors are semantic, not decorative. Error, warning and info must
  remain readable on the dark surface.

## Accessibility

- Interactive targets should remain at least `32px` tall in dense desktop mode.
- `:focus-visible` is mandatory for tabs, buttons, chips, source actions and
  console rows.
- Contrast must remain sufficient for muted text and semantic badges.
- Keyboard navigation follows document order: tabs, topbar actions, active pane
  controls, console controls when the drawer is open.
- Labels such as event types and machine ids may be English/API terms; concise
  UI copy may stay English while specs remain Russian.

## Responsive Floor

- Minimum viewport width: `320px`.
- At narrow widths, workspace panes stack vertically, tab strip scrolls
  horizontally and cards keep stable row spacing.
- Long labels wrap instead of causing horizontal page overflow.
- Console remains reachable as an overlay drawer; when open it may cover the
  right side of the active pane and must provide an obvious close control.

## Prohibited

- Landing pages, hero sections and marketing value props.
- Decorative gradient text, glass surfaces, blur cards or ornamental blobs.
- React Flow, ELK, canvas coordinates or edge routing in Stage 12.
- Custom SVG icon system when a lucide icon exists.
- Nested cards.
- Side-stripe accent borders за пределами разрешённых ролей (current state,
  selected/related rows). Любой другой side-stripe запрещён.
- Копирование сырого CSS/DOM из внешних прототипов. Следовать визуальному
  словарю допустимо; реализация остаётся через Tailwind + shadcn + `--vf-*` токены.
