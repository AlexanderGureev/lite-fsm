# DESIGN.md

## Назначение

Этот документ описывает только дизайн `apps/playground/`.

Источники истины:

- `apps/playground/app/globals.css`
- `apps/playground/app/layout.tsx`
- `apps/playground/app/page.tsx`
- `apps/playground/components/*`
- `apps/playground/app/examples/**/components/*`
- `apps/playground/lib/examples-manifest.ts`

Документ является строгой спецификацией, а не changelog. Если реализация playground меняет токены, компоненты, навигацию, категорию примеров или поведение состояний, этот файл обновляется в той же правке.

## Регистр

- Тип поверхности: product UI, демо-галерея и интерактивные примеры.
- Тема: только light.
- Базовый фон приложения: `canvas-parchment`.
- Рабочие поверхности: `canvas` cards с `hairline` ring.
- Верхняя навигация: единственная постоянная темная поверхность `surface-black`.
- Общий интерактивный цвет: только `primary`.
- Категорийные акценты применяются только к категориям и карточкам примеров.

## Принципы

- Интерфейс обслуживает изучение примеров. Не добавлять маркетинговые hero-блоки, декоративные секции и паттерны, которых нет в исходниках playground.
- Основная грамматика: светлый фон, плоские карточки, тонкие линии, компактные pill-контролы, моноширинные технические метки.
- Idle-состояния плоские. Тень появляется только у `example-card` на hover, pending-карточек голосования и визуальных объектов, где состояние требует глубины.
- Все стандартные UI-иконки идут из `lucide-react`. Исключения: `LiteFsmMark` и `ExampleDiagram`.
- Градиентный текст разрешен только в `GradientText` внутри hero headline. Декоративные градиенты разрешены только в `HeroBackdrop` и демо-объектах, где они визуализируют состояние.
- Русский используется для объясняющего UI-copy. API-термины, названия событий, source/code affordance и технические метки остаются на английском.

## Цвета

### Core


| Token             | Value     | Use                                                                    |
| ----------------- | --------- | ---------------------------------------------------------------------- |
| `primary`         | `#0061d3` | Основные ссылки, CTA, active state, selected state, pending indicators |
| `primary-focus`   | `#0071e3` | Focus ring и focus-visible outline                                     |
| `primary-on-dark` | `#2997ff` | `LiteFsmMark` на темной навигации                                      |
| `on-primary`      | `#ffffff` | Текст на `primary`                                                     |
| `on-dark`         | `#ffffff` | Текст на `surface-black`                                               |
| `destructive`     | `#b30c00` | Ошибки, failed widgets, validation/error alerts                        |


### Text


| Token          | Value     | Use                                              |
| -------------- | --------- | ------------------------------------------------ |
| `ink`          | `#15151a` | Основной текст на light surfaces                 |
| `body`         | `#15151a` | Alias для основного body текста                  |
| `body-on-dark` | `#ffffff` | Body текст на dark surfaces                      |
| `body-muted`   | `#b8babf` | Muted текст на dark surfaces                     |
| `ink-muted-80` | `#2c2c33` | Описания, secondary copy, длинный текст          |
| `ink-muted-48` | `#5d5d66` | Captions, disabled-like text, counters, metadata |


### Surface


| Token                      | Value                      | Use                                                        |
| -------------------------- | -------------------------- | ---------------------------------------------------------- |
| `canvas`                   | `#ffffff`                  | Cards, hero surface, footer, demo panels                   |
| `canvas-parchment`         | `#eaecf1`                  | App background, muted fills, tag pills, code chips         |
| `surface-pearl`            | `#f3f4f7`                  | Drawing/game inner canvases                                |
| `surface-tile-1`           | `#1f1f24`                  | Reserved dark tile token, not a default playground surface |
| `surface-tile-2`           | `#232328`                  | Reserved dark tile token                                   |
| `surface-tile-3`           | `#1c1c20`                  | Reserved dark tile token                                   |
| `surface-black`            | `#0d0d10`                  | `TopBar` only                                              |
| `surface-chip-translucent` | `rgba(196, 199, 208, 0.7)` | Floating translucent chips if needed                       |


