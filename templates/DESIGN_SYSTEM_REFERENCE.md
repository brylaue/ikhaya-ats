# Design System Reference

> **Owner:** Design agent
> **Last updated:** 2026-04-21
> **Rule:** Read this before designing or building any feature. No new tokens, colors, or patterns without updating this doc first.

---

## 1. Brand color

**Electric indigo-violet — H ≈ 246°**

This is the primary brand color across all UI. It is deliberately distinct in the ATS market (Greenhouse = green, Lever = navy, Bullhorn = orange, Loxo = mid-blue).

### Scale

| Token | Hex | Usage |
|---|---|---|
| `brand-50` | `#f2f0ff` | Icon circle backgrounds (true-empty states) |
| `brand-100` | `#e5e1ff` | Hover backgrounds on subtle surfaces |
| `brand-200` | `#cec5ff` | — |
| `brand-300` | `#b09afa` | — |
| `brand-400` | `#8e73f5` | — |
| `brand-500` | `#7251fb` | Icon fills in brand empty states |
| `brand-600` | `#5e44ef` | **Primary CTA background, active nav, links** |
| `brand-700` | `#4e35cc` | Hover on brand-600 |
| `brand-800` | `#3e29a8` | — |
| `brand-900` | `#311f83` | — |
| `brand-950` | `#1d1050` | Deep dark contexts |

### CSS custom properties

```css
--primary: 246 84% 60%;           /* light mode */
--primary-foreground: 0 0% 100%;
--ring: 246 84% 60%;

/* dark mode */
--primary: 246 84% 65%;           /* slightly lighter for legibility */
```

### Rules

- **All primary CTAs** use `bg-brand-600 hover:bg-brand-700 text-white`
- **Active nav items** use `text-brand-600` with `bg-brand-50` background
- **Links** use `text-brand-600 hover:text-brand-700`
- **Red / amber / green** are reserved for status signals ONLY (error, warning, success)
- **No decorative color** — color is functional, not stylistic
- **Never hardcode hex values** — always use Tailwind brand scale tokens

---

## 2. Typography

### Scale in use

| Class | Size | Weight | Use |
|---|---|---|---|
| `text-xl font-bold` | 20px / 700 | Page headings (`<h1>`) |
| `text-base font-semibold` | 16px / 600 | Section headings |
| `text-sm font-semibold` | 14px / 600 | Card titles, table headers, labels |
| `text-sm` | 14px / 400 | Body copy, descriptions |
| `text-xs font-semibold` | 12px / 600 | Badges, secondary labels |
| `text-xs` | 12px / 400 | Secondary descriptions, meta text |

### Color pairings

| Token | Used for |
|---|---|
| `text-foreground` | Primary content |
| `text-muted-foreground` | Secondary / supporting text |
| `text-muted-foreground/50` | Placeholder, truly secondary |

---

## 3. Spacing

**Base unit: 4px (Tailwind default)**

| Pattern | Classes | Notes |
|---|---|---|
| Page padding | `p-6` | Standard page content padding |
| Card internal | `p-5` | Standard card padding |
| Section gap | `space-y-4` or `gap-4` | Between content blocks |
| Tight gap | `gap-2` or `gap-1.5` | Within a single component (icon + label) |
| Section separator | `border-b border-border pb-3 mb-4` | Inside card headers |

---

## 4. Surfaces

| Token | Usage |
|---|---|
| `bg-background` | Page background |
| `bg-card` | Card / panel surfaces |
| `bg-muted` | Subtle backgrounds (filter bars, tags, muted icon circles) |
| `bg-accent` | Hover state on secondary buttons and list items |
| `border-border` | All borders |

### Card pattern

```tsx
<div className="rounded-xl border border-border bg-card p-5">
  {/* content */}
</div>
```

---

## 5. Navigation

### Structure

```
Dashboard                     ← standalone top-level link

Talent                        ← accordion group
  Candidates
  Pipeline
  Interviews
  Placements
  Sourcing

Client                        ← accordion group
  Jobs
  Clients
  Outreach

Reporting                     ← accordion group
  Analytics
  Reports

─────────────────────────
Settings                      ← bottom section
Help
[User row]
```

### Behavior

- Groups auto-expand when the active route is inside them
- Only one group open at a time
- Active item: `bg-brand-50 text-brand-600 font-medium`
- Inactive item: `text-foreground/70 hover:bg-accent hover:text-foreground`
- Group chevron rotates `rotate-90` when open

---

## 6. Empty states

**Two variants — never mix them up.**

### Brand variant — true empty (no records exist)

Use when: the table/collection has zero rows, not because of a filter.

```tsx
<EmptyState
  variant="brand"
  icon={[LucideIcon]}
  title="[Action-oriented heading]"
  description="[One sentence explaining how to get started]"
  action={{ label: "[Primary CTA]", onClick: handler }}
/>
```

