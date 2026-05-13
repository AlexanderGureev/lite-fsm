# Visualizer DESIGN.md

## Назначение

Этот документ — единственный источник истины для дизайна `apps/visualizer/`.
По нему должно быть возможно восстановить визуальную систему с нуля: токены,
тема, типографика, layout grammar, component contracts, состояния,
accessibility и responsive behavior. Документ описывает итоговую систему,
а не историю изменений. Root `DESIGN.md` относится к `apps/playground/`
и не является источником истины для visualizer.

`apps/visualizer` — product UI для чтения систем `lite-fsm`: исходник,
инвентарь машин, каталог событий, рабочая область машин, ручная симуляция,
diagnostics и source anchors. Это не лендинг, не документация и не демо.

## Регистр и принципы

- Тип поверхности: плотный инструментальный workspace, тёмная тема.
- Сцена: разработчик исследует event bus и reducer/effect маршруты в
  редакторе на широком экране, рядом открыт код.
- Цветовая стратегия: restrained dark neutrals + единственный cyan accent +
  отдельная semantic palette для graph layers.
- Грамматика: compact topbar, segmented tabs with counters, split panes,
  scrollable lists, density rows, machine cards, timeline, diagnostics
  console, source overlay.

Принципы:

- Интерфейс обслуживает инспекцию: никаких hero, marketing copy,
  декоративного canvas, landing sections, иллюстративных blocks.
- Связи показываются выбором, подсветкой и detail rows. Постоянные edges,
- Labels API и graph ids остаются как code/data: mono — часть UX,
  не декоративный приём.
- Состояния сканируемы: layer, routing, confidence, diagnostics, simulation
  имеют стабильные badge/row styles.
- Familiar product affordances: tabs, buttons, search inputs, lists, panels,
  source overlays. Нестандартные controls не изобретать.
- Иконки только из `lucide-react`.
- Реализация: Tailwind + shadcn primitives + `--vf-*` токены. Любое
  изменение токенов, component grammar, layout, состояний или interaction
  patterns обновляет этот документ в той же правке.

## Tokens

Все цвета задаются в OKLCH. Hex-значения приведены как исходные дизайн-якоря.
Все токены живут в `src/styles.css`; feature-компоненты не объявляют свои
CSS-переменные.

### Поверхности

| Token                 | OKLCH                    | Hex         | Использование                          |
| --------------------- | ------------------------ | ----------- | -------------------------------------- |
| `--vf-bg`             | `oklch(0.178 0.012 268)` | `#0f1116`   | App background                         |
| `--vf-bg-elevated`    | `oklch(0.196 0.015 268)` | _(derived)_ | Резерв для приподнятой поверхности     |
| `--vf-surface`        | `oklch(0.215 0.018 268)` | `#161922`   | Панели и карточки                      |
| `--vf-surface-soft`   | `oklch(0.244 0.020 268)` | `#1c2029`   | Inputs, headers панелей, channel strip |
| `--vf-surface-raised` | `oklch(0.272 0.022 268)` | `#232734`   | Активные tab, hover на entry карточках |
| `--vf-surface-hot`    | `oklch(0.295 0.024 268)` | _(derived)_ | shadcn accent hover                    |

### Границы

| Token              | OKLCH                    | Использование                                 |
| ------------------ | ------------------------ | --------------------------------------------- |
| `--vf-border`      | `oklch(0.315 0.025 268)` | Основные рамки панелей и контролов            |
| `--vf-border-soft` | `oklch(1 0 0 / 0.06)`    | Разделители строк, подзаголовки внутри панели |

### Текст

| Token             | OKLCH                    | Использование                        |
| ----------------- | ------------------------ | ------------------------------------ |
| `--vf-text`       | `oklch(0.936 0.008 252)` | Primary text                         |
| `--vf-text-muted` | `oklch(0.668 0.019 258)` | Вторичные labels                     |
| `--vf-text-quiet` | `oklch(0.507 0.024 261)` | Счётчики, eyebrows, неактивный текст |

### Accent