### Borders


| Token          | Value     | Use                                     |
| -------------- | --------- | --------------------------------------- |
| `hairline`     | `#d0d2d8` | Card rings, panel borders, nav dividers |
| `divider-soft` | `#e7e8ec` | Soft internal separators                |


### Categories


| Category  | Solid     | Soft      | Glow HSL       | Use                                |
| --------- | --------- | --------- | -------------- | ---------------------------------- |
| `basics`  | `#475569` | `#e2e8f0` | `215 26% 52%`  | Foundational machines              |
| `effects` | `#0061d3` | `#dceaff` | `212 100% 54%` | Async effects and pending          |
| `actors`  | `#7c3aed` | `#ece4ff` | `268 92% 66%`  | Actor templates, groups, snapshots |
| `ssr`     | `#c2620e` | `#fbe7c8` | `30 96% 54%`   | SSR, streaming, hydration          |


Category colors may tint:

- section dot and short label;
- example-card kicker;
- example-card tag dots;
- example-card diagram color;
- example-card hover CTA;
- `data-glow-card` border glow.

Category colors must not replace `primary` for global actions.

### Gradient Text Stops

`GradientText` uses these HSL CSS variables:


| Token        | Value         |
| ------------ | ------------- |
| `lite-fsm-1` | `332 88% 52%` |
| `lite-fsm-2` | `270 78% 56%` |
| `lite-fsm-3` | `215 95% 50%` |
| `lite-fsm-4` | `185 88% 44%` |
| `lite-fsm-5` | `38 96% 56%`  |


Use this gradient only for the `lite-fsm` word in the homepage hero.

## Typography

Fonts are loaded in `apps/playground/app/layout.tsx`:

- Sans: `Onest`, CSS variable `--font-sans`, weights `300 400 500 600 700`.
- Display: `Unbounded`, CSS variable `--font-display`, weights `400 500 600 700 800`.
- Mono: `JetBrains Mono`, CSS variable `--font-mono`, weights `400 500 600`.

Global base:

- `body`: `font-family: var(--font-sans)`, `color: ink`, antialiased.
- `html`: `font-feature-settings: "ss03"`.

### Text Utilities


| Utility               | Family  | Size   | Weight | Line   | Tracking   |
| --------------------- | ------- | ------ | ------ | ------ | ---------- |
| `text-hero-display`   | display | `56px` | `600`  | `1.07` | `-0.28px`  |
| `text-display-lg`     | display | `40px` | `600`  | `1.1`  | `0`        |
| `text-display-md`     | sans    | `34px` | `600`  | `1.2`  | `-0.374px` |
| `text-lead`           | sans    | `22px` | `400`  | `1.45` | `-0.2px`   |
| `text-lead-airy`      | sans    | `24px` | `300`  | `1.5`  | `0`        |
| `text-tagline`        | display | `21px` | `600`  | `1.19` | `0.231px`  |
| `text-body-strong`    | sans    | `17px` | `600`  | `1.24` | `-0.374px` |
| `text-body`           | sans    | `17px` | `400`  | `1.47` | `-0.374px` |
| `text-dense-link`     | sans    | `17px` | `400`  | `2.41` | `0`        |
| `text-caption`        | sans    | `14px` | `400`  | `1.43` | `-0.224px` |
| `text-caption-strong` | sans    | `14px` | `600`  | `1.29` | `-0.224px` |
| `text-button-large`   | sans    | `18px` | `300`  | `1`    | `0`        |
| `text-button-utility` | sans    | `14px` | `400`  | `1.29` | `-0.224px` |
| `text-fine-print`     | sans    | `12px` | `400`  | `1`    | `-0.12px`  |
| `text-micro-legal`    | sans    | `10px` | `400`  | `1.3`  | `-0.08px`  |
| `text-nav-link`       | sans    | `12px` | `400`  | `1`    | `-0.12px`  |


Inline technical terms use `<code>` with `bg-canvas-parchment`, small horizontal padding and `text-ink`.

## Radius


