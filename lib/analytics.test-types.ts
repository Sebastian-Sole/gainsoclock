/**
 * Compile-time negative test for `lib/analytics.ts`'s HealthKit firewall.
 *
 * This file is imported nowhere; `tsc` still type-checks it because it lives
 * under the project `tsconfig.json`'s `include` glob. Each `@ts-expect-error`
 * comment is the active assertion: removing it must surface a ts(2322) at
 * the next call below — that proves the firewall would refuse the forbidden
 * key. If an assertion ever stops firing (a refactor accidentally weakens
 * the conditional), `tsc` reports "Unused '@ts-expect-error' directive" and
 * CI fails.
 *
 * Phase-3 acceptance: temporarily delete one `@ts-expect-error`, run
 * `npx tsc --noEmit`, confirm the error appears, then restore it.
 *
 * NOT a runtime test. There is no test runner in this project; do not migrate
 * this file to one without a stack-level discussion.
 */

// eslint-disable-next-line prettier/prettier
import { capture } from "./analytics";

// Allowed: clean event reference. Compiles.
capture({ name: "consent_granted", props: { versionHash: "v1", purposes: ["analytics"] } });

// Forbidden: `weightKg` is a HealthKit field. The firewall must collapse the
// props type to `never`, which makes the entire `props` value structurally
// invalid — surfacing as ts(2322).
// @ts-expect-error firewall must reject `weightKg` in event props
capture({ name: "consent_granted", props: { versionHash: "v1", purposes: ["analytics"], weightKg: 82 } });

// Forbidden: derived metric. Same expectation.
// @ts-expect-error firewall must reject derived metric `tdee` in event props
capture({ name: "consent_granted", props: { versionHash: "v1", purposes: ["analytics"], tdee: 2400 } });

// Forbidden via union props (`activation_gate_*` accepts only an empty
// object — adding any forbidden key must still be rejected).
// @ts-expect-error firewall must reject `bmi` even on empty-prop events
capture({ name: "activation_gate_first_workout", props: { bmi: 22 } });
