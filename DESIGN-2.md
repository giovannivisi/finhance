# Design System Specification: The Luminous Vault

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"Luminous Precision."**

In the world of high-end personal finance, trust is built through clarity, and luxury is felt through space. This system rejects the cluttered, utility-first approach of legacy banking. Instead, it adopts an editorial philosophy: treating financial data as a curated exhibition. We break the "template" look by utilizing intentional asymmetry, where large-scale typography creates a focal anchor, allowing secondary data to float in a breathable, layered environment. The interface should feel like a physical object—a slab of polished obsidian or a sheet of frosted glass—rather than a flat digital screen.

---

### 2. Colors & Surface Philosophy

The palette is rooted in a deep, nocturnal foundation, punctuated by "biological" accents that represent financial health.

#### The "No-Line" Rule

**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections. Boundaries must be established through tonal shifts. For example, a dashboard widget (`surface_container`) should sit on the background (`surface`) without a stroke. The change in hex value is the boundary.

#### Surface Hierarchy & Nesting

We utilize a "Stacking Principle" to create depth. By nesting containers, we guide the user’s eye from the broad context to specific actions:

- **Base Layer:** `surface` (#11131c) – The canvas.
- **Sectional Layer:** `surface_container_low` (#191b24) – Defines large functional areas.
- **Interactive Layer:** `surface_container` (#1d1f29) – The standard card or module.
- **Elevated Layer:** `surface_container_high` (#282933) – For modals or active states.

#### The "Glass & Gradient" Rule

To achieve the signature fintech aesthetic, use Glassmorphism for floating elements (e.g., navigation bars, pop-overs).

- **Recipe:** Apply `surface_variant` at 40% opacity with a `20px` to `40px` backdrop-blur.
- **Signature Texture:** Use a subtle linear gradient for primary CTAs, transitioning from `primary` (#b0c6ff) to `primary_container` (#0069ef). This adds a "soul" to the UI that flat colors lack.

---

### 3. Typography

Our typography is the voice of the system: authoritative, modern, and spacious.

- **Display & Headlines (Manrope):** These are our "Editorial Anchors." Use `display-lg` (3.5rem) for total balances and `headline-md` (1.75rem) for section titles. Apply a slightly tighter tracking (-2%) to headlines to give them a "custom-fitted" look.
- **Body & Labels (Inter):** For transactional data and descriptions. Inter provides the technical precision required for numbers.
- **The Hierarchy Rule:** Never use more than three type sizes on a single screen. Leverage the contrast between a `display-sm` balance and a `label-md` timestamp to create a clear "Order of Operations" for the user’s eyes.

---

### 4. Elevation & Depth

In this system, elevation is a property of light, not lines.

- **The Layering Principle:** Rather than shadows, use "Tonal Lift." A `surface_container_lowest` card placed on a `surface_container_low` background creates a natural recession that feels premium and integrated.
- **Ambient Shadows:** When an element must float (e.g., a credit card component), use an "Atmospheric Shadow."
  - **Color:** A tinted version of `on_surface` at 6% opacity.
  - **Blur:** Minimum `40px` to `60px`.
  - **Spread:** `-10px` to keep the shadow tucked under the element, mimicking a soft overhead studio light.
- **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

### 5. Components

#### Buttons

- **Primary:** Background `primary_container`. No border. Roundedness `full`. Include a subtle outer glow using the `primary` color at 10% opacity for a "charged" feel.
- **Secondary:** Background `surface_container_highest`. Roundedness `full`.
- **Tertiary:** Transparent background, `primary` text, `title-sm` weight.

#### Cards & Lists

- **Rule:** Absolute prohibition of divider lines.
- **Separation:** Use `md` (1.5rem) or `lg` (2rem) vertical spacing from the Spacing Scale. If items need grouping, use a `surface_container_low` wrap.
- **Interaction:** On hover/tap, a card should transition from `surface_container` to `surface_container_high` with a 200ms ease-out curve.

#### Data Visualizations

- **Glow Lines:** Line charts should use the `secondary` (#7dffa2) token for growth. Apply a Gaussian blur duplicate of the line behind it to create a "neon filament" effect.
- **Doughnut Charts:** Use `xl` (3rem) corner radius for segment ends. The center of the doughnut should contain a `title-lg` summary of the primary data point.

#### Input Fields

- **State:** Use `surface_container_lowest` for the field background.
- **Focus:** When active, the "Ghost Border" increases to 40% opacity using the `primary` token. No heavy focus rings.

---

### 6. Do’s and Don’ts

#### Do

- **Do** use generous tracking (0.02em to 0.05em) for all labels to enhance the high-end feel.
- **Do** use the `xl` (3rem) roundedness for large containers to soften the technological feel.
- **Do** treat "Growth" (`secondary`) and "Expenses" (`tertiary`) as functional colors only—never use them for decorative elements.

#### Don’t

- **Don't** use 100% black (#000000). Use `background` (#11131c) to maintain depth and color vibration.
- **Don't** use standard "Drop Shadows." They look dated. Always use Ambient Shadows or Tonal Layering.
- **Don't** cram information. If a mobile screen feels tight, move secondary data to a "Details" view or use a horizontal scroll chip-set (`surface_container_high`).

---

### 7. Portability & Responsiveness

This design system is "Fluid-First."

- **Mobile:** Components like cards and inputs must span the full width minus a `1.5rem` margin. Use `sm` (0.5rem) roundedness for small elements (chips) and `lg` (2rem) for containers.
- **Desktop:** The layout should never feel "stretched." Use a maximum content width of `1200px` and let the `background` bleed to the edges. Use the extra horizontal space for "Asymmetric Accents"—placing a large `display-lg` headline on the left and data visualizations on the right.