| Token         | Value    | Use                                                |
| ------------- | -------- | -------------------------------------------------- |
| `radius-sm`   | `8px`    | Diagram frames, inner list items, compact controls |
| `radius-md`   | `11px`   | Example cards, skeletons, compact panels           |
| `radius-lg`   | `18px`   | Demo cards and major panels                        |
| `radius-xl`   | `18px`   | shadcn card compatibility                          |
| `radius-2xl`  | `18px`   | shadcn card compatibility                          |
| `radius-3xl`  | `18px`   | shadcn card compatibility                          |
| `radius-4xl`  | `9999px` | Badges                                             |
| `radius-pill` | `9999px` | CTA, nav chips, badges, pills                      |


Do not introduce new radii between `md` and `lg`.

## Shadows


| Utility          | Value                                                                       | Use                                        |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| `shadow-card`    | `0 1px 2px rgba(15, 17, 26, 0.04), 0 8px 24px -12px rgba(15, 17, 26, 0.12)` | `example-card:hover`, pending vote cards   |
| `shadow-product` | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0`                                        | Lamp ON state and object-like demo visuals |


Idle cards, buttons, badges and panels have no shadow.

## Utilities

### `frosted-parchment`

- Background: `color-mix(in srgb, var(--canvas-parchment) 84%, transparent)`.
- Backdrop filter: `saturate(180%) blur(20px)`.
- WebKit fallback: `-webkit-backdrop-filter: saturate(180%) blur(20px)`.
- Use only for sticky secondary navigation over `canvas-parchment`.

### `data-glow-card`

- Defaults: `--glow-h: 212`, `--glow-s: 95`, `--glow-l: 54`, `--glow-size: 360px`, `--glow-border: 1.5px`.
- Pointer source: global `--spot-x` and `--spot-y` written by `SpotlightTracker`.
- `::before`: fixed radial border glow, masked to the card border; opacity `0.7`, `240ms` opacity transition.
- Hover: `--glow-border: 2.5px`, `::before` opacity `1`.
- `::after`: interior radial glow at `6%` alpha, `280ms` opacity transition, visible on hover/focus.
- Category cards override only `--glow-h`, `--glow-s`, `--glow-l`.

## Layout

### Global Shell

- Root pages use `min-h-screen bg-canvas-parchment text-ink`.
- Page content width: `max-w-6xl`.
- Horizontal page padding: `px-6`.
- Non-SSR example pages: `mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12`.
- SSR example pages: `mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8` inside `StoreProvider`, with `ScreensNav`, `StaticExportNotice`, then page content.
- Homepage examples section: `px-6 py-16 md:py-24`.

### Homepage

`/` consists of:

1. `TopBar`.
2. Hero header: `relative isolate overflow-hidden border-b border-hairline bg-canvas`.
3. Category gallery: one section per category in manifest order.
4. Footer: `border-t border-hairline bg-canvas`.

Hero content:

- container: `mx-auto flex max-w-6xl flex-col gap-7 px-6 py-20 md:py-28`;
- kicker: `text-caption-strong text-primary`;
- h1: `text-display-md md:text-display-lg lg:text-hero-display`;
- body: `max-w-2xl text-body text-ink-muted-80 md:text-lead`;
- stats row: inline `value + uppercase label` pairs with dot separators;
- links: rounded pill, `border-hairline`, `bg-canvas/70`, backdrop blur, `hover:border-primary hover:text-primary`.

### Category Gallery

- Category wrapper: `flex scroll-mt-16 flex-col gap-7`.
- Header: flex-wrap, bottom border `hairline`, `pb-5`.
- Header metadata row: two-digit index in mono, 6px category dot, uppercase short label.
- Header title: `text-display-md`.
- Header description: `max-w-xl text-body text-ink-muted-80`.
- Count: `text-caption text-ink-muted-48`.
- Grid: `grid gap-4 md:grid-cols-2 xl:grid-cols-3`.

Manifest category order:

1. `basics`, label `Старт`, short `Basics`.
2. `effects`, label `Async-эффекты`, short `Effects`.
3. `actors`, label `Actors`, short `Actors`.
4. `ssr`, label `SSR & streaming`, short `SSR`.

### Surface Map


| Route                           | Pattern                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `/`                             | `TopBar`, hero with `HeroBackdrop`, category gallery, footer                          |
| `/examples/lamp`                | Centered object-state card, lamp orb, state badge, three pill buttons, toggle counter |
| `/examples/likes`               | Async vote grid, `VoteButton`, pending badge, pending card ring/shadow                |
| `/examples/likes-v2`            | Same vote grid grammar, pending count from actor instances                            |
| `/examples/actor-canvas`        | Two peer drawing cards, `Separator`, packet inspector, explanatory side card          |
| `/examples/roguelite`           | Phaser frame card, control buttons, compact status/error text                         |
| `/examples/ssr-demo/[screen]`   | SSR shell, `ScreensNav`, static export notice, screen header, two-column widget lists |
| `/examples/ssr-demo-2/[screen]` | SSR shell, manifest/grid screens, three-column widget lists, append button            |
| `/examples/ssr-demo-3/[screen]` | SSR shell, snapshot hydration screens, three-column widget lists, append button       |


## Components

### `TopBar`

- Element: sticky nav.
- Position: `sticky top-0 z-50`.
- Size: `h-12 px-6`.
- Layout: brand link left, external links right.
- Background: `surface-black`.
- Text: `text-on-dark`.
- Brand link: `text-nav-link tracking-wider text-on-dark/90`, hover `text-on-dark`.
- Brand mark: `LiteFsmMark`, `size-4`, `text-primary-on-dark`.
- Qualifier: `· playground`, hidden below `sm`.
- Right links: `Документация`, `GitHub`, `text-nav-link text-on-dark/70`, hover `text-on-dark`.

### `ExamplesSubNav`

- Element: sticky subheader under `TopBar`.
- Position: `sticky top-11 z-40`.
- Size/layout: `h-13 px-6`, `flex items-center justify-between gap-4`.
- Background utility: `frosted-parchment`.
- Border: bottom `hairline`.
- Left side:
  - current example kicker: `text-caption-strong text-primary`;
  - current example title: `truncate text-tagline text-ink`.
- Right side:
  - Source link: `FolderGit2` plus `ArrowUpRight`, `text-button-utility text-ink-muted-80`, hover `primary`;
  - back link: `text-button-utility text-primary`, hover `primary-focus`.

### `HeroBackdrop`

Layer order:

1. 60px grid pattern masked by `radial-gradient(circle at 75% 50%, black 0%, transparent 78%)`.
2. Three blurred radial glows on the right side:
  - blue `rgba(0, 113, 227, 0.38)`, 18s drift;
  - violet `rgba(132, 92, 232, 0.32)`, 24s reverse drift;
  - blue `rgba(96, 165, 250, 0.28)`, 28s drift.
3. Canvas FSM graph:
  - 9 to 12 nodes;
  - connected nearest-neighbor edges;
  - 7 traveling pulses;
  - event shapes: dot, square, diamond, triangle;
  - labels use `9px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`.
4. Copy-protection overlay:
  - mobile: vertical `from-canvas via-canvas/82 to-transparent`;
  - desktop: horizontal `canvas -> color-mix(canvas 88%, transparent) -> transparent`.
5. Bottom fade to `canvas-parchment`, `h-24`.

`prefers-reduced-motion` must stop position advancement and keep the composition readable.

Key constants:

- Node states: `idle`, `ready`, `active`, `loading`, `done`.
- Node area: `x 0.5..0.97`, `y 0.1..0.85`; minimum distance `0.09`; radius `5..9`.
- Edges: 2 nearest neighbors plus one bonus neighbor at `35%`; disconnected components are joined by the closest pair.
- Pulse count: `7`; base speed `0.07..0.14`; fade `0.16`; trail length `8`; trail spacing `0.022`.
- Ripple: life `1.4s`, radius `60px`; DPR is capped at `2`.
- Node drift: amp `0.004..0.012`; x speed `0.18..0.32`; y speed `0.14..0.28`.
- Event weights: `set 4`, `inc 3`, `load 2`, `ok 2`, `tick 3`, `err 1`.
- Event colors: blue `0,113,227`; violet `132,92,232`; cyan `30,170,220`; green `52,168,122`; amber `220,138,60`; slate `110,118,145`.
- RNG seed: `Date.now() ^ 0x9e3779b1`; LCG `seed * 1664525 + 1013904223`.

### `GradientText`

- Only allowed usage: `lite-fsm` in homepage h1.
- Outer element: `relative inline-block align-baseline`.
- Inner text: `lite-fsm-gradient-text relative inline-block font-display font-bold`.
- Gradient: 100deg through `lite-fsm-1..5`, `background-size: 240% 240%`.
- Animation: `lite-fsm-shift 16s ease-in-out infinite`.
- Letter spacing: `-0.045em`.
- Reduced motion: animation disabled.

### `ExampleCard`

- Element: `Link`.
- Attribute: `data-glow-card`.
- Root: `group relative flex h-full overflow-hidden rounded-md bg-canvas outline-none ring-1 ring-hairline`.
- Motion: `transition-shadow duration-300`.
- Hover: `shadow-card`.
- Focus: `focus-visible:ring-2 focus-visible:ring-primary-focus/40`.
- Glow:
  - CSS variables `--glow-h`, `--glow-s`, `--glow-l` come from `categoryStyle`;
  - `::before` draws fixed radial border glow at `--spot-x/--spot-y`;
  - hover increases `--glow-border` from `1.5px` to `2.5px`;
  - `::after` adds low-alpha interior glow on hover/focus.
- Header:
  - padding `px-5 pt-4 pb-3`;
  - left: mono index `NN / kicker`, `11px`, uppercase, `tracking-[0.14em]`;
  - right: mono tags, `10px`, `tracking-[0.06em]`, category dots.
- Diagram frame:
  - `mx-5 mb-4 h-[68px] rounded-sm bg-canvas-parchment/55 ring-1 ring-hairline/70`;
  - internal 12px grid pattern at 28% opacity;
  - diagram color inherited from category text class.
- Body:
  - title: `text-tagline leading-snug text-ink`;
  - description: `text-caption leading-relaxed text-ink-muted-80`;
  - footer: dashed top border `hairline/70`, right-aligned CTA.
- CTA:
  - text `open`;
  - mono `11px`, uppercase, `tracking-[0.14em]`;
  - `ArrowRight size-3 strokeWidth=2.25`;
  - hover translates `x-0.5` and changes to category hover color.

No icon tile, top accent bar or tag-pill footer may be reintroduced unless `ExampleCard` is redesigned and this spec is updated.

### `ExampleDiagram`

- Custom inline SVG, not lucide.
- ViewBox: `0 0 120 56`.
- Allowed variants: `lamp`, `heart`, `actors`, `network`, `gamepad`, `streaming`, `grid`, `snapshot`.
- Accent paths use `currentColor`.
- Muted paths use `ink-muted-48/55`.
- Active nodes use a low-alpha accent halo.
- Diagrams are decorative and must remain `aria-hidden`.

### `SpotlightTracker`

- Registers global `pointermove` listener.
- Writes `--spot-x` and `--spot-y` to `document.documentElement`.
- Updates are batched through `requestAnimationFrame`.
- Only `data-glow-card` consumes these variables.

### `Footer`

- Surface: `bg-canvas`, top border `hairline`.
- Container: `max-w-6xl`, `px-6 py-12`.
- Layout: single column on mobile, `md:flex-row`.
- Brand block:
  - 8px `primary` dot;
  - `lite-fsm` in `text-caption-strong`;
  - `apps/playground` pill in `canvas-parchment`;
  - body copy `text-body text-ink-muted-80`.
- Links:
  - grid `grid-cols-2 sm:grid-cols-3`;
  - headings `text-fine-print uppercase tracking-[0.08em] text-ink-muted-48`;
  - external links use `ArrowUpRight size-3.5 strokeWidth=2`;
  - category links use 6px category dots.

### Demo Page Shell

Non-SSR example pages use:

- `TopBar` and `ExamplesSubNav` from shared layout;
- main container `mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12`;
- cards/panels in `bg-canvas`, `ring-1 ring-hairline`, `rounded-lg`;
- inner canvases, lists and code blocks in `canvas-parchment` or `surface-pearl`.

SSR example pages use:

- `TopBar` and `ExamplesSubNav` from shared layout;
- route-local `StoreProvider`;
- main container `mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8`;
- `ScreensNav`, then `StaticExportNotice`, then page content.

### `Card`

Base shadcn card:

- Root: `flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10`.
- Playground demo override: `gap-0 rounded-lg bg-canvas py-0 ring-1 ring-hairline`.
- Header override: `px-5 pt-5` or `px-6 pt-6`.
- Content override: `px-5 pb-5 pt-4` or `px-6 pb-6 pt-4`.

Do not nest cards inside cards. Use inner `div`, `section`, `li`, `pre`, `canvas` with `rounded-md` when a framed sub-surface is needed.

### `Button`

Base states:

- Default: `bg-primary text-primary-foreground`.
- Secondary: `bg-secondary text-secondary-foreground`.
- Outline: `border-border bg-background`.
- Ghost: no fill until hover.
- Destructive: `bg-destructive/10 text-destructive`.
- Focus: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`.
- Disabled: `pointer-events-none opacity-50`.

