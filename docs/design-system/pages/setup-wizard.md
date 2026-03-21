# Setup Wizard — Page Design Override

> Inherits from: [MASTER.md](../MASTER.md)
> Only deviations and additions are documented here.

---

## Layout Override

- **Centered layout** with max-width 720px
- **No sidebar** — clean, focused experience
- **Minimal header** — logo + step indicator only (no navigation)
- **Large vertical padding** (64px top/bottom) for breathing room

## Step Indicator

- Horizontal progress bar with numbered circles for each phase
- Completed steps: filled `--primary`, checkmark icon inside circle
- Current step: pulsing `--primary` ring animation (subtle scale 1.0↔1.05, 2s loop)
- Future steps: `--muted` fill, number inside
- **Connecting line** between circles fills with `--primary` as steps complete (animated width, 500ms ease-out)
- Step labels below circles (visible on desktop, hidden on mobile — circles only)

## Step Transitions

| Transition | Animation |
|-----------|-----------|
| Next step | Current content slides left + fades out (250ms), new content slides in from right + fades in (300ms `bouncy` spring) |
| Previous step | Reverse direction — slide right out, slide in from left |
| Step validation error | Form shakes (3x, ±6px, 400ms), error fields get red border with spring animation |
| Step complete | Step circle fills with `--primary` + checkmark draws in (SVG path animation 400ms) |

## Form Patterns (Wizard-Specific)

### Smart Defaults
- Pre-filled values have a subtle `--secondary/10%` background to signal "AI suggested"
- Tooltip icon next to pre-filled fields explains "Based on your industry selection"
- User-modified values lose the background tint

### Productivity Rate Input
- Inline calculator UI: number input + unit selector + result preview
- Live preview: "At this rate, 1000 units = 11.1 hours of work"
- Slider alternative for common ranges with tick marks

### CSV Import Step
- Large drop zone (dashed border, `radius-xl`, 200px tall)
- Drop zone border animates from dashed to solid on drag-over
- Drop zone pulses `--primary/10%` on drag-over
- File icon bounces in after drop
- Column mapping: drag columns to target fields with spring animations
- Progress bar fills during validation (animated width + percentage counter)
- Validation results: green checkmarks stagger in for valid rows, red items expandable for errors

## Completion Celebration

When the wizard finishes:
1. Final step checkmark draws in with `wobbly` spring
2. Progress bar completes with a shimmer sweep effect
3. Confetti particles burst from center (15-20 particles, 1.5s, gravity physics)
4. "You're all set!" text scales in with `bouncy` spring
5. CTA buttons ("Go to Dashboard" / "Import Demand Data") fade in with stagger

**Reduced motion**: skip confetti, show static checkmark + success message

## Dark Mode Notes
- Wizard background stays slightly lighter than standard dark (`#141225`) for warmth
- Step indicator uses subtle glow instead of shadow for completed steps
- Drop zone uses dashed `--border` with 60% opacity
