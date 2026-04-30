# Selectors

Picking the right way to match an element. Stability, in order:

## `id:` — testID (most stable)

Matches React Native's `testID` prop, which iOS exposes as `accessibilityIdentifier`.

```yaml
- tapOn:
    id: "workout-start-button"

- inputText: "50"
  into:
    id: "set-0-weight"
```

Rules of thumb:
- One testID per meaningful interaction point.
- Naming: `<screen>-<role>` or `<feature>-<item>-<role>`.
- Indexed elements use integer suffix: `"set-0-weight"`, `"set-1-weight"`.
- Keep stable across re-designs. Tie to function, not visuals.

## `text:` — visible text

```yaml
- tapOn:
    text: "Start workout"

- assertVisible:
    text: "(?i)workout saved"   # case-insensitive via regex
```

Fragile:
- Breaks on copy edits.
- Breaks on locale/translation (comma-decimal localisation work, future l10n).
- Matches the *first* visible instance — ambiguous in long lists.

Use when: quick smoke test, or when a screen has a unique labelled header you don't expect to change (e.g. `"Sign in"`).

## `label:` — accessibilityLabel

```yaml
- tapOn:
    label: "Start workout"
```

Less fragile than `text` (labels often outlive copy changes) but still language-sensitive. Best fallback when adding a `testID` isn't practical.

## `point:` — coordinates

```yaml
- tapOn:
    point: "50%,80%"
```

Avoid. Breaks on:
- Different device sizes (iPhone SE vs iPhone 16 Pro Max)
- Dynamic Type (rows move)
- Safe-area changes (Dynamic Island on newer devices)

Only acceptable for: tap-through-onboarding-screens where elements aren't stable enough yet and the test is temporary.

## Compound matchers

Combine selectors to disambiguate:

```yaml
- tapOn:
    text: "Delete"
    index: 1                       # 2nd "Delete" in view

- tapOn:
    id: "set-row"
    index: 0                       # first set row
    childOf:
      id: "exercise-0"             # inside the first exercise block
```

## Waits and retries

Selectors have an implicit wait. Tune when needed:

```yaml
- assertVisible:
    id: "paywall-screen"
    timeout: 10000                 # ms

- tapOn:
    id: "optional-cta"
    optional: true                 # don't fail if missing

- tapOn:
    id: "flaky-button"
    retryTapIfNoChange: true       # retry if the screen didn't change
```

## Regex

```yaml
- assertVisible:
    text: "Workout (complete|saved)"

- assertVisible:
    text: "\\d+ kg"
```

Escape regex metacharacters when you want literal matches (`.`, `?`, `(`, etc.).
