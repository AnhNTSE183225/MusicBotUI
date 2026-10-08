# MusicBotUI Design System & Guidelines (`DESIGN.md`)

This document defines the core visual, architectural, and typographic design rules for `MusicBotUI`. All future UI modifications and additions **must** adhere strictly to these guidelines to ensure visual consistency, accessibility, and optimal viewport utilization.

---

## 1. Golden Principle: The "No-Scroll" Desktop Viewport

> [!IMPORTANT]
> The primary desktop experience (`>= 1024px`) must fit **entirely within the visible viewport (`100vh`) without page-level scrolling**. Users should never have to scroll the entire window down to access player controls, adjust volume, or see the bottom voice session bar.

### Layout Geometry Rules:
1. **Compact Navigation Header (`.app-header`):**
   - Height is strictly **56px** (never 80px+).
   - Contains: Brand mark, Server dropdown, Channel status, User profile avatar.
2. **Page Intro (`.page-intro`):**
   - Top container padding is **16px – 20px** (never 40px+).
   - Heading `h1` is **24px – 26px**, eyebrow label is **11px** with `letter-spacing: 0.05em`.
   - Bottom margin before media panels is **14px – 16px** (never 30px+).
3. **Card Panels (`.player-panel` and `.queue-panel`):**
   - Internal padding is **18px – 22px** (never 30px+).
   - Album artwork max width is **270px – 280px** on standard desktop (preserves visual prominence while preventing vertical blowout).
4. **Queue Container Internal Scrolling:**
   - The queue list (`.queue-list`) must be constrained with `max-height: ~360px` and `overflow-y: auto`.
   - Adding tracks scrolls **inside** the queue card; it must **never** push down or stretch the outer page layout.
5. **Bottom Voice Session Band (`.session-band`):**
   - Compact height with `padding: 10px 16px; margin-top: 12px – 14px;`.
   - Houses Discord connection status, summon/disconnect button, and vote-stop trigger.
6. **Footer (`.app-footer`):**
   - Compact utility row with `margin: 10px 0 12px; font-size: 11px;`.

---

## 2. Typography Hierarchy (Normalized 4-Tier Scale)

> [!CAUTION]
> **Strict Prohibition on Microtext:** Never use font sizes below **11px** anywhere in the application. Microscopic text (7px, 8px, 9px) violates WCAG accessibility guidelines, causes severe eye strain, and renders illegibly on high-DPI displays.

| Tier | Font Size | Weight | Line Height | Usage Examples |
|---|---|---|---|---|
| **Tier 1: Micro / Meta** | `11px` | `500` / `600` | `1.3` | Timestamps (`2:32`), badges (`HIGH QUALITY`), tags (`Stream`), "Added by", duration labels, track numbers (`01`), volume % |
| **Tier 2: Secondary Body** | `12px – 13px` | `400` / `500` | `1.4` | Artist names, descriptions, input placeholders, channel status, session details |
| **Tier 3: Primary Body / Titles** | `14px – 15px` | `500` / `600` | `1.3` | Track titles in queue rows, server selector, primary button labels |
| **Tier 4: Display / Headings** | `20px – 26px` | `600` | `1.2` | "Your listening room" (`26px`), "Nothing playing" (`22px`), "Up next" (`20px`), Brand logo (`20px`) |

---

## 3. Queue Item Anatomy & Alignment

Each row in `.queue-list` must maintain tight vertical density and strict single-line horizontal alignment:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [01]  [Art]   Track Title (13px, weight 500)                 2:32  [X] │
│               Artist (11px, muted)                                     │
│               Added by [14px Avatar] Username (11px)                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Specific Queue Rules:
1. **Row Height:** `min-height: 60px – 64px` (never 80px+).
2. **Requester Line (`.queue-requester`):**
   - Must use `display: flex; align-items: center; gap: 5px;`.
   - "Added by" label, circular avatar (`14px x 14px`), and username **must remain on a single row**.
   - Avatar image must have `display: inline-block; object-fit: cover; border-radius: 50%;`.
3. **Track Art:** `42px x 42px` with `4px` border radius.

---

## 4. Glassmorphism & Color Ambience

1. **Ambient Lighting:**
   - Lighting is derived dynamically from currently displayed album artwork via `.ambient-art` with high blur (`filter: blur(115px)`).
   - Visual ambience follows the music; avoid static bright or disconnected background decorations.
2. **Glass Surfaces (`.glass-surface`):**
   - Subtly translucent with `backdrop-filter: blur(30px)`.
   - Thin `1px solid var(--border)` outline with soft elevation shadows.
3. **Contrast:**
   - Primary foreground text uses `var(--foreground)` for strong readability against dark glass backgrounds.
   - Secondary metadata uses `var(--muted-foreground)` with minimum `0.75` opacity.

---

## 5. Mobile Responsiveness (`< 768px`)

When screen width is below desktop breakpoint:
1. Media layout switches from side-by-side grid (`minmax(0, 0.94fr) minmax(0, 1.06fr)`) to a single column stack.
2. Normal page scrolling is enabled naturally on mobile screens.
3. Player panel appears first, followed by the queue panel and bottom voice controls.

---

## 6. Scrollbar Styling & Aesthetics

> [!IMPORTANT]
> Never let default OS / browser native scrollbars (such as Windows' opaque 16px grey/white scrollbars with arrow buttons) render over dark glass panels.

1. **Global & Queue Customization:**
   - Width: strictly **5px – 6px** slim rounded capsule (`border-radius: 9999px`).
   - Track: fully **transparent** (`background: transparent`).
   - Thumb: subtle dark glass tint (`color-mix(in oklch, var(--foreground) 16%, transparent)`), brightening to `30%` on hover.
   - Stepper Buttons: arrows are disabled and hidden (`::-webkit-scrollbar-button { display: none }`).
2. **Standard CSS Compliant:**
   - Supports both WebKit pseudo-elements and standard W3C `scrollbar-width: thin` + `scrollbar-color`.
3. **Optional Total Concealment:**
   - Elements with `.no-scrollbar` completely hide the scrollbar thumb while preserving mouse wheel, trackpad, and touch scrolling.

