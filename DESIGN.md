---
version: alpha
name: lite-fsm playground (Apple chassis)
description: An Apple-style photography-first chassis (edge-to-edge tiles, single Action Blue interactive color, SF Pro display headlines) extended for the lite-fsm playground with a four-color category palette (Basics / Effects / Actors / SSR), a lucide-react icon system, an animated FSM-graph hero backdrop, and a card-based example gallery. UI chrome stays minimal — no decorative gradients on chrome, no shadows on idle elements; the playground only adds shadow on `{component.example-card}` hover and a single composited hero backdrop. All accents follow the parent chassis: one Action Blue (#0061d3) for general affordances, four scoped category accents for example surfaces only.

colors:
  primary: "#0061d3"
  primary-focus: "#0071e3"
  primary-on-dark: "#2997ff"
  ink: "#15151a"
  body: "#15151a"
  body-on-dark: "#ffffff"
  body-muted: "#b8babf"
  ink-muted-80: "#2c2c33"
  ink-muted-48: "#5d5d66"
  divider-soft: "#e7e8ec"
  hairline: "#d0d2d8"
  canvas: "#ffffff"
  canvas-parchment: "#eaecf1"
  surface-pearl: "#f3f4f7"
  surface-tile-1: "#1f1f24"
  surface-tile-2: "#232328"
  surface-tile-3: "#1c1c20"
  surface-black: "#0d0d10"
  surface-chip-translucent: "rgba(196, 199, 208, 0.70)"
  on-primary: "#ffffff"
  on-dark: "#ffffff"
  destructive: "#b30c00"
  accent-basics: "#475569"
  accent-basics-soft: "#e2e8f0"
  accent-effects: "#0061d3"
  accent-effects-soft: "#dceaff"
  accent-actors: "#7c3aed"
  accent-actors-soft: "#ece4ff"
  accent-ssr: "#c2620e"
  accent-ssr-soft: "#fbe7c8"

typography:
  hero-display:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: -0.28px
  display-lg:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0
  display-md:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 34px
    fontWeight: 600
    lineHeight: 1.47
    letterSpacing: -0.374px
  lead:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.14
    letterSpacing: 0.196px
  lead-airy:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 24px
    fontWeight: 300
    lineHeight: 1.5
    letterSpacing: 0
  tagline:
    fontFamily: "SF Pro Display, system-ui, -apple-system, sans-serif"
    fontSize: 21px
    fontWeight: 600
    lineHeight: 1.19
    letterSpacing: 0.231px
  body-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: -0.374px
  body:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: -0.374px
  dense-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 2.41
    letterSpacing: 0
  caption:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: -0.224px
  caption-strong:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: -0.224px
  button-large:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.0
    letterSpacing: 0
  button-utility:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.29
    letterSpacing: -0.224px
  fine-print:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.12px
  micro-legal:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: -0.08px
  nav-link:
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.12px

rounded:
  none: 0px
  xs: 5px
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 17px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 11px 22px
  button-primary-focus:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-primary-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-secondary-pill:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 11px 22px
  button-dark-utility:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.button-utility}"
    rounded: "{rounded.sm}"
    padding: 8px 15px
  button-pearl-capsule:
    backgroundColor: "{colors.surface-pearl}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 8px 14px
  button-store-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-large}"
    rounded: "{rounded.pill}"
    padding: 14px 28px
  button-icon-circular:
    backgroundColor: "{colors.surface-chip-translucent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: 44px
  text-link:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.body}"
  text-link-on-dark:
    backgroundColor: transparent
    textColor: "{colors.primary-on-dark}"
    typography: "{typography.body}"
  global-nav:
    backgroundColor: "{colors.surface-black}"
    textColor: "{colors.on-dark}"
    typography: "{typography.nav-link}"
    height: 44px
  sub-nav-frosted:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.tagline}"
    height: 52px
  product-tile-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-parchment:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-dark:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  product-tile-dark-2:
    backgroundColor: "{colors.surface-tile-2}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  product-tile-dark-3:
    backgroundColor: "{colors.surface-tile-3}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.none}"
  store-utility-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.lg}"
    padding: 24px
  configurator-option-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 12px 16px
  configurator-option-chip-selected:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  search-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: 12px 20px
    height: 44px
  floating-sticky-bar:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: 64px
    padding: 12px 32px
  environment-quote-card:
    backgroundColor: "{colors.surface-tile-1}"
    textColor: "{colors.on-dark}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
    padding: 80px
  footer:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink-muted-80}"
    typography: "{typography.fine-print}"
    padding: 64px
  top-bar:
    backgroundColor: "{colors.surface-black}"
    textColor: "{colors.on-dark}"
    typography: "{typography.nav-link}"
    height: 48px
    padding: 0 24px
  example-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.tagline}"
    rounded: "{rounded.lg}"
    padding: 24px
    accentBar: 3px
  category-icon-tile:
    backgroundColor: "{colors.canvas-parchment}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    size: 40px
    iconSize: 20px
  ping-dot:
    backgroundColor: "{colors.primary}"
    size: 8px
    rounded: "{rounded.full}"
  category-section-header:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    borderBottom: "1px solid {colors.hairline}"
    padding: 0 0 20px 0
  hero-backdrop:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.none}"
    padding: 0
  stats-inline:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    rounded: "{rounded.none}"
    padding: 0
---

## Overview

Apple's web presence is a masterclass in **reverent product photography framed by near-invisible UI**. Every page is a stack of edge-to-edge product "tiles" — alternating light and dark canvases, each centered on a hero headline, a one-line tagline, two tiny blue pill CTAs, and an impossibly crisp product render. Nothing competes with the product. Typography is confident but quiet; color is either pure white, an off-white parchment, or a near-black tile; interactive elements are a single, quiet blue.

Density is unusually low even by contemporary SaaS standards. Each tile occupies roughly one viewport, and there is no decorative chrome — no borders, no gradients, no decorative frames, no shadows on headlines. Elevation appears only when a product image rests on a surface (a single soft `rgba(0, 0, 0, 0.22) 3px 5px 30px` drop for visual weight). The result is a catalog that feels more like a museum gallery: the wall disappears and the artifact takes over.