Playground CTA overrides:

- Primary demo CTA: `h-auto rounded-pill bg-primary px-4..6 py-2..3 text-on-primary active:scale-[0.95]`.
- Outline secondary action: `rounded-pill border border-primary bg-transparent text-primary active:scale-[0.95]`.
- Ghost utility: `rounded-pill text-ink-muted-80 active:scale-[0.95]`.

### `VoteButton`

- Shape: `rounded-md`, not pill.
- Layout: `flex-1 justify-between gap-3 px-4 py-3`.
- Default: `border-hairline bg-canvas text-caption text-ink`.
- Hover: `border-ink-muted-48/60 bg-canvas-parchment text-ink`.
- Active: `border-primary bg-primary/8 text-primary`.
- Active pending: `bg-primary/14`, inline `PingDot`.
- Count: `font-mono tabular-nums`, `primary` when active, `ink-muted-80` otherwise.
- Press state: `active:scale-[0.97]`.

### `Badge`

- Base: `inline-flex h-5 w-fit rounded-4xl px-2 py-0.5 text-xs font-medium`.
- Common playground form: `rounded-pill bg-canvas-parchment text-caption text-ink-muted-80`.
- Active/status form: `bg-primary/10 text-primary`.
- Error badges use `destructive`; do not invent category-tinted status badges outside category surfaces.

