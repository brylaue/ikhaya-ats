# Animation QA Checklist (US-447)

Purpose: every animation or transition shipped in the ATS web app must clear
this checklist before it merges. The goal isn't "no motion" — it's motion that
(a) honors user accessibility preferences, (b) doesn't hurt perceived
performance, (c) serves the user's comprehension rather than decorates.

## 1. Duration & timing

- [ ] Non-essential transitions ≤ 200ms. Decorative flourishes ≤ 500ms.
- [ ] Nothing auto-plays longer than 5s without a pause/stop affordance.
- [ ] Easing uses the site tokens (`cubic-bezier(0.2, 0.8, 0.2, 1)` for ease-out,
      `cubic-bezier(0.4, 0, 0.2, 1)` for in-out). No raw `linear` for UI motion
      unless you explicitly want indifference (progress bars, loaders).

## 2. Accessibility

- [ ] Respects `prefers-reduced-motion: reduce`. Test in macOS System Settings →
      Accessibility → Display → Reduce Motion, and Windows Settings →
      Accessibility → Visual Effects → Animation Effects.
- [ ] No rapid flashing or strobing (> 3 Hz). WCAG 2.3.1.
- [ ] No parallax or large-movement-on-scroll unless gated behind the
      reduced-motion media query.
- [ ] Focus outlines are not animated out of existence during transitions.

## 3. Performance

- [ ] Animations use `transform` and `opacity` only — never `width`, `height`,
      `top`, `left`, or anything that triggers layout.
- [ ] If you use `will-change`, it's removed after the animation ends.
- [ ] No animation runs in background tabs (use IntersectionObserver / visibility).
- [ ] Verified at 60fps on the reference laptop (MBP 14" M1) in Chrome DevTools
      Performance panel. No red "long frame" blocks.

## 4. State & meaning

- [ ] The animation corresponds to a real change in state or hierarchy — not
      pure decoration. "What is the user learning from this motion?"
- [ ] Enter and exit animations are symmetric (don't enter slow, exit instant).
- [ ] Interrupting an animation (clicking again mid-flight) doesn't break layout
      or leave the element in a half-state.

## 5. Pipeline-specific

- [ ] Drag-and-drop card reorders animate positions; dropping doesn't cause a
      visible flash or re-layout.
- [ ] Stage transitions (kanban column moves) use the shared motion token so
      multi-card bulk actions feel coherent, not random.
- [ ] Skeleton loaders fade out (don't pop) when the real content paints.

## 6. Reduced-motion implementation

The global reduced-motion handler lives in `styles/globals.css` and follows
the pattern: reduce duration to 0.01ms and disable `animation-iteration-count`
loops. Components should **not** hand-roll their own reduced-motion guards —
rely on the global rule and ensure your keyframes are opt-in via CSS classes
that inherit the global override.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Reviewer sign-off

Before approving a PR with animation changes, the reviewer confirms:

1. Tested with reduced-motion on.
2. Checked the Performance panel once on a list of ≥ 100 items if it's a list animation.
3. Verified the animation doesn't cause layout shift (no CLS).
