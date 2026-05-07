# Agent Template Library

Templates for PM, Design, and Dev agents working on the Ikhaya ATS platform.

---

## How templates chain together

```
PM agent writes           Designer fills in        Dev agent implements
FEATURE_BRIEF.md   →→→   DESIGN_SPEC.md    →→→   DEV_SPEC.md
                                  ↓
                        COMPONENT_SPEC.md
                       (per component built)
```

Each template links forward to the next. A feature is not ready to design until the brief is complete. A feature is not ready to build until the design spec is complete.

---

## Template index

| File | Owner | Purpose |
|---|---|---|
| `FEATURE_BRIEF.md` | PM agent | Define the problem, scope, user stories, and success criteria |
| `DESIGN_SPEC.md` | Design agent | Document visual + interaction decisions before implementation |
| `DEV_SPEC.md` | Dev agent | Technical implementation plan, components, API, edge cases |
| `COMPONENT_SPEC.md` | Design + Dev | Fine-grained spec for individual UI components |
| `DESIGN_SYSTEM_REFERENCE.md` | Design agent | Living reference for tokens, patterns, and component conventions |

---

## Naming convention for filled templates

When working on a real feature, copy the template and name it:

```
FEATURE_BRIEF_[epic-id]_[feature-slug].md
DESIGN_SPEC_[epic-id]_[feature-slug].md
DEV_SPEC_[epic-id]_[feature-slug].md
```

Example:
```
FEATURE_BRIEF_EP07_candidate-merge.md
DESIGN_SPEC_EP07_candidate-merge.md
DEV_SPEC_EP07_candidate-merge.md
```

---

## Agent rules

**PM agent:**
- Fill `FEATURE_BRIEF.md` completely before handing to Design
- Do not skip the ICP fit check — if you can't name one recruiter workflow this unblocks, reconsider scope
- Acceptance criteria must be testable, not aspirational

**Design agent:**
- Read `DESIGN_SYSTEM_REFERENCE.md` before every feature
- Reference existing components before creating new ones
- Every screen needs: loading state, empty state, error state
- Do not hand off to Dev until all states are specified

**Dev agent:**
- Read `DESIGN_SPEC.md` and `DEV_SPEC.md` before writing any code
- Raise scope ambiguities before implementing, not after
- New UI tokens go through Design before being added to `globals.css`
- Do not invent new color values — use the established brand scale