| Token                  | OKLCH                            | Использование                                  |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| `--vf-accent`          | `oklch(0.807 0.098 184)`         | Primary action, current selection, ready state |
| `--vf-accent-strong`   | `oklch(0.855 0.115 184)`         | Hover для primary action                       |
| `--vf-accent-soft`     | `oklch(0.807 0.098 184 / 0.14)`  | Selected backgrounds, accent surfaces          |
| `--vf-accent-border`   | `oklch(0.807 0.098 184 / 0.42)`  | Selected borders, ready badges                 |
| `--vf-counter-surface` | `oklch(0.936 0.008 252 / 0.08)`  | Счётчики внутри tab/row                        |
| `--vf-row-hover`       | `oklch(0.936 0.008 252 / 0.035)` | Hover плотных строк                            |
| `--vf-row-related`     | `oklch(0.807 0.098 184 / 0.06)`  | Related row tint                               |
| `--vf-glow-current`    | `oklch(0.807 0.098 184 / 0.55)`  | Pulse-glow для current state                   |
| `--vf-focus-ring`      | `oklch(0.807 0.098 184 / 0.55)`  | Focus outline для overlay-кнопок               |

### Семантические цвета графа

Каждая роль имеет три токена: base, soft fill (alpha 0.10–0.13), border (alpha 0.42).

| Token          | OKLCH                    | Hex       | Использование                                 |
| -------------- | ------------------------ | --------- | --------------------------------------------- |
| `--vf-config`  | `oklch(0.772 0.130 67)`  | `#e6a957` | Config rows, `cfg` badge, producer counter    |
| `--vf-reducer` | `oklch(0.757 0.068 264)` | `#a8b8e0` | Reducer/self targets, `red` badge             |
| `--vf-effect`  | `oklch(0.769 0.087 155)` | `#82c79c` | Effect rows, `eff` badge, consumer counter    |
| `--vf-routing` | `oklch(0.726 0.107 307)` | `#c79de0` | Routing badges и chips                        |
| `--vf-warning` | `oklch(0.784 0.110 80)`  | `#d8b86b` | Manual timeline source, warnings, `sim` badge |
| `--vf-danger`  | `oklch(0.672 0.131 19)`  | `#e07a6e` | Errors, failed diagnostics                    |
| `--vf-domain`  | `oklch(0.740 0.100 231)` | `#7eb6f0` | Domain machine badges                         |
| `--vf-actor`   | `oklch(0.728 0.104 56)`  | `#d6a06b` | Actor machine badges                          |

### Производные токены

| Token              | Значение        | Использование          |
| ------------------ | --------------- | ---------------------- |
| `--vf-counter-in`  | `= --vf-config` | Producer counter (`↑`) |
| `--vf-counter-out` | `= --vf-effect` | Consumer counter (`↓`) |

### Радиусы, motion, тени, spacing

| Token                 | Значение                                | Использование                                 |
| --------------------- | --------------------------------------- | --------------------------------------------- |
| `--vf-radius-sm`      | `6px`                                   | Inputs, кнопки, layer badges, мелкие chips    |
| `--vf-radius`         | `8px`                                   | Inner cards, code surfaces, buttons           |
| `--vf-radius-lg`      | `10px`                                  | Панели верхнего уровня (Panel, WorkspacePane) |
| `--vf-duration-fast`  | `140ms`                                 | Hover/focus, row tint                         |
| `--vf-duration`       | `180ms`                                 | Открытие drawer, переключения акцентов        |
| `--vf-ease`           | `cubic-bezier(0.16, 1, 0.3, 1)`         | Все переходы                                  |
| `--vf-shadow-overlay` | `0 24px 60px -12px oklch(0 0 0 / 0.55)` | Console drawer, source dialog                 |
| `--vf-pane-gap`       | `10px`                                  | Резерв для grid между панелями                |

Mapping shadcn theme variables (`--background`, `--card`, `--popover`,
`--border`, `--input`, `--ring`, `--primary`, `--muted`, `--accent`,
`--destructive`) указывает на соответствующие `--vf-*` токены — это
единственный способ, которым shadcn-компоненты получают тему.

## Typography

- Sans stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Mono stack: `JetBrains Mono`, `SF Mono`, `ui-monospace`, `Menlo`, `Consolas`.
- Базовый размер: `13px`, line-height `1.42`, antialiased.
- Заголовки панели: sans `12–13px`, `600`.
- Eyebrows и счётчики: mono `10–11px`, uppercase `tracking-[0.08em]`
  только для structural labels (`L1 · PICKER`, `EVENTS`, `SOURCE · MACHINE`).