### `Alert`

- Base: `rounded-lg border px-2.5 py-2 text-sm`.
- Neutral demo alert: `border-hairline bg-canvas text-body text-ink`.
- Error widget alert: `border-destructive/30 bg-destructive/5`.
- Error text uses `text-destructive`.

### `Skeleton`

- Base: `animate-pulse rounded-md bg-muted`.
- Widget skeletons sit inside `rounded-lg bg-canvas p-5 ring-1 ring-hairline`.
- Skeleton blocks mimic final content dimensions. Do not use centered spinners for SSR/widget loading.

### `StaticExportNotice`

- Element role: `note`.
- Layout: `flex items-start gap-3`.
- Surface: `rounded-lg border border-hairline bg-canvas px-4 py-3`.
- Text: `text-caption text-ink-muted-80`.
- Icon: lucide `Info`, `size-4`, `text-primary`, `strokeWidth=2`.

### SSR Screens

Screen header:

- `rounded-lg bg-canvas p-5 ring-1 ring-hairline`;
- kicker: `text-caption-strong text-primary`;
- title: `text-tagline text-ink`;
- description: `text-body text-ink-muted-80`.

Screen nav:

- container: `rounded-lg bg-canvas px-5 py-4 ring-1 ring-hairline`;
- screen chips: `rounded-pill border px-3 py-1.5 text-caption`;
- active chip: `border-primary bg-primary/10 text-primary`;
- inactive chip: `border-hairline text-ink-muted-80`, hover `text-ink`;
- profile/status badge: `canvas-parchment` pill.