Visual: brand-50 icon circle → brand-500 icon → semibold title → xs description → brand-600 CTA button

### Muted variant — filtered empty (filters return no results)

Use when: records exist but the current filter/search returns nothing.

```tsx
<EmptyState
  variant="muted"
  icon={[LucideIcon]}
  title="No [thing] match"
  description="[Hint about what to change]"
  secondaryAction={{ label: "Clear filters", onClick: clearFilters }}
/>
```

Visual: muted icon circle → muted icon → semibold title → xs hint → text link (no button)

### Copy guidelines

- True empty heading: verb-forward ("Add your first candidate", "No jobs yet")
- Filtered empty heading: noun + "match" ("No candidates match", "No jobs match")
- Never: "No results found" with no CTA or hint — always tell the user what to do next

---

## 7. Scope toggles (Mine / All)

Used on: Jobs (Sales) page, Pipeline page

```tsx
// Pattern: segmented control, left-anchored
<div className="flex items-center rounded-lg border border-border bg-muted p-0.5 gap-0.5">
  <button
    onClick={() => setScope("mine")}
    className={cn(
      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
      scope === "mine"
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    )}
  >
    My [Things] <Badge>{mineCount}</Badge>
  </button>
  <button
    onClick={() => setScope("all")}
    className={cn(/* same */)}
  >
    [All / Full Team] <Badge>{allCount}</Badge>
  </button>
</div>
```

**Rule:** Always show count badges. Default scope = `"mine"` on both pages.

---

## 8. Loading skeletons

**Rule:** Skeletons must match the real layout — same card height, same column structure.

```tsx
// Card skeleton
<div className="animate-pulse rounded-xl border border-border bg-card p-5">
  <div className="h-4 w-32 rounded bg-muted mb-2" />
  <div className="h-3 w-48 rounded bg-muted" />
</div>

// Standard: 8 skeleton cards in a grid
Array.from({ length: 8 }).map((_, i) => (
  <SkeletonCard key={i} />
))
```

Never use a full-page spinner. Skeleton granularity = per-card or per-section.

---

## 9. Status badges

| Status | Color | Token |
|---|---|---|
| Active / Open | Green | `bg-green-50 text-green-700 border-green-200` |
| Closed / Inactive | Neutral | `bg-muted text-muted-foreground` |
| Urgent / High priority | Red | `bg-red-50 text-red-700 border-red-200` |
| In progress | Amber | `bg-amber-50 text-amber-700 border-amber-200` |
| Draft | Neutral | `bg-muted text-muted-foreground` |

**Rule:** Never use brand color for status — it's reserved for actions and navigation.

---

## 10. Page framing

### Pipeline page (Talent view)

- **Header:** "Talent Pipeline"
- **Default scope:** My Pipeline (owner = current user)
- **Group by options:** Recruiter / Client / Priority
- **Mental model:** Recruiter's working view of candidate flow across active searches

### Jobs page (Sales view)

- **Header:** "Sales"
- **Default scope:** My Jobs (owner = current user)
- **Filters:** Company dropdown (visible when >1 active client), status, priority
- **Mental model:** Business development view — fee potential, owner, pipeline value

**These two pages must never look like duplicates.** Jobs = business metrics, ownership, revenue. Pipeline = candidate flow, stages, recruiter activity.

---

## 11. Candidate profile tabs

Order and naming are fixed:

1. **Activity** — unified timeline: notes, calls, emails, meetings, stage changes
2. **Pipeline** — candidate's position across all active job searches
3. **Resume** — CV / document view
4. **Tasks** — open to-dos linked to this candidate
5. **Scorecards** — interview feedback
6. **Offers** — offer history

**Rule:** "Emails" is NOT a separate tab. Emails surface inside Activity via the `emailMessages` prop on `ActivityTimeline`.

---

## 12. Icons

**Library:** Lucide React (only)

No custom SVG icons unless Lucide has no equivalent. If adding a new icon not previously used, note it here.

| Domain | Icon | Lucide name |
|---|---|---|
| Candidates | Person / users | `Users`, `UserCircle` |
| Jobs / pipeline | Kanban board | `Kanban` |
| Pipeline (nav) | Bar chart | `BarChart2` |
| Clients | Building | `Building2` |
| Placements | Award | `Award` |
| Sourcing | Search | `Search` |
| Interviews | Calendar | `Calendar` |
| Analytics | Trending up | `TrendingUp` |
| Reports | File text | `FileText` |
| Outreach | Mail | `Mail` |

---

## 13. Adding to this reference

When a new pattern, token, or component is established:

1. Add it to the relevant section above
2. If it's a brand-new section, add it in logical order
3. Update the "Last updated" date at the top
4. Do NOT add patterns here until they're implemented and confirmed — this is a record of decisions made, not proposals
