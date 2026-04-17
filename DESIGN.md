# Design System Documentation: Luminous Precision

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Luminous Architect."** This aesthetic moves away from the rigid, boxed-in layouts of traditional fintech and toward an expansive, editorial experience that feels curated and weightless.

By leveraging intentional asymmetry, generous white space, and high-contrast typography, we create an environment of "Atmospheric Authority." We break the "template" look by treating the screen as a physical space filled with light and layered frosted glass, rather than a flat digital canvas. Every element must feel like it was placed with surgical precision, emphasizing clarity and wealth through "breathing room."

---

## 2. Colors & Surface Philosophy

The palette is rooted in a high-clarity neutral base with a singular, high-energy pulse of blue.

### The "No-Line" Rule

To maintain a premium, high-end feel, **1px solid borders for sectioning are strictly prohibited.** Boundaries must be defined solely through background color shifts. For example, a content area using `surface-container-low` (#F2F4F6) should sit directly against the `surface` (#F7F9FB) background. This creates a soft, sophisticated transition that feels natural rather than clinical.

### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers—like stacked sheets of fine paper or frosted glass.

- **Base Layer:** `surface` (#F7F9FB)
- **Secondary Content:** `surface-container-low` (#F2F4F6)
- **Interactive/Elevated Elements:** `surface-container-lowest` (#FFFFFF)

### The Glass & Gradient Rule

For floating navigation, modals, or high-level overlays, use the **Frosted Glass** effect:

- **Fill:** `surface-container-lowest` at 60%–80% opacity.
- **Effect:** Backdrop-blur (minimum 20px to 40px).
- **Signature Texture:** Main CTAs should utilize a subtle linear gradient transitioning from `primary` (#0049DB) to `primary-container` (#2962FF) at a 135-degree angle. This provides a "glow" that flat colors cannot replicate.

---

## 3. Typography

The typography system uses **Manrope** to convey a sense of bold, geometric precision. It is the backbone of the "Editorial" feel.

- **Display Scales (`display-lg` to `display-sm`):** Use these for high-impact data or welcome states. They should feel massive yet light.
- **Headline & Title Scales:** These carry the "authoritative" weight. Use `on_surface` (#191C1E) with a font-weight of 700 or 800.
- **Body & Labels:** Use `on_surface_variant` (#434656) for secondary information to ensure the hierarchy is immediately obvious through tonal contrast, not just size.

The contrast between the oversized, bold headers and the tight, precise labels creates a "Signature Scale" that feels custom-designed for high-net-worth interactions.

---

## 4. Elevation & Depth

Depth is achieved through **Tonal Layering** and ambient light physics rather than traditional shadows.

### The Layering Principle

Stack your surface tiers to create "soft lift." A `surface-container-lowest` card placed on a `surface-container-low` background creates a natural separation that feels integrated into the architecture of the page.

### Ambient Shadows

When an element must float (e.g., a primary modal):

- **Shadow Color:** Use a tinted version of `on_surface` (#191C1E).
- **Settings:** 0px offset-y, 40px blur, 4%–8% opacity.
- **Goal:** The shadow should look like a soft atmospheric occlusion, not a "drop shadow."

### The "Ghost Border" Fallback

If accessibility requirements demand a border, use a **Ghost Border**:

- **Token:** `outline-variant` (#C3C5D8).
- **Opacity:** 15% maximum.
- **Weight:** 1px.

---

## 5. Components

### Buttons

- **Primary:** Full roundness (`9999px`), `primary` to `primary-container` gradient. Text: `on_primary` (White, Bold).
- **Secondary:** Full roundness. Background: `surface-container-highest` (#E0E3E5). Text: `on_surface`.
- **Tertiary:** No background. Text: `primary`. High-contrast bold Manrope.

### Input Fields

- **Style:** Subtle `surface-container-low` background with a `full` (9999px) or `xl` (3rem) corner radius.
- **State:** On focus, transition the background to `surface-container-lowest` and apply a 1px "Ghost Border" at 20% opacity.

### Cards & Lists

- **Rule:** **Forbid the use of divider lines.**
- **Implementation:** Separate list items using the Spacing Scale (minimum 16px vertical gap) or alternating subtle background shifts between `surface` and `surface-container-low`.
- **Rounding:** Always use the `full` or `xl` scale for card containers to maintain the "Luminous Precision" aesthetic.

### Chips

- **Action Chips:** High-contrast `on_surface` text on a `surface-container-high` background. Full roundness.

---

## 6. Do’s and Don’ts

### Do:

- **Do** embrace asymmetry in hero sections to create an editorial, premium feel.
- **Do** use extreme white space to separate unrelated content groups.
- **Do** use the "Frosted Glass" effect for elements that move or scroll over other content.
- **Do** ensure all interactive elements use the `full` (9999px) roundness token.

### Don't:

- **Don't** use pure black (#000000) for text; always use the dark slate `on_surface` token for a more sophisticated contrast.
- **Don't** use 1px solid dividers or high-contrast borders.
- **Don't** use standard "drop shadows" with high opacity or dark colors.
- **Don't** crowd the interface. If it feels "full," remove an element or increase the container size.