Store and shop surfaces retain the same chassis but switch modes. The product configurator (iPhone 17 Pro, accessories grid) introduces a tight grid of white utility cards at `{rounded.lg}` (18px) radius with a thin border, paired with a persistent thin sub-nav strip. The environment page leans darker and more editorial. Across all five surfaces the typographic system, spacing rhythm, and the single blue accent are consistent — this is one design language expressed at different volumes.

**Key Characteristics:**
- Photography-first presentation; UI recedes so the product can speak.
- Alternating full-bleed tile sections: white/parchment ↔ near-black, with the color change itself acting as the section divider.
- Single blue accent (`{colors.primary}` — #0061d3) carries every general interactive element. The playground adds a tightly scoped four-color **category palette** (`{colors.accent-basics / -effects / -actors / -ssr}`) used only on category surfaces — never as general affordance.
- Two button grammars: tiny blue pill CTAs (`{rounded.pill}`) and compact utility rects (`{rounded.sm}`).
- SF Pro Display + SF Pro Text on the Apple chassis. The playground substitutes Inter (variable, with `font-feature-settings: "ss03"`) — see *Note on Font Substitutes*.
- Whisper-soft elevation used only when a product image needs to breathe — exactly one drop-shadow in the photography chassis. The playground adds a milder `shadow-card` reserved for `{component.example-card}` hover.
- Tight two-row nav: slim `{component.top-bar}` + surface-specific `{component.sub-nav-frosted}`.
- Section rhythm across multiple pages: light hero → dark product tile → light utility tile → dark tile → parchment footer — a predictable pulse.
- Iconography is **lucide-react only**, with one deliberate exception: the brand mark (`{component.brand-mark}`) is a custom in-house glyph. See `## Iconography`.

## Colors

> **Source pages analyzed:** homepage, environment, store, iPhone 17 Pro buy page, accessories index. The color system is identical across all five surfaces; only the surface-mode mix differs.

### Brand & Accent
- **Action Blue** (`{colors.primary}` — #0061d3): The single brand-level interactive color. All text links, all blue pill CTAs, and the focus ring root. The universal "click me" signal. Press state shifts via active scale transform rather than a hex change. Slightly more saturated than Apple's stock #0066cc to read better on the playground's denser parchment.
- **Focus Blue** (`{colors.primary-focus}` — #0071e3): A marginally brighter sibling of Action Blue, reserved for the keyboard focus ring on buttons (`outline: 2px solid` / `ring-3` at 40% opacity in production).
- **Sky Link Blue** (`{colors.primary-on-dark}` — #2997ff): A brighter blue used on dark surfaces for in-copy links and inline callouts, where Action Blue would disappear against the tile background. Also used for the brand mark in the top-bar.
- **Destructive** (`{colors.destructive}` — #b30c00): Reserved exclusively for error states (failed widget fetch, validation). Never decorative.

### Category Accents
The playground groups examples into four conceptual buckets. Each bucket has a tinted accent that surfaces on the example card top-bar, the category icon-tile, the section dot, and the inline `Открыть →` CTA. **These accents are scoped to category surfaces only** — they never compete with `{colors.primary}` for general UI affordances.

| Token | Solid | Soft | Use |
|---|---|---|---|
| `{colors.accent-basics}` / `{colors.accent-basics-soft}` | #475569 (slate) | #e2e8f0 | Foundational machine examples (e.g. lamp on/off) |
| `{colors.accent-effects}` / `{colors.accent-effects-soft}` | #0061d3 (blue) | #dceaff | Async-effects examples (optimistic, pending, errors) |
| `{colors.accent-actors}` / `{colors.accent-actors-soft}` | #7c3aed (violet) | #ece4ff | Actor-template, actor-group, hydration examples |
| `{colors.accent-ssr}` / `{colors.accent-ssr-soft}` | #c2620e (amber) | #fbe7c8 | SSR streaming and snapshot-hydration examples |

The **soft** variant is the icon-tile background; the **solid** variant is the 3px top-accent bar, the section header dot, the kicker text, and the hover CTA color. Pairing solid + soft keeps the system within WCAG AA on the parchment canvas.

### Surface
- **Pure White** (`{colors.canvas}` — #ffffff): The dominant canvas. Content, utility cards, hero backdrop, example cards.
- **Parchment** (`{colors.canvas-parchment}` — #eaecf1): The page background between hero and footer. Slightly cooler and a touch denser than Apple's #f5f5f7 to give cards more separation against the canvas.
- **Pearl Button** (`{colors.surface-pearl}` — #f3f4f7): Near-white fill for secondary surfaces (canvas inside drawing boards, scratch surfaces). Always lighter than `{colors.canvas-parchment}` so it still reads as elevated against the parchment page.
- **Near-Black Tile 1** (`{colors.surface-tile-1}` — #1f1f24): Primary dark-tile surface (reserved for future dark sections; not currently used in the playground hero).
- **Near-Black Tile 2** (`{colors.surface-tile-2}` — #232328): Micro-step lighter variant for stacked dark tiles.
- **Near-Black Tile 3** (`{colors.surface-tile-3}` — #1c1c20): Micro-step darker variant for embedded player frames and code-blocks on dark.
- **Surface Black** (`{colors.surface-black}` — #0d0d10): The top-bar background. Just off pure black so the brand mark's edges don't ghost.
- **Translucent Chip Gray** (`{colors.surface-chip-translucent}` — `rgba(196, 199, 208, 0.70)`): Base hex `#c4c7d0` used at ~70% alpha for translucent chips floating over photography or canvas demos.

### Text
- **Near-Black Ink** (`{colors.ink}` — #15151a): Voice of every headline and body paragraph. Slightly cooler than Apple's #1d1d1f to balance the cooler parchment.
- **Body** (`{colors.body}` — #15151a): Same hex as ink — one near-black tone for all text on light surfaces.
- **Body On Dark** (`{colors.body-on-dark}` — #ffffff): All text on the top-bar.
- **Body Muted** (`{colors.body-muted}` — #b8babf): Secondary copy on dark tiles where pure white would be too loud.
- **Ink Muted 80** (`{colors.ink-muted-80}` — #2c2c33): Description copy in cards, footer body. Carries hierarchy below the heading without going gray.
- **Ink Muted 48** (`{colors.ink-muted-48}` — #5d5d66): Disabled button text, legal fine-print, kicker labels, secondary captions ("3 примеров"). Darker than Apple's #7a7a7a so it stays AA-compliant on `{colors.canvas-parchment}`.

### Hairlines & Borders
- **Divider Soft** (`{colors.divider-soft}` — #e7e8ec): "Whisper border" — used for inner card dividers and ghost-button rings. Not a hard line.
- **Hairline** (`{colors.hairline}` — #d0d2d8): The 1px hairline border on every card, the example tile ring, sub-nav border, and section-header underline. Darker than Apple's stock #e0e0e0 because the parchment background is denser.

### Brand Gradient
**No decorative gradients on chrome.** The single exception is the **hero backdrop**: a layered composition of three soft radial-glows (Action Blue, violet, amber-orange) and a CSS-grid pattern with a radial mask, sitting behind a `<canvas>` FSM-graph animation. The composition lives only in the hero region and is masked out by an over-painted `linear-gradient(to right, var(--canvas) 0% → transparent 60%)` on desktop / `linear-gradient(to bottom, var(--canvas) → transparent)` on mobile, so text always sits on a near-solid surface. See `{component.hero-backdrop}`.

## Iconography

The playground uses **`lucide-react`** as the single icon library. No custom SVGs in component code — every icon is a typed lucide component imported by name.

### Defaults
- **Stroke width**: `1.75` for category tiles inside cards (`{component.category-icon-tile}`); `2` for inline UI affordances (top-bar brand mark, footer arrows); `2.25` for the hover CTA arrow (more punch).
- **Size**: `size-5` (20px) inside `{component.category-icon-tile}`; `size-3.5` (14px) for footer/CTA arrows; `size-4` (16px) for the brand mark.
- **Color**: always `currentColor` — set the parent's text color and the icon follows. This is what lets the same icon component swap palette per category.

### Icon Map
| Surface | Icon | Why |
|---|---|---|
| Brand mark (top-bar) | custom `LiteFsmMark` | Two nodes joined by a transition link — the smallest legible FSM (current state ↔ next state). The only non-lucide glyph in the system. |
| External link arrow | `ArrowUpRight` | Universal "this leaves the site" signal; replaces the `↗` unicode character which renders inconsistently across faces. |
| Inline CTA arrow | `ArrowRight` | "This stays in-app, follow the flow" — paired with `Открыть` on card hover. |
| `lamp` example | `Lightbulb` | Direct visual metaphor. |
| `likes` example | `Heart` | Direct visual metaphor. |
| `likes-v2` example | `Users` | Multiple actor instances live at the same time. |
| `actor-canvas` example | `Spline` | A drawn curve — the snapshot stream between two stores. |
| `roguelite` example | `Gamepad2` | A real controller (avoid `Gamepad`, which is a flat D-pad). |
| `ssr-demo` example | `Server` | Long-lived store talking to streaming widgets. |
| `ssr-demo-2` example | `Grid` | Manifest of grid items. |
| `ssr-demo-3` example | `Camera` | Snapshot — the literal noun. |

### Don't
- Don't ship hand-rolled SVGs for icons we already have in lucide. Hand-rolled paths drift in stroke width, optical alignment, and viewBox. The single exception is `{component.brand-mark}` — the brand glyph is intentionally bespoke because lucide does not (and should not) ship vendor brand marks.
- Don't use unicode arrow glyphs (`↗`, `→`, `⇢`) for affordances. They render at the host font's metrics and break alignment.
- Don't paint over `currentColor` with a hard hex on icons inside categorized surfaces — the color must follow the parent text token so category remapping works.

## Typography

### Font Family
- **Display**: `SF Pro Display, system-ui, -apple-system, sans-serif` — Apple's proprietary display face, optimized for sizes ≥ 19px. Defines the voice of every headline.
- **Body / UI**: `SF Pro Text, system-ui, -apple-system, sans-serif` — the text-optimized variant used for body copy, captions, buttons, and links below 20px.
- **OpenType features**: `font-variant-numeric: numerator` is enabled on numeric links (pricing tables, spec sheets). Display sizes rely on tight tracking rather than contextual ligatures.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.hero-display}` | 56px | 600 | 1.07 | -0.28px | Hero headline; the signature "Apple tight" tracking |
| `{typography.display-lg}` | 40px | 600 | 1.10 | 0 | Tile headlines atop every product tile |
| `{typography.display-md}` | 34px | 600 | 1.47 | -0.374px | Section heads (SF Pro Text at display proportions) |
| `{typography.lead}` | 28px | 400 | 1.14 | 0.196px | Product tile subcopy |
| `{typography.lead-airy}` | 24px | 300 | 1.5 | 0 | Environment-page lead paragraphs (the rare weight 300) |
| `{typography.tagline}` | 21px | 600 | 1.19 | 0.231px | Sub-tile tagline; sub-nav category name |
| `{typography.body-strong}` | 17px | 600 | 1.24 | -0.374px | Inline strong emphasis |
| `{typography.body}` | 17px | 400 | 1.47 | -0.374px | Default paragraph |
| `{typography.dense-link}` | 17px | 400 | 2.41 | 0 | Footer / store utility link lists (relaxed leading) |
| `{typography.caption}` | 14px | 400 | 1.43 | -0.224px | Secondary captions, button text |
| `{typography.caption-strong}` | 14px | 600 | 1.29 | -0.224px | Emphasized captions |
| `{typography.button-large}` | 18px | 300 | 1.0 | 0 | Store hero CTAs (the rare weight 300) |
| `{typography.button-utility}` | 14px | 400 | 1.29 | -0.224px | Utility/nav button labels |
| `{typography.fine-print}` | 12px | 400 | 1.0 | -0.12px | Fine-print, footer body |
| `{typography.micro-legal}` | 10px | 400 | 1.3 | -0.08px | Micro legal disclaimers |
| `{typography.nav-link}` | 12px | 400 | 1.0 | -0.12px | Global nav menu items |

### Principles

- **Negative letter-spacing at display sizes.** Every headline at 17px and up carries a slight tracking tighten (`-0.12 → -0.374px`). This produces the iconic "Apple tight" headline cadence. Never used at 12px or below.
- **Body copy at 17px, not 16px.** Apple breaks the SaaS convention and runs paragraph text at 17px. The extra pixel gives the page an unmistakable "reading, not scanning" pace.
- **Weight 300 is real and rare.** Used deliberately on a handful of large-size reads (`{typography.button-large}` at 18px/300 and `{typography.lead-airy}` at 24px/300). It's not an accident — it's a light-atmosphere cue reserved for moments where the content should feel airy.
- **Weight 600, not 700, for headlines.** Apple's headlines sit at weight 600. Weight 700 is used sparingly for `{typography.tagline}` (21px) when a touch more assertion is needed.
- **Line-height is context-specific.** Display sizes use 1.07–1.19 (tight). Body uses 1.47. Utility link stacks in the footer/store use an unusually relaxed 2.41 (`{typography.dense-link}`). The 2.41 is not a bug — it's how the footer's dense link columns breathe.
- **Weight 500 is deliberately absent.** The ladder is 300 / 400 / 600 / 700. Mid-weight readings always use 600.

### Note on Font Substitutes
SF Pro is Apple's proprietary system font. When building off-system:

- Use `system-ui, -apple-system, BlinkMacSystemFont` as the first stack entry — on macOS/iOS/Safari this resolves to the real SF Pro.
- For non-Apple platforms, **Inter** (Google Fonts, variable) is the closest open-source equivalent. Inter at weight 600 with `font-feature-settings: "ss03"` approximates SF Pro's rounded "a" character.
- Nudge `letter-spacing` down by `-0.01em` on display sizes to re-create the Apple tight feel; Inter's default tracking runs slightly wider than SF Pro.
- For body text, tighten line-height by `0.03` (from 1.47 → 1.44) when substituting Inter — Inter's taller x-height needs less leading.

## Layout

### Spacing System
- **Base unit:** 8px. Sub-base values (2, 4, 5, 6, 7) are used for tight typographic adjustments; structural layout snaps to 8/12/16/20/24.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 17px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **Section vertical padding:** `{spacing.section}` (80px) inside a product tile; tiles stack edge-to-edge with 0 gap (the color change provides the break).
- **Card padding:** `{spacing.lg}` (24px) inside utility grid cards.
- **Button padding:** 8–11px vertical, 15–22px horizontal.
- **Universal rhythm constants:** the 17px body line-height multiplier (~25px line) and 21px tagline size show up on every analyzed page.

### Grid & Container
- **Max content width:** ~980px on text-heavy sections (environment), ~1440px on product grids (store, accessories), full-bleed for product tiles (homepage).
- **Column patterns:** 3 to 5 column utility card grid on store/accessories; 2-column side-by-side tiles on homepage occasional sections; single-column centered stack on product tile heroes.
- **Gutters:** 20–24px between cards in a utility grid.

### Whitespace Philosophy
Apple's whitespace is the product's pedestal. Every tile begins with at least 64px of air above its headline and 48–64px below. Product renders are never crowded; the nearest content to a product image is at least 40px away. The footer is the only area that breaks this — there, Apple goes deliberately dense to make the full information architecture visible at a glance.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Full-bleed tiles, top-bar, footer, body sections |
| Soft hairline | 1px `{colors.hairline}` ring | Example cards, store utility cards, sub-nav border |
| Backdrop blur | `backdrop-filter: saturate(180%) blur(20px)` on Parchment 84% | `{component.sub-nav-frosted}`, `{component.floating-sticky-bar}`, `{component.hero-pill-link}` |
| Card shadow (hover only) | `0 1px 2px rgba(15, 17, 26, 0.04), 0 8px 24px -12px rgba(15, 17, 26, 0.12)` | `{component.example-card}` on hover, `{component.vote-button}`'s hosting card during pending |
| Product shadow | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0` | Product renders resting on a surface (the only "photographic" shadow) |

### Motion Tokens
- `hero-orb-drift` — 14 / 18 / 22 s ease-in-out infinite, `translate3d(2%, -3%, 0) scale(1.08)` at midpoint. Applied to the three radial-glow orbs in `{component.hero-backdrop}` so they drift independently.
- `animate-ping` (Tailwind built-in) — used by the back layer of `{component.ping-dot}`.
- All motion respects `prefers-reduced-motion: reduce` — the FSM-graph events freeze in place; orbs stop drifting.

**Shadow philosophy.** Apple uses **exactly one** drop-shadow, and it is applied to photographic product imagery — never to cards, never to buttons, never to text. Elevation in the UI comes from (a) surface-color change (light tile ↔ dark tile) and (b) backdrop-blur on sticky bars. The single shadow is about giving the product weight, not about UI hierarchy.

### Decorative Depth
- **Atmospheric imagery** on the environment page (photographic vista) supplies mood; no CSS gradient involved.
- **Edge-to-edge tile alternation** creates rhythm without borders or shadows — the color change itself is the divider.
- **Backdrop-filter blur** on `{component.sub-nav-frosted}` and `{component.floating-sticky-bar}` creates a "floating over content" effect that's functional, not decorative.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed product tiles (no corner rounding) |
| `{rounded.xs}` | 5px | Inline links when styled as subtle chips (rare) |
| `{rounded.sm}` | 8px | Dark utility buttons (Sign In, Bag), inline card imagery |
| `{rounded.md}` | 11px | White Pearl Button capsules |
| `{rounded.lg}` | 18px | Store utility cards, accessories grid cards |
| `{rounded.pill}` | 9999px | Primary blue pill CTAs, sub-nav buy button, configurator option chips, search input — the signature Apple pill |
| `{rounded.full}` | 9999px / 50% | Circular control chips floating over photography |

### Photography Geometry
- **Hero imagery**: full-bleed, 21:9 or taller on the homepage; 16:9 on environment and shop pages. Product renders are photographic-realistic, often shot on a tinted surface that becomes the tile background.
- **Product renders**: PNG/WebP with transparency; rest on a surface tile and pick up the system shadow.
- **Accessory grid**: square 1:1 crops at `{rounded.lg}` (18px) radius, light neutral backgrounds, product centered with 20–40px internal padding.
- **No rounded imagery in hero tiles** — images are full-bleed rectangular. Rounding (`{rounded.sm}`, `{rounded.lg}`) appears only on inline card imagery.
- Lazy-loading via responsive `srcset` and `sizes` across all breakpoints; CDN-optimized WebP.

## Components

### Top Navigation

**`top-bar`** — Persistent, ultra-thin near-black nav bar pinned to the top of every page. Background `{colors.surface-black}`, height 48px (4px taller than Apple's stock 44px to give the brand mark visual room), text `{colors.on-dark}` in `{typography.nav-link}` (12px / 400 / -0.12px tracking). Left cluster: `{component.brand-mark}` (`{colors.primary-on-dark}`, 16px) + `lite-fsm` wordmark + dot + `playground` muted label (the dot/playground hide below `sm`). Right cluster: `Документация` and `GitHub` external links — quiet, spaced 20px apart. On hover the brand wordmark steps from `text-on-dark/90` to `text-on-dark`; nav links from `text-on-dark/70` to `text-on-dark`. The brand mark itself does not zoom on hover (intentionally calm — anything that animates competes with the hero graph).

**`brand-mark`** — Custom inline SVG (`<LiteFsmMark>`) that replaces a lucide glyph in the top-bar. `viewBox` 24×24, `stroke="currentColor"`, `stroke-width=2`, `stroke-linecap="round"`, `stroke-linejoin="round"` so it lives inside the same drawing grammar as the lucide set. Geometry: a filled disc on the left (cx=5, r=3) is the *current* state, a hollow ring on the right (cx=19, r=3) is the *next* state, joined by a horizontal `M8.5 12 h7` transition link — the smallest legible FSM (one transition between two states). Direction is intentionally implicit: at brand-mark scale the filled→hollow contrast carries enough "from / to" semantics without an arrow head, which would clutter the 16px footprint. Color is taken from `currentColor` so the mark inherits `{colors.primary-on-dark}` from the top-bar wordmark. No fill gradient, no animation, no hover scale — a calm calligraphic mark that doesn't compete with the hero `<canvas>` graph.

**`sub-nav-frosted`** — Surface-specific nav that sticks below `{component.top-bar}` on example pages. Background `{colors.canvas-parchment}` at 84% opacity with `backdrop-filter: saturate(180%) blur(20px)`. Height 52px. Left: example kicker in `{typography.caption-strong}` (`{colors.primary}`) + example title in `{typography.tagline}` (`{colors.ink}`). Right: `← На главную` link in `{typography.button-utility}` (`{colors.primary}`) — only shown on a concrete example page, hidden on the examples index. The right link disappears on the examples index because the page itself is "all examples" and a back-link there is duplicate.

### Buttons

**`button-primary`** — The signature Apple action. Background `{colors.primary}` (Action Blue #0066cc), text `{colors.on-primary}` in `{typography.body}` (SF Pro Text 17px / 400), rounded `{rounded.pill}` (full pill — capsule-shaped), padding 11px × 22px. The full-pill radius IS the brand action signal.
- Active state: `{component.button-primary-active}` — `transform: scale(0.95)` (the system-wide micro-interaction).
- Focus state: `{component.button-primary-focus}` — 2px solid `{colors.primary-focus}` outline.

**`button-secondary-pill`** — Used as the second CTA when two blue pills appear together ("Learn more" / "Buy"). Background transparent, text `{colors.primary}`, 1px solid `{colors.primary}` border, rounded `{rounded.pill}`, padding 11px × 22px. Reads as a "ghost pill."

**`button-dark-utility`** — Global nav actions (Sign In, Bag, language selector). Background `{colors.ink}` (#1d1d1f), text `{colors.on-dark}` in `{typography.button-utility}` (14px / 400 / -0.224px tracking), rounded `{rounded.sm}` (8px), padding 8px × 15px. Active state shrinks via `transform: scale(0.95)`.

**`button-pearl-capsule`** — Product-card secondary button. Background `{colors.surface-pearl}` (#fafafc), text `{colors.ink-muted-80}` in `{typography.caption}` (14px), 3px solid `{colors.divider-soft}` border (functions as a soft ring rather than a visible line), rounded `{rounded.md}` (11px), padding 8px × 14px.

**`button-store-hero`** — A larger primary CTA used on store hero surfaces. Same Action Blue + Paper White as `{component.button-primary}`, but with `{typography.button-large}` (18px / 300 — note the rare weight 300) and slightly more padding (14px × 28px). Used sparingly on the store landing.

**`button-icon-circular`** — Floats over photography. 44 × 44px, background `{colors.surface-chip-translucent}` at ~64% alpha, icon in `{colors.ink}`, rounded `{rounded.full}`. Used for carousel controls, close buttons, and in-image controls (product image thumbnails on the iPhone buy page).

**`text-link`** — Inline body links in `{colors.primary}` (Action Blue). Underlined or non-underlined per context.

**`text-link-on-dark`** — Inline body links on dark tiles in `{colors.primary-on-dark}` (Sky Link Blue #2997ff) — Action Blue would disappear against `{colors.surface-tile-1}`.

### Cards & Containers

**`product-tile-light`** — Full-bleed light tile. Background `{colors.canvas}` (white), text `{colors.ink}`, rounded `{rounded.none}` (0 — tiles touch edges), vertical padding `{spacing.section}` (80px). Centered stack: product name in `{typography.display-lg}` (40px / 600) → one-line tagline in `{typography.lead}` (28px / 400) → two `{component.button-primary}` CTAs ("Learn more" / "Buy") → product render resting on the surface with the system shadow.

**`product-tile-parchment`** — Same as `{component.product-tile-light}` but on `{colors.canvas-parchment}` (#f5f5f7). Used to break two consecutive white tiles.

**`product-tile-dark`** — Full-bleed dark tile. Background `{colors.surface-tile-1}` (#272729), text `{colors.on-dark}`, rounded `{rounded.none}`, vertical padding `{spacing.section}` (80px). Same content stack as the light tile but with `{component.text-link-on-dark}` for inline copy and `{component.button-primary}` (Action Blue still works on the dark surface). Used on the homepage product grid as the alternating dark band.

**`product-tile-dark-2`** — Variant on `{colors.surface-tile-2}` (#2a2a2c). Used where a dark tile sits directly above or below `{component.product-tile-dark}` to create the faintest separation through micro-step lightness change.

**`product-tile-dark-3`** — Variant on `{colors.surface-tile-3}` (#252527). Used at the bottom of the stack and in embedded video/player frames.

**`store-utility-card`** — Used in store grid and accessories grid. Background `{colors.canvas}` (white), 1px solid `{colors.hairline}` border, rounded `{rounded.lg}` (18px), padding `{spacing.lg}` (24px). Top: product image (1:1 crop with `{rounded.sm}` (8px) inner image radius). Below: product name in `{typography.body-strong}` (17px / 600), price in `{typography.body}` (17px / 400), and a `{component.text-link}` ("Buy" or "Learn more"). No shadow by default; product render itself carries the system product-shadow.

**`configurator-option-chip`** — Pill-shaped tappable cell used in the iPhone 17 Pro buy page. Background `{colors.canvas}`, text `{colors.ink}` in `{typography.caption}`, rounded `{rounded.pill}`, padding 12px × 16px. Contains a small product thumbnail + label + price delta. Arranged in a grid of 4–5 options per row.

**`configurator-option-chip-selected`** — Selected state. Border upgrades to 2px solid `{colors.primary-focus}`. Same shape, same content.

**`environment-quote-card`** — A photographic-canvas hero specific to the environment page. Dark photographic backdrop (mountain vista at dawn) with `{colors.surface-tile-1}` as the fallback color, centered white-text headline in `{typography.display-lg}` (40px), small green "Apple 2030" pictographic logo above the headline, single `{component.button-primary}` below. Padding `{spacing.section}` (80px).

**`floating-sticky-bar`** — Floats at the bottom of the viewport on the iPhone 17 Pro buy page during scroll. Background `{colors.canvas-parchment}` at 80% opacity with `backdrop-filter: blur(N)`, height 64px, padding 12px × 32px. Left: running price total in `{typography.body}`. Right: `{component.button-primary}` ("Add to Bag").

### Playground Patterns

**`example-card`** — The unit of the playground gallery. Background `{colors.canvas}`, 1px ring `{colors.hairline}`, rounded `{rounded.lg}` (18px). A 3px **top-accent bar** in the example's category color sits flush at `inset-x-0 top-0` — that single element carries the categorial signal across the grid. Header row: `{component.category-icon-tile}` on the left + uppercase kicker in the category accent color on the right. Body: title in `{typography.tagline}`, description in `{typography.body}` `{colors.ink-muted-80}`. Footer: tag pills (small, `{colors.canvas-parchment}` background, `{typography.fine-print}`) on the left + hover-only "Открыть → " in the category color on the right. The footer is anchored with `flex-1 justify-between` so all cards in a row align their footers regardless of description length. Hover: `-translate-y-0.5`, `shadow-card`, ring upgrades to `{colors.primary}` at 40% opacity.

**`category-icon-tile`** — A 40 × 40 square (`size-10`) carrying the example's lucide icon. Background uses the category's `-soft` token (e.g. `{colors.accent-actors-soft}`); the 20px icon (`size-5`, stroke 1.75) takes the category's solid token (e.g. `{colors.accent-actors}`). Rounded `{rounded.sm}` (8px) so it nests cleanly inside the `{component.example-card}` `{rounded.lg}` corners. **Never** scales or rotates on hover — fixed footprint avoids the visible "jiggle" the previous custom-icon implementation had.

**`category-section-header`** — Above each grid of example cards. Stack: a tiny mono-numeric "01", "02"… in `{typography.fine-print}` `{colors.ink-muted-48}` + a 6px solid dot in the category's accent color + the category short label (BASICS / EFFECTS / ACTORS / SSR) in `{typography.caption-strong}` uppercase, tracked at `0.12em`, in the category accent color. Below: large category title in `{typography.display-md}` and a one-line description in `{typography.body}` `{colors.ink-muted-80}`. Bottom: a 1px hairline (`{colors.hairline}`) divider with 20px breathing room. The right edge of the header carries the live "N примеров" count in `{typography.caption}` `{colors.ink-muted-48}`.

**`stats-inline`** — Hero metrics row. A list of `{value} LABEL` pairs separated by a 4px `{colors.ink-muted-48}` dot at 40% opacity. Value in `{typography.display-md}` weight 600 `{colors.ink}`; label in `{typography.caption}` uppercase tracked at `0.08em` `{colors.ink-muted-48}`. **No horizontal divider line** — separating glyph is the dot. This is intentional: a horizontal `border-t` would slice through `{component.hero-backdrop}`'s graph animation.

**`ping-dot`** — Animated indicator for a "thing in flight" (pending vote, sync count). Two stacked `<span>`s the same 8px size: the back layer with `animate-ping` at 70% opacity in `{colors.primary}`, the front layer solid at full opacity in `{colors.primary}`. Used inside the **active + pending** state of `{component.vote-button}` and as the leading glyph of the global "Синхронизация: N" badge above the likes grid.

**`vote-button`** — Outline button used for LIKE / DISLIKE votes inside the likes examples. Default: `{colors.canvas}` background, `{colors.hairline}` border, `{colors.ink}` text. Hover: background steps to `{colors.canvas-parchment}`, border to `{colors.ink-muted-48}` at 60% opacity. Active (selected): background `{colors.primary}` at 8% alpha, border `{colors.primary}`, text `{colors.primary}`, count number also turns primary. Active + pending: background steps to `{colors.primary}` at 14% alpha and an inline `{component.ping-dot}` appears next to the label. Active scale: `0.97` on press. The card hosting an active+pending vote-button gets a `shadow-card` and a `{colors.primary}` 40% ring so the "in-flight" state is signaled at three nested levels (badge → card → button).

**`hero-backdrop`** — The decorative composition behind the hero headline. Three layers, in z-order:
  1. Three `<div>` radial-glow orbs absolutely positioned in the right two-thirds of the hero (Action Blue, violet, amber-orange), each animated with `hero-orb-drift` (14–22 s ease-in-out, alternating direction). On `md+` they sit at 80 / 70 / 55% opacity; on mobile they drop to 50 / 45 / 35% so they don't compete with the headline.
  2. A `<canvas>` painting an FSM-graph: 7 nodes connected by 9 edges, with 7 "events" traveling along the edges (each event is a glowing point that activates its destination node on arrival, producing a ~1 s halo pulse). Animated via `requestAnimationFrame` with `prefers-reduced-motion` honored. Opacity is 90% on `md+`, 30% on mobile.
  3. An overlay gradient that masks the backdrop under the headline copy. Desktop: `linear-gradient(to right, var(--canvas) 0%, color-mix(in srgb, var(--canvas) 88%, transparent) 30%, transparent 60%)`. Mobile: vertical `bg-gradient-to-b from-canvas via-canvas/82 to-transparent`. The bottom 96px always fades into `{colors.canvas-parchment}` to seam with the next section.

**`hero-pill-link`** — Compact rounded-pill link used in the hero kicker row. Background `{colors.canvas}` at 70% alpha + backdrop-blur, 1px `{colors.hairline}` border, padding 6px × 12px, `{typography.caption}` `{colors.ink-muted-80}`. Inline icons (lucide `ArrowUpRight` at 14px) sit at the trailing edge with a 6px gap. Hover: border and text both step to `{colors.primary}`.

**`example-card-grid`** — The 1 / 2 / 3 column grid used inside each `{component.category-section-header}` block. Gap 20px, `md:grid-cols-2`, `xl:grid-cols-3`. All cards in a row stretch to the tallest card (`flex-1` inside the card body) so footers align.

### Inputs & Forms

**`search-input`** — The accessories search input. Background `{colors.canvas}`, text `{colors.ink}` in `{typography.body}` (17px), 1px solid `rgba(0, 0, 0, 0.08)` border, rounded `{rounded.pill}` (full pill — search is also pill-shaped, matching the CTA grammar), padding 12px × 20px, height 44px. Leading icon: search glyph at 14px, muted tint.

Error and validation states were not surfaced in the analyzed pages.

### Footer

**`footer`** — Background `{colors.canvas-parchment}` (#eaecf1), text `{colors.ink-muted-80}`. Vertical padding 48px. Two-column layout on `md+` (single column on mobile): left is the brand block (a `{colors.primary}` 8px solid dot + `lite-fsm` in `{typography.caption-strong}` + a `{component.tag-pill}` reading "playground" + a 2-3 sentence library blurb in `{typography.body}` `{colors.ink-muted-80}`). Right is a 3-column link cluster: **Документация** (Гайд / API / React), **Код** (GitHub / npm / Issues), **Категории** (one row per category with a leading 6px dot in the category accent color jumping to the matching section anchor). All external links carry a trailing 14px `ArrowUpRight` icon in `{colors.ink-muted-48}` that promotes to `{colors.primary}` on hover. Column headings sit in `{typography.fine-print}` uppercase tracked at `0.08em` `{colors.ink-muted-48}`.

**`tag-pill`** — Tiny rounded-pill metadata label used inside cards (category tag) and the footer brand block ("playground"). Background `{colors.canvas-parchment}`, padding 2px × 10px, `{typography.fine-print}` weight 500, text `{colors.ink-muted-48}`. Always uses `{rounded.pill}` so it composes with the larger pill grammar.

## Do's and Don'ts

### Do
- Use `{colors.primary}` (Action Blue #0061d3) for every general interactive element — links, pill CTAs, focus signals. Category accents (`{colors.accent-*}`) are reserved for category surfaces.
- Set headlines in `{typography.hero-display}` or `{typography.display-lg}` with negative letter-spacing (`-0.28 → -0.374px`).
- Run body copy at `{typography.body}` (17px / 400 / 1.47 / -0.374px) — not 16px. The extra pixel defines the brand's reading pace.
- Alternate `{component.product-tile-light}` and `{component.product-tile-dark}` for full-bleed section rhythm. The color change IS the divider.
- On the playground gallery, group `{component.example-card}` by category. Each group leads with `{component.category-section-header}` and the section gets a category-tinted accent on every card top.
- Reserve `{rounded.pill}` for the primary blue CTA, `{component.hero-pill-link}`, `{component.tag-pill}`, search input, sticky-bar CTA — anything that reads as "an action or a label."
- Apply the single product-shadow only to product imagery. On the playground, use `shadow-card` only on `{component.example-card}` hover.
- Use `transform: scale(0.95)` (or `0.97` for compact controls like `{component.vote-button}`) as the active/press state on every button.
- Keep the top-bar `{colors.surface-black}` (#0d0d10) — it's the only place near-black appears on most pages.
- Reach for **lucide-react** for every icon need. See `## Iconography`.

### Don't
- Don't introduce a second accent color for general UI; every "click me" signal is `{colors.primary}` (Action Blue). Category accents (`{colors.accent-*}`) are scoped to category surfaces only.
- Don't add shadows to cards, buttons, or text in the idle state — shadow is reserved for product imagery and the hover state of `{component.example-card}`.
- Don't use gradients as decorative backgrounds on chrome. The single exception is `{component.hero-backdrop}`, which is composited with three radial-glow orbs and a canvas — and even there a solid `var(--canvas)` overlay protects the headline copy.
- Don't set body copy at weight 500 — the ladder is 300 / 400 / 600 / 700, with 500 deliberately absent. Body is always 400; strong inline is 600; display is 600.
- Don't round full-bleed tiles — tiles are rectangular and edge-to-edge; the color change is the divider.
- Don't tighten line-height below 1.47 for body copy — the editorial leading is part of the brand.
- Don't mix radii grammars — use `{rounded.sm}` for compact utility (and `{component.category-icon-tile}`), `{rounded.lg}` for cards, `{rounded.pill}` for pills, and nothing in between.
- Don't use `{colors.primary-on-dark}` (Sky Link Blue) on light surfaces — it's the dark-surface variant (top-bar, future dark tiles).
- Don't ship a custom SVG when a lucide icon exists. See `## Iconography`.
- Don't use unicode glyphs (`↗ → ⇢ ●`) for affordances; they render at the host font's metrics and break alignment. Use lucide arrows and `{component.ping-dot}` instead.
- Don't put a horizontal `border-t` divider above `{component.stats-inline}` in the hero — it slices through `{component.hero-backdrop}`'s graph.
- Don't animate `{component.category-icon-tile}` on card hover. The card lifts; the tile stays still. Anything that scales inside a hover-translated container creates a visible "jiggle".

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small phone | ≤ 419px | Single-column tiles; sub-nav collapses to category name + primary CTA only; hero typography drops to 28px |
| Phone | 420–640px | Single-column stack; product renders scale to 80% of tile width; hero h1 drops to 34px |
| Large phone | 641–735px | Tiles transition to tighter padding (48px vertical vs 80px); fine-print wraps |
| Tablet portrait | 736–833px | Global nav collapses to hamburger; sub-nav hides category chips, keeps primary CTA |
| Tablet landscape | 834–1023px | Global nav returns fully expanded; 3-column utility grids become 2-column |
| Small desktop | 1024–1068px | Product tiles use 2/3 width with margin gutters; hero h1 stays at 40px |
| Desktop | 1069–1440px | Full layout; 4–5 column store grids; 1440px content max |
| Wide desktop | ≥ 1441px | Content locks at 1440px, margins absorb extra width |

The structural breakpoints that matter for agents: 1440px (content lock), 1068px (small-desktop), 833px (tablet landscape switch), 734px (tablet portrait), 640px (phone), 480px (small phone).

### Touch Targets
- Minimum 44 × 44px. `{component.button-primary}` lands at ~44 × 100px (with the full-pill radius making the visible hit area more generous than the label suggests).
- `{component.button-icon-circular}` is exactly 44 × 44px.
- Global nav utility links are smaller (~32 × 80px) — they deliberately sit at a tighter target because they're precision desktop actions, and the mobile hamburger replaces them at ≤ 833px.

### Collapsing Strategy
- **Global nav**: full horizontal link row on desktop → collapses to Apple logo + hamburger + bag icon at 834px and below.
- **Sub-nav**: category name + inline links + primary CTA → category name + primary CTA only at mobile; inline links move into a hamburger tray.
- **Product tiles**: stack from 2-column to 1-column at 834px; vertical padding tightens from 80px → 48px at small-phone.
- **Utility grids** (store, accessories): 5-col → 4-col (1440px) → 3-col (1068px) → 2-col (834px) → 1-col (640px).
- **Hero typography**: `{typography.hero-display}` (56px) → `{typography.display-lg}` (40px) at 1068px → 34px at 640px → 28px at 419px.

### Image Behavior
- All product imagery uses responsive `srcset` with breakpoint-matched crops.
- Hero photography may switch art direction at mobile (e.g., the environment page's vista crops to a taller aspect ratio on mobile, framing the subject differently).
- Product renders maintain their 1:1 or 4:3 aspect ratios across breakpoints; only scale changes.
- Lazy-loading is default; the above-fold hero loads eagerly.

## Iteration Guide

1. Focus on ONE component at a time. Reference its YAML key directly (`{component.product-tile-dark}`, `{component.example-card}`, `{component.search-input}`).
2. Variants of an existing component (`-active`, `-focus`, `-2`, `-3`) live as separate entries in `components:`.
3. Use `{token.refs}` everywhere — never inline hex.
4. Display headlines stay weight 600 with negative letter-spacing. Body stays 400 at 17px. The boundary is unbreakable.
5. The single drop-shadow (`rgba(0, 0, 0, 0.22) 3px 5px 30px`) is reserved for product photography only. The playground also uses the milder `shadow-card` (`0 1px 2px rgba(15, 17, 26, 0.04), 0 8px 24px -12px rgba(15, 17, 26, 0.12)`) — but only on the **hover** state of `{component.example-card}`. Idle cards are flat.
6. When in doubt about emphasis: alternate surface (light → dark tile) before adding chrome.
7. Never document hover at the spec level — except where hover *changes the affordance* (e.g. the `Открыть →` CTA in `{component.example-card}` only exists on hover). Document those explicitly.
8. Use `{colors.accent-*}` only on category surfaces. For everything else `{colors.primary}` is the only interactive color.
9. Animation: keep it under 60 fps and respect `prefers-reduced-motion`. The hero canvas, ping-dots, and orb-drift all check the media query.

## Playground Surfaces

The playground is the second design surface in this system (the first being the Apple-style product chassis above). It reuses the typography ladder, the spacing scale, the `{rounded.lg}` card grammar, and the single-blue interactive principle, but adds two things that don't exist in the Apple chassis:

- A **categorial color system** (`{colors.accent-*}`) used to mark the four conceptual buckets of FSM examples (Basics / Effects / Actors / SSR).
- A **decorative hero composition** (`{component.hero-backdrop}`) that visualizes the FSM concept itself — a graph with traveling events.

Everything else stays inside the chassis: same `{rounded.lg}` cards, same `{typography.tagline}` for headings on cards, same single Action Blue for primary affordances.

### Surface Map
- `/` (homepage) — `{component.top-bar}` + hero (canvas + `{component.hero-backdrop}` + `{component.stats-inline}`) + 4 category sections (each with `{component.category-section-header}` + `{component.example-card-grid}`) + `{component.footer}`.
- `/examples/[id]` — `{component.top-bar}` + `{component.sub-nav-frosted}` + example demo card.
- All inner demo content reuses `{component.store-utility-card}` style (white card, `{rounded.lg}`, hairline ring) for individual demo widgets.

### Branding
- The **brand mark** is `{component.brand-mark}` — a custom 16px glyph in `{colors.primary-on-dark}`, used in the top-bar. Two nodes (one filled "current state", one hollow "next state") joined by a transition link = the smallest legible FSM. It is the single deliberate non-lucide icon in the system.
- The **wordmark** is plain `lite-fsm` in `{typography.nav-link}` followed by an optional muted `· playground` qualifier (hidden below `sm`).
- No animated logo. The mark is calm; only the hero canvas and ping-dots animate.

## Known Gaps

- Form validation and error states were not surfaced on the analyzed pages; only the neutral search input is documented. The playground's `{component.vote-button}` covers a *pending* affordance but not field validation.
- The homepage's embedded video/player frame uses `{colors.surface-black}`; interior player controls are not documented (they're a platform widget, not a web-design token).
- Dark-mode counterparts for cards were not surfaced. The playground ships a single light-dominant theme; `{colors.surface-tile-*}` exist as future tokens but are not currently used in any page chrome.
- The exact backdrop-filter blur radius on `{component.sub-nav-frosted}`, `{component.floating-sticky-bar}` and `{component.hero-pill-link}` is platform-dependent; production CSS uses `saturate(180%) blur(20px)` as a typical baseline but the value isn't formalized as a token.
- Category accents are defined for the existing four FSM buckets (Basics / Effects / Actors / SSR). Adding a fifth category requires picking a hex pair (solid + soft) that holds AA contrast on `{colors.canvas}` and on `{colors.canvas-parchment}`. There is no auto-derivation rule.
- The hero canvas FSM-graph layout (`NODE_LAYOUT`, `EDGES`) is hand-tuned for a 6xl-wide hero with text living in the left half. If the hero copy moves or the container width changes substantially, the node positions need to be re-checked so they don't collide with text.
