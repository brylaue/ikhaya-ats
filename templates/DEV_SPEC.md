# Dev Spec

> **Owner:** Dev agent
> **Status:** `draft` | `ready` | `in-progress` | `blocked` | `done`
> **Epic:** <!-- EP-XX -->
> **Story ID(s):** <!-- US-XXX, US-XXX -->
> **Design spec:** <!-- DESIGN_SPEC_[epic-id]_[slug].md -->
> **Feature brief:** <!-- FEATURE_BRIEF_[epic-id]_[slug].md -->
> **Date:** <!-- YYYY-MM-DD -->

---

## Pre-flight checklist

> Read these before writing any code.

- [ ] Read linked `DESIGN_SPEC.md` fully — understand all states before implementing any
- [ ] Read linked `FEATURE_BRIEF.md` — know the acceptance criteria you're implementing against
- [ ] Check `DESIGN_SYSTEM_REFERENCE.md` — use existing tokens, no new color values
- [ ] Grep for existing hooks/utils before writing new ones

**Ambiguities raised before implementation:**
<!-- Anything unclear from brief or design that needed resolution. Log it here. -->
-

---

## 1. Implementation summary

<!-- 2–3 sentences. What are you building? What's the core technical challenge? -->

---

## 2. File map

> All files that will be created or meaningfully changed.

### New files

| File | Purpose |
|---|---|
| `app/(dashboard)/[route]/page.tsx` | [purpose] |
| `components/[domain]/[name].tsx` | [purpose] |
| `hooks/use-[name].ts` | [purpose] |

### Modified files

| File | Change summary |
|---|---|
| `components/layout/sidebar.tsx` | [what changes] |
| `app/globals.css` | [what changes] |

### Migration / schema changes

| File | Change summary |
|---|---|
| `supabase/migrations/[timestamp]_[name].sql` | [what it adds/changes] |

---

## 3. Data layer

### Supabase tables affected

| Table | Operation | Notes |
|---|---|---|
| `[table_name]` | SELECT / INSERT / UPDATE / DELETE | [join conditions, filters, RLS notes] |

### New tables or columns

```sql
-- [table_name]
ALTER TABLE [table] ADD COLUMN [col] [type] [constraints];

-- or new table
CREATE TABLE [table_name] (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- columns
);
```

### RLS policies needed

```sql
-- [policy name]
CREATE POLICY "[name]" ON [table]
  FOR [SELECT|INSERT|UPDATE|DELETE]
  USING ([expression]);
```

### New hooks

```ts
// hooks/use-[name].ts
// Returns: { data: [Type][], loading: boolean, error: string | null }
// Fetches: [what query]
// Real-time: YES / NO
```

---

## 4. API layer

### New server actions or API routes

| Method | Path / Action name | Auth required | Description |
|---|---|---|---|
| POST | `app/(dashboard)/[route]/actions.ts → [actionName]` | YES | [what it does] |

### Action / route spec

```ts
// [actionName]
// Input: [describe params]
// Output: { data: [Type] | null; error: string | null }
// Side effects: [DB writes, emails, etc.]
```

### External API calls

| Service | Endpoint | When called | Error handling |
|---|---|---|---|
| [e.g. Gmail API] | [endpoint] | [trigger] | [retry? fallback?] |

---

## 5. Component implementation plan

> Implement in this order — dependencies first.

### 1. [FoundationComponent]

**File:** `components/[path]/[name].tsx`

**Props:**
```ts
interface [Name]Props {
  // document all props
}
```

**States to implement:**
- [ ] Default / data populated
- [ ] Loading (skeleton)
- [ ] Empty — true empty (brand variant)
- [ ] Empty — filtered (muted variant)
- [ ] Error inline

**Key implementation notes:**
<!-- Any tricky logic, performance concern, or pattern to follow -->
-

---

### 2. [NextComponent]

*(Copy block above for each component)*

---

## 6. Page implementation plan

### Page: `app/(dashboard)/[route]/page.tsx`

**Data fetched:**
```ts
// hooks used
const { data: [name], loading: [name]Loading } = use[Hook]();
```

**Derived state:**
```ts
// computed values, useMemo dependencies
```

**Filter / scope logic:**
```ts
// describe filtering strategy — server-side vs client-side, memoization
```

**Render structure:**
```
<PageShell>
  <Header />        ← title, scope toggle, actions
  <FilterBar />     ← search, dropdowns
  <ContentArea>
    loading  → <SkeletonGrid />
    empty    → <EmptyState />
    data     → <[MainComponent] />
  </ContentArea>
</PageShell>
```

---

## 7. Edge cases and error handling

| Scenario | Expected behavior | Implementation note |
|---|---|---|
| Network error on data fetch | Show inline error with retry | Use error boundary or inline error state |
| Empty dataset (no records) | EmptyState brand variant with CTA | |
| Filters return 0 results | EmptyState muted variant with hint | |
| User lacks permission | [redirect / show message] | Check RLS + handle 403 |
| Concurrent edits | [last-write-wins / optimistic UI note] | |
| [Feature-specific edge case] | [behavior] | |

---

## 8. Performance considerations

<!-- Only fill in sections that are relevant to this feature -->

**Data volume risk:**
<!-- Could this table grow to 10k+ rows? If yes, describe pagination or limit strategy. -->

**Re-render risk:**
<!-- Any large lists or heavy computations? useMemo / useCallback strategy. -->

**Real-time subscriptions:**
<!-- If using Supabase real-time, what's the channel and filter condition? -->

---

## 9. Testing plan

### Unit tests

| Test | File | What it verifies |
|---|---|---|
| [test name] | `[path]/__tests__/[name].test.ts` | [assertion] |

### Integration / e2e notes

<!-- Any flows that need manual QA before marking done -->
-

### Acceptance criteria coverage

> Map each AC from FEATURE_BRIEF back to how it's tested.

| Story | AC | Test / verification method |
|---|---|---|
| Story 1 | Given X, when Y, then Z | [unit test / manual step] |

---

## 10. Rollout notes

**Feature flag needed:** YES / NO
<!-- If YES: flag name, default state, who can enable -->

**Migration risk:** LOW / MEDIUM / HIGH
<!-- If MEDIUM+: describe the risk and mitigation -->

**Can be reverted without data loss:** YES / NO

---

## 11. Done definition

- [ ] All acceptance criteria from FEATURE_BRIEF pass
- [ ] All 4 states implemented per screen (default, loading, empty, error)
- [ ] No TypeScript errors (`tsc --noEmit` clean)
- [ ] No console errors or warnings in dev
- [ ] No new Tailwind color values outside the brand scale
- [ ] RLS policies tested with non-owner user
- [ ] Edge cases from section 7 handled
- [ ] Design handoff checklist items verified in browser
