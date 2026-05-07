# Design Spec

> **Owner:** Design agent
> **Status:** `draft` | `ready-for-dev` | `in-dev` | `shipped`
> **Epic:** <!-- EP-XX -->
> **Feature brief:** <!-- FEATURE_BRIEF_[epic-id]_[slug].md -->
> **Date:** <!-- YYYY-MM-DD -->

---

## Pre-flight checklist

> Before writing a single pixel decision, confirm:

- [ ] Read `DESIGN_SYSTEM_REFERENCE.md` — use existing tokens, components, patterns first
- [ ] Read the linked `FEATURE_BRIEF.md` — understand the problem before solving it
- [ ] List the existing components this feature can reuse (below)

**Existing components used:**
<!-- e.g. EmptyState (brand + muted variants), DataTable, SidebarLayout, etc. -->
-

**New components required:**
<!-- Only create new components if nothing in the system covers it. Name them here. -->
-

---

## 1. Feature summary (design lens)

<!-- 2–3 sentences. What are you designing, and what's the user goal?
Reframe from the brief in terms of the experience, not the ticket. -->

---

## 2. Information architecture

<!-- What new routes, pages, or panels does this feature introduce?
Use a simple tree or list — not a full sitemap. -->

```
/[route]
  └── [sub-page or panel]
  └── [modal or drawer]
```

**Entry points** (where does the user get to this feature from?):
-

**Exit points** (where does the user go after completing the flow?):
-

---

## 3. User flows

<!-- Walk through each story from FEATURE_BRIEF as a numbered flow.
Be specific about what triggers each step. -->

### Flow 1 — [Name from Story 1]

1. User is on [screen / state]
2. User [action] → [what happens]
3. [Continue until task complete or abandoned]

**Happy path ends:** [Where the user lands when successful]

**Abandonment / cancel path:** [What happens if user backs out]

---

### Flow 2 — [Name from Story 2]

1.
2.

---

## 4. Screen inventory

> Every screen this feature adds or meaningfully changes.
> Each screen MUST specify: default state · loading state · empty state · error state.

---

### Screen: [Name]

**Route / trigger:** <!-- /jobs or "clicking New Job CTA" -->

**Purpose:** <!-- One sentence -->

#### Layout

<!-- Describe the layout: header, content area, sidebar, footer.
Reference layout primitives (e.g. "standard page shell with sticky header") -->

#### States

**Default:**
<!-- What the user sees with real data. Key elements, hierarchy, interactions. -->

**Loading:**
<!-- Skeleton? Spinner? What granularity — full page or per-section? -->
<!-- Rule: use skeleton cards matching the real layout, not a spinner overlay -->

**Empty — true empty (no records exist):**
<!-- Icon + title + description + primary CTA. Use EmptyState brand variant. -->
<!-- Icon: [Lucide icon name] -->
<!-- Title: "[copy]" -->
<!-- Description: "[copy]" -->
<!-- CTA: "[label]" → [action] -->

**Empty — filtered empty (filters return nothing):**
<!-- Icon + title + contextual hint + secondary text link. Use EmptyState muted variant. -->
<!-- Title: "[copy]" -->
<!-- Hint: "[copy]" -->
<!-- Link: "[label]" → [action] -->

**Error:**
<!-- What message? Is it inline or a toast? Can the user retry? -->

#### Interaction details

<!-- Any hover, focus, drag, keyboard, or animation specifics -->
-

---

### Screen: [Name]

*(Copy block above for each additional screen)*

---

## 5. Component decisions

> For each new component, answer these questions before handing to Dev.

### Component: [Name]

**What it does:**

**Variants / states:**
<!-- List every variant. Empty, loading, error, disabled, hover, active, selected... -->

**Props surface (rough):**
```ts
interface [Name]Props {
  // required
  // optional
}
```

**Where it's used:**
-

**Does it go in `components/ui/` or a feature-specific folder?**
<!-- ui/ = truly generic; feature folder = specific to one domain -->

---

## 6. Copy decisions

<!-- Any non-obvious label, tooltip, placeholder, or error message text.
Copy that's "obvious" doesn't need to be here — only decisions that need to be locked. -->

| Element | Copy | Notes |
|---|---|---|
| [Button label / heading / placeholder] | "[text]" | [why this wording] |

---

## 7. Responsive / viewport behavior

**Breakpoints this feature needs to handle:**
- [ ] Desktop (1280px+) — primary design target
- [ ] Laptop (1024px) — must work, no horizontal scroll
- [ ] Tablet (768px) — if applicable
- [ ] Mobile — out of scope unless stated in brief

**Known layout shifts at smaller viewports:**
<!-- e.g. "Filter bar collapses to a single 'Filters' button below 1024px" -->
-

---

## 8. Accessibility notes

<!-- Any non-obvious a11y requirements. Focus traps, ARIA labels, keyboard nav. -->

- [ ] All interactive elements reachable via keyboard
- [ ] Focus trap in modals/drawers
- [ ] Meaningful aria-labels on icon-only buttons
- [ ] Color is not the only differentiator for status (pair with label or icon)

Additional notes:
-

---

## 9. Open design questions

| # | Question | Blocking? | Resolution |
|---|---|---|---|
| 1 | [Question] | YES / NO | [Answer when resolved] |

---

## 10. Dev handoff checklist

> Design fills this out before marking ready-for-dev.

- [ ] Every screen in scope has all 4 states defined (default, loading, empty, error)
- [ ] Every new component has variants and props documented
- [ ] Responsive behavior is specified
- [ ] Copy is locked for all non-obvious strings
- [ ] No new color values introduced (all tokens from `DESIGN_SYSTEM_REFERENCE.md`)
- [ ] No new icons used outside Lucide React
- [ ] Open questions resolved or explicitly deferred

**Ready for dev:** <!-- YES / NO — if NO, state what's blocking -->