Widget:

- container: `flex flex-col gap-4 rounded-lg bg-canvas p-5 ring-1 ring-hairline`;
- list items: `rounded-md border border-hairline bg-canvas-parchment p-3`;
- pagination CTA: `rounded-pill bg-primary px-4..5 py-2 text-button-utility text-on-primary`.

### Drawing And Game Surfaces

- Drawing canvas: `aspect-[680/420] rounded-md border border-hairline bg-surface-pearl`.
- Packet inspector: `pre` with `h-[360px] overflow-auto rounded-md border border-hairline bg-canvas-parchment p-4 text-caption leading-relaxed text-ink-muted-80`.
- Phaser frame: `overflow-hidden rounded-md border border-hairline`, inner aspect `23/14`, background `#fafafc`.
- Peer status dots may use domain colors from the demo store, but surrounding UI remains core-token based.

## Iconography

- Use `lucide-react` for UI icons:
  - `ArrowUpRight` for external links;
  - `ArrowRight` for example-card CTA;
  - `FolderGit2` for source link;
  - `Info` for static export notice.
- Lucide strokes:
  - normal inline UI: `strokeWidth=2`;
  - compact technical/source icon: `strokeWidth=1.75`;
  - example-card CTA arrow: `strokeWidth=2.25`.
- Custom SVG is allowed only for:
  - `LiteFsmMark`;
  - `ExampleDiagram` variants.

