# Component Spec

> **Owner:** Design + Dev (joint)
> **Status:** `draft` | `design-complete` | `in-dev` | `done`
> **Component name:** <!-- e.g. CandidateCard, StageDropdown, OwnerScopeToggle -->
> **Epic:** <!-- EP-XX — or "design system" if standalone -->
> **Date:** <!-- YYYY-MM-DD -->

---

## 1. Purpose

<!-- One sentence: what does this component do and why does it exist?
If you can't write this in one sentence, the component is probably too broad. -->

**Lives in:** `components/ui/` | `components/[domain]/`
<!-- ui/ = truly reusable across domains; domain folder = owned by one feature area -->

---

## 2. Variants

> Every visual or behavioral variant must be named and described.
> No "misc" or "other" variants — if it looks different, name it.

| Variant | When used | Key visual difference |
|---|---|---|
| `default` | [context] | [description] |
| `[name]` | [context] | [description] |

---

## 3. States

> Every component must handle every applicable state.
> Check all that apply and describe the visual for each.

- [ ] **Default** — real data, no interaction
  - [description]

- [ ] **Loading / skeleton**
  - [description — match real layout with animate-pulse shapes]

- [ ] **Empty** (if component contains a list or data set)
  - True empty: [description — EmptyState brand variant]
  - Filtered empty: [description — EmptyState muted variant]

- [ ] **Hover**
  - [description]

- [ ] **Focus** (keyboard)
  - [description — ring style, outline]

- [ ] **Active / selected**
  - [description]

- [ ] **Disabled**
  - [description — opacity-50, cursor-not-allowed, no pointer events]

- [ ] **Error**
  - [description — inline message, red border, or toast?]

- [ ] **Read-only** (if applicable)
  - [description]

---

## 4. Props interface

```ts
interface [ComponentName]Props {
  // ─── Required ────────────────────────────────────
  [propName]: [type];           // [what it does]

  // ─── Optional ────────────────────────────────────
  [propName]?: [type];          // [what it does, default: X]
  
  // ─── Event handlers ──────────────────────────────
  on[Action]?: ([param]: [type]) => void;

  // ─── Composition ─────────────────────────────────
  className?: string;
  children?: React.ReactNode;   // only if composable
}
```

---

## 5. Design tokens used

> List every token this component uses. No hardcoded hex or raw Tailwind colors.

| Token | Usage |
|---|---|
| `brand-600` | Primary action background |
| `brand-700` | Primary action hover |
| `muted` / `muted-foreground` | [usage] |
| `foreground` | [usage] |
| `border` | [usage] |
| `card` / `card-foreground` | [usage] |

**No hardcoded values. If a color isn't in this table, it shouldn't be in the component.**

---

## 6. Typography

| Element | Class | Notes |
|---|---|---|
| [heading / label / body] | `text-sm font-semibold` | |
| [secondary text] | `text-xs text-muted-foreground` | |

---

## 7. Spacing and layout

<!-- Key spacing rules for this component.
Only document non-obvious decisions — don't list every padding class. -->

- Container: [width constraint, padding, overflow]
- Internal spacing: [gap between key elements]
- Responsive adjustments: [any breakpoint-specific layout changes]

---

## 8. Interaction spec

> What happens when the user interacts with this component?

| Interaction | Trigger | Result |
|---|---|---|
| [click / hover / keyboard] | [element] | [what changes] |

**Animation:**
<!-- Duration, easing, property animated. Only document non-default transitions. -->
- [property]: [duration] [easing] — e.g. `background-color: 150ms ease`

---

## 9. Accessibility

- **Role:** `[button | listitem | dialog | etc.]` or semantic HTML element
- **aria-label:** [when and what value — especially for icon-only buttons]
- **Keyboard nav:** [Tab order, Enter/Space triggers, Escape closes, arrow keys]
- **Screen reader:** [What does a screen reader announce on interaction?]

---

## 10. Usage examples

```tsx
// Minimal usage
<[ComponentName]
  [requiredProp]={value}
/>

// Full usage
<[ComponentName]
  [requiredProp]={value}
  [optionalProp]={value}
  on[Action]={() => handleAction()}
  className="[overrides if needed]"
/>

// Variant example
<[ComponentName]
  variant="[name]"
  [requiredProp]={value}
/>
```

---

## 11. What this component does NOT do

<!-- Explicit exclusions prevent scope creep and clarify boundaries.
At least 2–3 items. -->

- Does not [responsibility that belongs to parent / different component]
- Does not handle [data fetching / auth / routing] — that's the page's job
- Does not [other boundary]

---

## 12. Related components

| Component | Relationship |
|---|---|
| `EmptyState` | Used when this component's list is empty |
| `[name]` | [how they relate] |
