# Concorde: design system

Source of truth for `index.html`, `css/site.css` and `js/site.js`.
Generated with the ui-ux-pro-max skill (`--design-system`, variance 4, motion 9, density 2), then
overridden with the project's own fonts and accent. Reference for structure and motion: jeskojets.com.

## Direction

- **Style:** Dark Mode (OLED) base with glass surfaces. Cinematic, quiet, one idea per screen.
- **Dials:** variance 4 (balanced), motion 9 (pinned, scroll-scrubbed scenes), density 2 (spacious).
- **Rule of one:** one typeface family for display and text, one mono for data, one accent colour.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0a0908` | Night cabin, stratosphere, page background |
| `--umber` | `#2b2321` | Warm top of dark gradients |
| `--stone` | `#7d746e` | Top of light gradients, muted text on light |
| `--bone` | `#fbf6ec` | Light backgrounds, the boarding pass |
| `--paper` | `#f6f1e7` | Text on dark |
| `--flame` | `#ff5a1f` | The only accent: reheat, the Concorde arc, live values, focus ring |

- Text on dark is `--paper`; muted text is `--paper` at 62%.
- Text on light is `--ink`; muted text is `--stone`.
- `--flame` on a light background is below 4.5:1, so there it marks a dot or a line, never small text.
- Fixed chrome (nav, HUD) switches between `--paper` and `--ink` with the scene underneath. Over the window scene, where the backdrop is mixed, it uses `mix-blend-mode: difference` instead.

## Typography

- **Display and text:** Archivo (variable, `wdth` 62 to 125, `wght` 200 to 800).
- **Data and labels:** IBM Plex Mono 400/500.

| Role | Size | Settings |
|---|---|---|
| Display XL (`.d1`) | `clamp(52px, 9.4vw, 152px)` | wdth 125, wght 300, tracking -0.055em, leading 0.86 |
| Display L (`.d2`) | `clamp(44px, 6.6vw, 108px)` | wdth 125, wght 300, tracking -0.055em, leading 0.9 |
| Lead (`.lead`) | `clamp(26px, 4.3vw, 70px)` | wdth 112, wght 400, tracking -0.045em, leading 1.02 |
| Subtitle (`.sub`) | `clamp(20px, 1.7vw, 26px)` | wdth 112, wght 500, tracking -0.045em, leading 1 |
| Body (`.copy`) | `clamp(14px, 1.02vw, 15.5px)` | wght 400, leading 1.45, max 36ch |
| Label (`.label`) | `11px` | IBM Plex Mono 500, uppercase, tracking 0.09em |

Headlines are huge and thin, and are split left/right around the visual in the middle of the stage.
Numbers that change use `font-variant-numeric: tabular-nums`.

## Layout

- Gutter: `clamp(20px, 6.67vw, 96px)`.
- Every scene is a tall track with a sticky full-viewport stage. Scroll position scrubs all motion.
- Recurring block: subtitle, 24px hairline, short paragraph. Spec lists: grey label over value, hairline above.
- Breakpoints checked: 375, 768, 1024, 1440.

## Components

- **Top nav:** links left, wordmark centre, route right. No background. Hover rolls the label and fades in a pill.
- **Pill button:** fixed bottom centre. A translucent capsule holding a white pill and a round icon button, both 44px high. Rim highlights adapted from 21st.dev "Sheen Pill Button".
- **Glass card (`.glass`):** 11px backdrop blur, 10% white tint, 26px radius, inner ring, layered drop shadow, pointer-tracked specular highlight. Adapted from 21st.dev "Glass Card". `.glass.on-light` for light scenes.
- **HUD and stage bar:** one mono line each, bottom left and bottom right.
- **Boarding pass:** flat `--bone` card with a barcode, 4px radius.

## Motion

- Smooth inertia scrolling with Lenis (`lerp 0.085`).
- Scrubbed motion has no easing of its own beyond the scene curve; it follows the scroll.
- Entrances: characters rise out of a clipped line, 900ms, `cubic-bezier(.165,.84,.44,1)`, 18ms stagger.
- Hover and state changes: 250 to 400ms. Only `transform` and `opacity` animate.
- `prefers-reduced-motion`: no inertia, no zoom, no parallax, no preloader; every element shows its final readable state.

## Checklist before shipping

- [ ] No emoji as icons, SVG only
- [ ] Visible focus ring (`--flame`, 2px, 3px offset)
- [ ] Buttons and links at least 44px high where they are tap targets
- [ ] Body text contrast at least 4.5:1 on its background, including on glass
- [ ] No horizontal scroll at 375px
- [ ] Reduced motion respected