## Motion

Allowed motion:

- `HeroBackdrop` canvas animation and orb drift.
- `GradientText` 16s background shift.
- `data-glow-card` border and interior glow following pointer position.
- `shadow-card` hover feedback on `ExampleCard`.
- `PingDot` for pending async state.
- `active:scale-[0.95]` or `active:scale-[0.97]` on controls.

Rules:

- Do not animate layout properties.
- State feedback transitions stay in the `150ms..300ms` range.
- Long-running decorative motion must honor `prefers-reduced-motion`.
- Page-load choreography is not part of the playground language.

## Responsive Behavior

- Homepage h1:
  - default: `text-display-md`;
  - `md`: `text-display-lg`;
  - `lg`: `text-hero-display`.
- Hero backdrop:
  - canvas opacity `50%` on mobile, `100%` at `md`;
  - copy overlay is vertical on mobile, horizontal on `md+`.
- Category grid:
  - one column by default;
  - two columns at `md`;
  - three columns at `xl`.
- Footer links:
  - two columns by default;
  - three columns at `sm`.
- TopBar brand qualifier is hidden below `sm`.
- Example subnav title truncates instead of wrapping.
- Actor canvas boards split to two columns at `lg`.
- SSR widget item lists split to two columns at `md`.

All interactive targets should remain at least visually comfortable on touch. Primary CTAs and nav chips use pill padding rather than tiny text-only links when they are task actions.

## Copy

- User-facing explanatory text: Russian.
- Library/API names: `lite-fsm`, `createMachine`, `FSMHydrationBoundary`, event names and folder names stay English.
- Homepage example-card CTA is `open`.
- Source affordance is `Source`.
- Category short labels are English: `Basics`, `Effects`, `Actors`, `SSR`.
- Avoid long instructional text inside the UI. Prefer concise labels plus visible state.

## Prohibited

- Не документировать паттерны, которых нет в текущих `apps/playground/` исходниках.
- Не добавлять второй общий интерактивный акцент.
- Не использовать category colors для global actions, nav links, primary buttons или focus rings.
- Не добавлять idle shadows к cards, buttons или badges.
- Не добавлять dark mode без полного прохода по tokens и components.
- Не вводить новые icon libraries.
- Не добавлять custom SVG UI icons, если существует lucide-иконка.
- Не возвращать неиспользуемые подкомпоненты gallery/card без редизайна и обновления этой спеки.
- Не использовать nested cards.
- Не добавлять декоративные blur/glass surfaces вне `frosted-parchment`, `GradientText` backdrop и `HeroBackdrop`.
- Не использовать gradients для произвольных headings. `GradientText` является единственным text-gradient исключением.