- Event/state/source ids: mono `11–12px`, перенос через
  `overflow-wrap: anywhere` внутри плотных колонок.
- Счётчики и числовые поля: `tabular-nums`.
- Без fluid type. Responsive адаптирует layout, не размер шрифта.

## Shape, Borders, Motion

- Радиусы: `6px` для контролов и chips, `8px` для inner cards и code
  surfaces, `10px` для top-level панелей, `999px` для статус-бейджей.
- Рамки: один пиксель по умолчанию. Side-stripe accents (`box-shadow:
inset 2px 0 0 var(--vf-accent)` или `inset 3px 0 0`) разрешены только
  для двух ролей: current state в machine card и selected/related rows
  в L1/L2/L3 picker. Любые другие side-stripes запрещены.
- Тени: только overlay-поверхности (Console drawer, Source dialog) и
  primary action могут использовать тень. Idle панели не имеют теней.
- Pulse-glow допустим для одной точки-индикатора (current state),
  не для строки или карточки целиком.
- Motion: `140–220ms`, state feedback only. Layout properties не
  анимируются. Допустимы `vfPulseGlow` (1.4s, current state) и `vfRowAppear`
  (0.4s flash на recently-fired ряду).
- Focus: `:focus-visible` обязателен; outline через
  `ring-ring`/`--vf-accent`, `ring-2`, с offset для отдельных кнопок и
  `ring-inset` для строк в плотных списках.

## UI Kit

shadcn baseline установлен локально через `apps/visualizer/components.json`
(независимый от `apps/playground/components.json`).

- Framework: Vite SPA, React, TypeScript, Tailwind CSS v4.
- shadcn base: Radix, style `radix-nova`, alias `@/ui`.
- Icon library: `lucide-react` (единственная).
- CSS entrypoint: `src/styles.css`.

Установленные shadcn компоненты:

- `button`, `badge`, `tabs`, `input`, `select`, `card`, `separator`,
  `scroll-area`, `tooltip`, `alert`, `dialog`.

`card` используется только для graph-domain превью и workbench-карточек,
не для каждой панели. Любая карточка не может быть вложена в другую
карточку.

Ownership rules:

- shadcn-сгенерированные файлы живут под `src/ui/*` и остаются
  generic.
- Visualizer-specific обёртки живут в `src/ui/visualizer.tsx` и
  только presentational. Они не импортируют graph IR, simulator, services,
  store reducers или selectors.
- Стандартные controls используют shadcn variants первыми.
  App-specific обёртки добавляют graph semantic роли и плотную грамматику.
- `SelectItem` всегда внутри `SelectGroup`. `TabsTrigger` всегда внутри
  `TabsList`. Icon-only кнопки всегда обёрнуты в `Tooltip`.

## Component Contracts

### Wrappers (`src/ui/visualizer.tsx`)

