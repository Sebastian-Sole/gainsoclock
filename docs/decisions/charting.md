# Decision: Charting stack for progression charts — hand-rolled on react-native-svg

**Status**: Accepted
**Date**: 2026-07-12
**Issue**: #104 (stats: metric-driven progression charts and estimated 1RM over time)

## Context

Issue #104 adds progression line charts to the stats screen (per-metric series
and estimated 1RM over time). The app has no charting code today; every stats
view is text and rows. `react-native-svg` (^15) is already a dependency, used
by `components/shared/progress-ring.tsx`, `components/shared/screen-glow.tsx`,
and `components/workout/rest-timer.tsx`.

The constraint set is unusual: New Architecture + React Compiler are ON,
`pnpm.overrides` pins `react-native-nitro-modules@0.32.2` for the RevenueCat
workaround, and CLAUDE.md treats new dependencies as stack decisions. Several
popular charting libraries have had rough edges under exactly this
configuration.

What we actually need is small: a single-series line chart with a date x-axis,
theme-aware colors, and an accessible (non-visual) representation of the data.
No pan/zoom, no tooltips, no stacked/multi-series, no animation requirement.

## Options considered

1. **Hand-roll on `react-native-svg` (chosen).** ~100 lines of pure layout
   math (scale points into a `Path`, two gridlines, dots) inside one generic
   component. Zero new dependencies, zero native code, works identically on
   iOS/Android/web, and the accessibility fallback (trend summary label + a
   data table) is ours to build either way — no library provides it.
2. **`victory-native` (XL).** Full-featured, but current versions are built on
   `@shopify/react-native-skia` + `react-native-reanimated` — two heavy native
   dependencies we don't otherwise carry, each with its own New-Architecture
   compatibility surface, for a feature that needs one polyline. Rejected on
   dependency weight and native-build risk (see the nitro-modules pin).
3. **`react-native-gifted-charts` / `react-native-chart-kit`.** Lighter, but
   both have a history of lagging RN releases and neither is designed around
   the React Compiler; chart-kit is effectively unmaintained. They also render
   via `react-native-svg` anyway — we'd be adding a dependency to generate the
   same SVG primitives we can generate directly.
4. **WebView-based charts (ECharts et al).** Rejected outright: a WebView per
   chart in a scrolling list is a memory/perf hazard and breaks the
   offline-first, native-feel bar.

## Decision

Hand-roll a generic line chart, `components/stats/progression-chart.tsx`, on
the existing `react-native-svg`:

- **Pure SVG for marks only** (path, dots, gridlines). All text (title, axis
  extremes, dates) is React Native `<Text>` outside the SVG so Dynamic Type
  and theme tokens apply — SVG `<Text>` respects neither.
- **Colors resolved per theme in JS** (same convention as
  `progress-ring.tsx`'s `useRingColors`), since SVG props can't take Tailwind
  classes.
- **Accessibility is part of the component contract**: every chart carries an
  `accessibilityLabel` built by `trendAccessibilitySummary()` (lib/stats.ts)
  and a "Show data" toggle revealing the underlying date/value rows, so the
  numbers are reachable by screen reader. A visual-only chart fails review.
- Data shaping stays in `lib/` (`computeExerciseSeries`,
  `computeOneRmSeries`) where it is unit-tested; the component only scales
  points into pixels.

## Consequences

- No new dependency; native builds and the nitro-modules pin are untouched.
- We own the chart code: adding tooltips/multi-series later is our work, not a
  library flag. If requirements grow past "line chart of a series", adding
  `victory-native` becomes a NEW stack decision that supersedes this memo —
  don't grow the hand-rolled chart into a charting framework.
- The component is deliberately generic (points + formatter in, SVG out), so
  new metrics or new surfaces (e.g. body-weight trend) can reuse it without
  touching the drawing code.