| Wrapper                | Назначение                                     | Контракт                                                                                            |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Panel`                | Top-level панель/drawer                        | `flex flex-col`, `rounded-(--vf-radius-lg)`, `border`, `bg-card`                                    |
| `PanelHeader`          | Шапка панели                                   | Высота `h-10`, `bg-[--vf-surface-soft]`, `border-b border-[--vf-border-soft]`                       |
| `PanelBody`            | Скроллируемое тело                             | `min-h-0 flex-1`                                                                                    |
| `PanelKicker`          | Eyebrow-метка                                  | mono `10px`, uppercase, `--vf-text-quiet`                                                           |
| `PanelTitle`           | Eyebrow + title в одну линию                   | `flex items-baseline gap-2`, title `12px/600`, `truncate`                                           |
| `WorkspaceHeader`      | Заголовок над активным workspace               | flex-wrap, eyebrow + title `13px/600`, action group справа                                          |
| `WorkspacePane`        | L1/L2/L3 контейнер внутри workspace            | то же стилевое ядро, что `Panel`, без `overflow-hidden` шапки                                       |
| `IconButton`           | Icon-only square кнопка                        | `size-8`, `border`, `bg-surface-soft`, hover → accent. Требует `aria-label` и `Tooltip`             |
| `PrimaryActionButton`  | Primary CTA (Open visualizer, send)            | `h-8`, `bg-primary`, hover `--vf-accent-strong`, focus ring `--vf-accent`, disabled tone            |
| `DensityRow`           | Плотная строка в picker/topic list             | `min-h-8`, grid `[1fr,auto]`, относительные состояния через `data-relation-state`                   |
| `GraphRow`             | Transition/effect/reducer строка               | grid `[layer,event,to,target,meta]`, mono ids                                                       |
| `LayerBadge`           | `cfg`/`red`/`eff`/`sim` бейдж                  | mono `9px/700`, uppercase, `radius-sm`, фиксированный `min-w-[34px]`                                |
| `StatusBadge`          | Status/diagnostic пилюля                       | `h-5`, `rounded-full`, mono `10px/600`, цветовые тона `ready/muted/domain/actor/routing/diagnostic` |
| `Counter` / `ChipPill` | Счётчики на строках и chips                    | `bg-counter-surface`, mono, `tabular-nums`                                                          |
| `Chip`                 | Кликабельный chip с graph semantic             | `min-h-6`, `radius-sm`, hover/focus → accent                                                        |
| `RoutingPill`          | Routing label inline                           | mono `9px`, тон `--vf-routing`                                                                      |
| `PulseDot`             | Current state индикатор                        | `7px`, `vfPulseGlow` 1.4s                                                                           |
| `SourceSnippet`        | Статичный inline snippet                       | mono `11px`, line numbers справа от линии, accent фон на selected line                              |
| `SourceEditorShell`    | CodeMirror-обёртка для source editor и overlay | dark theme, line numbers, selected line через `--vf-accent-soft`, опциональный `firstLineNumber`    |
| `DiagnosticsAlert`     | Diagnostic alert                               | `--vf-warning` тон, `analyzer` eyebrow                                                              |
| `PaneScrollArea`       | Внутренний скролл панели                       | shadcn `ScrollArea`, `min-h-0 flex-1`                                                               |

### App Shell (`features/shell/Shell.tsx`)

- Один полноэкранный shell: topbar (`auto`) + workspace (`1fr`).
- Topbar: brand mark + sub-title (`stage 12e`), сегментированные tabs с
  counters/diag-badges, source filename pill, compile status pill,
  Console toggle. На `<sm` ширина — секции переносятся вертикально.
- Tabs: shadcn segmented в обёртке `TabsList` с
  `bg-[--vf-surface-soft]`, активный `TabsTrigger` использует
  `--vf-surface-raised` + лёгкая тень `0 1px 2px oklch(0 0 0 / 0.35)`,
  без подчёркивания. Counter активного таба — accent, остальных — neutral.
  `diag {n}` бейдж окрашен warning или danger в зависимости от
  `data-has-error`.
- Workspace: один pane на таб (`Source/System/Events/Machines`). L1/L2
  zones рендерятся в активном табе и не делят горизонталь с Source или
  Console.
- Mobile: topbar секции переносятся; tabs строка скроллится горизонтально;
  workspace стакается в одну колонку.

### Source Workspace

- `WorkspaceHeader` с eyebrow `Source · pasted snippet` и filename.
- Action group: `IconButton` reset (с tooltip) + `PrimaryActionButton`
  «Open visualizer». На `<sm` action group растягивается на ширину.
- Editor: `SourceEditorShell` слева, side panel с двумя карточками
  (`Projection` summary с крупными числами `18px/600` и `Source meta`
  с key/value mono списком). На `<lg` карточки переносятся под editor.
- Подсказка под editor одна короткая строка, без маркетинга.

### System Panel (L1)

- `WorkspaceHeader` + контентный grid: machines | topics | detail.
  На `<lg` колонки стакаются в одну.
- Machines/Topics panes: `WorkspacePane` с `PanelHeader`, `SectionTitle`
  с количеством в badge и `SectionPaneSearch` (`h-8` input, focus ring).
- Строки списка — `DensityRow` с layer/domain/actor бейджами и
  `Counter`-ами. Selected row — `relation="selected"` (accent stripe +
  accent tint), related — `relation="related"`, выключенные — `dimmed`
  (opacity 0.4).
- Detail pane: при отсутствии выбора — компактный empty state с иконкой и
  одной фразой; при выборе — meta, source actions (`IconButton` + tooltip),
  open in workbench — `PrimaryActionButton`.

### Events Panel (L2)

- `WorkspaceHeader` с eyebrow `EVENTS` и `Topic catalog`.
- Layout: catalog list | topic detail. На `<lg` стакается.
- Catalog list: `DensityRow` с `Counter` arrows (`↑` producers,
  `↓` consumers).
- Topic detail: header (`L2 · TOPIC <id>`), `EVENT TOPIC` eyebrow,
  крупный mono id, ряд status badges (producers/consumers/machines/routing).
- Producers/Consumers секции: каждая в `WorkspacePane`-стиле без вложенных
  карточек, заголовок включает `LayerBadge` (`eff`/`cfg`).
- Producer/Consumer строки: machine id, source link (`SourceLink` —
  `Button` с tooltip), confidence chip (`exact`/`fuzzy`), branch counter.
- Routing values: chip-list внутри отдельного блока с eyebrow
  `ROUTING VALUES`. Действие «Open related machines» —
  `Button` с иконкой.

### Machines Panel (L3)

- `WorkspaceHeader` + grid: picker | machine cards (multi-column) |
  simulator. На `<lg` колонки стакаются.
- Picker: `DensityRow` с чекбоксом, kind badge, tag chips, footer-легенда
  цветов.
- Machine card (`WorkspacePane`): header с domain/actor badge,
  `StatusBadge` для current state, `IconButton` Code2 (tooltip «View
  machine source»). State block: pulse-dot + state name + `initial` badge.
  Transitions: `cfg`/`red` строки; effects: `eff` строки.
- Current state получает side-stripe `--vf-accent`, accent tint и pulse
  dot. Recently-fired строка — `vfRowAppear` flash (warning bg → idle).
- Simulator (`Event timeline`): header с running badge и reset
  (`IconButton` + tooltip), описание-подсказка (без маркетинга),
  `Select` события + `PrimaryActionButton` «send», ниже timeline rows.
  Footer: `1 step`/`N steps` мелким mono.

### Machine Canvas Board

- Full-workspace overlay внутри Machines Panel. Surface повторяет top-level
  panel: `rounded-(--vf-radius-lg)`, border, `--vf-bg`, overlay shadow,
  header `--vf-surface`. На mobile занимает тот же workspace bounds и не
  создает horizontal overflow.
- Body: React Flow canvas с dotted background density `22px`, controls в
  `--vf-surface-soft`, скрытая attribution, invisible handles. Graph read-only:
  nodes не draggable, handles не connectable, click по graph item не dispatch-ит
  FSM events.
- Nodes: fixed pre-layout dimensions. Width grows from label length up to
  `420px`; labels occupy their own row and wrap instead of competing with
  badges. `title` still carries the full label. Height grows by label lines,
  wrapped badge rows, wrapped stats rows, emission rows and side degree. Roles:
  normal quiet outline; current accent border/fill; initial accent border;
  terminal/synthetic dashed quiet; spawn badge; wildcard `*` dashed quiet with
  any-state badge; effect-source `*` dashed effect outline/fill.
- Node stats show neutral visual counters with direction glyphs: `← IN`,
  `→ OUT`, `↺ LOOP`. They must not reuse edge semantic colors, because edge
  color communicates transition kind. `emission-only` groups are source-node
  chips (`emits N`) using effect tone and never render as state-to-state edges.
- Edges: accepted transition is solid `--vf-config`; self-emitted transition is
  dashed `--vf-effect`; from-other transition is dotted `--vf-routing`. Labels
  are mono chips with first event plus `+N`, capped at `170px`, and positioned
  by route arc length with bounded collision shifts that avoid other labels and
  node boxes.
- Self loops are manual arcs above the node and stack deterministically by
  index. Non-self edges use ELK layered LR orthogonal routes; missing routes
  fall back to direct paths.
- Hovering an edge label opens a fixed popover built only from Machine Flow
  edge group metadata. Route states are rendered as explicit `from`/`to` (or
  `loop`) rows; grouped event names are a vertical stack of semantic chips, not
  one comma-like text run; producer and row metadata use compact rows with the
  same `cfg`/`red`/`eff` color grammar as L3 machine cards.
- Legend lives in the footer strip and lists accepted, self-emitted, from other,
  and emission-only grammar. Stable diagnostics attributes on graph root:
  `data-density` and `data-visible-edge-count`.

### Source Overlay

- shadcn `Dialog`, открывается из L1 (`view source`), L2 (source link) и
  console targets.
- Header: eyebrow `SOURCE · MACHINE/TOPIC`, крупный mono id, под ним
  `source v{n} · anchors {k} · line {l}, column {c}` (`tabular-nums`),
  `IconButton` close.
- Body: `SourceEditorShell` в read-only с line numbers и `selected line`
  подсветкой через `--vf-accent-soft`.
- Footer: одна `Button` close с иконкой `X`. Esc и backdrop тоже закрывают.
- Source edits/recompile очищают overlay через app state.

### Console Drawer

- Right-side overlay поверх workspace. По умолчанию закрыт. Backdrop —
  `bg-background/70 backdrop-blur-[1px]`. Drawer — `Panel` с
  `shadow-(--vf-shadow-overlay)`, ширина `min(100vw - 1rem, 460px)`.
- Header: `PanelTitle` `Diagnostics / Console` + `IconButton` close
  (`Tooltip` «Close · Esc»).
- Channel strip: `Button` ghost/secondary, активный — `--vf-surface-raised`,
  с компактным счётчиком справа.
- Entry list: каждая запись — кнопка с `border-soft`, hover →
  `--vf-surface-raised`. Содержимое: badges (channel + severity) +
  origin + location + title (mono, bold) + message.
- Empty state: иконка `AlertCircle` + одна фраза.
- Footer: `N entries / filter · {channel}`, mono `10px`.

### Empty / Error / Diagnostic States

- Empty state — компактный блок (иконка + одна фраза), без CTA в виде
  иллюстраций. Различай: «нет модели», «нет совпадений по фильтру»,
  «ничего не выбрано», «нет producers/consumers».
- Diagnostic уровни: `failed`/`blocked` → `--vf-danger` (red dot,
  `diag` бейдж), `warning`/`degraded` → `--vf-warning`, `ready`/`running`
  → `--vf-accent`. Цвет не дублируется иконкой — иконка только усиливает.
- Error fill всегда сопровождается читаемым текстом, без полупрозрачного
  фона на критических путях.

## Accessibility

- Минимальная высота интерактивных таргетов — `32px` в плотном desktop
  режиме (`size-8` для icon, `h-8` для primary action).
- `:focus-visible` обязателен для tabs, buttons, chips, density rows,
  console entries, source actions. Outline идёт от `--vf-accent` через
  `ring-2`, с offset на изолированных кнопках и `ring-inset` на строках
  плотных списков.
- Все icon-only кнопки имеют `aria-label` и `Tooltip`.
- Все badges — текст + цвет; нельзя кодировать значение только цветом.
- Контраст: `text-muted` ≥ 4.5:1 на surfaces; semantic badges — на
  `*-soft` фоне с `*-border` рамкой.
- Keyboard navigation: tabs → topbar actions → активный pane controls →
  console controls (когда drawer открыт).
- Labels могут оставаться английскими (event/state/machine ids),
  UI-копия — короткая, тех. термины не переводятся.

## Responsive Floor

- Минимальная ширина viewport: `320px`.
- На `<sm` topbar секции переносятся вертикально, tab strip скроллится
  горизонтально (`overflow-x-auto`), action groups растягиваются на 100%.
- На `<lg` workspace панели стакаются в одну колонку (`grid-cols-1`),
  карточки сохраняют ту же row-сетку.
- Long event/state/guard/routing строки переносятся через
  `overflow-wrap: anywhere`; колонки не толкают viewport.
- Console остаётся overlay-drawer-ом и обязательно имеет видимый close.

## Testing Hooks

- Стабильные `data-testid` живут в `src/test-ids.ts`.
- Test ids зарезервированы для shell-якорей, tabs, primary controls,
  panels, представительных rows, console entries и timeline controls.
- Семантические atoms: `data-status`, `data-count`,
  `data-machine-id`, `data-event-type`, `data-row-id`,
  `data-relation-state`, `data-empty`, `data-entry-count`. Display copy
  не используется как селектор.
- Accessible names и роли — первичный контракт; test ids — стабильное
  e2e-удобство.

## Prohibited

- Landing pages, hero sections, marketing value props.
- Декоративный gradient text, glass surfaces, blur cards, blobs.
- Любая icon library кроме `lucide-react`; собственные SVG-иконки, когда
  есть подходящий lucide.
- Nested cards, дополнительные side-stripes сверх разрешённых ролей,
  fluid font-size, анимация layout properties.
- Объявление новых CSS-переменных вне `src/styles.css`. Любое изменение
  токенов сопровождается обновлением этого документа.
