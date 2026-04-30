// Tier-filtered allow-list of exercise IDs the aha action is allowed to prescribe.
// Used by `convex/onboardingActions.ts` to bound the Structured Outputs
// `exerciseId` enum (AI-Safety #1). Keep entries as kebab-case strings.
//
// Beginner: no olympic lifts, no unspotted heavy barbell, no plyos.
// Returning: dumbbell/barbell moderate movements, basic plyos, kettlebell.
// Experienced: full catalogue including olympic derivatives.

export type ExperienceTier = "beginner" | "returning" | "experienced";

const BODYWEIGHT_BASICS = [
  "bodyweight-squat",
  "push-up",
  "inverted-row",
  "glute-bridge",
  "hip-hinge-pattern",
  "plank-front",
  "plank-side",
  "dead-bug",
  "bird-dog",
  "wall-sit",
  "lunge-reverse-bodyweight",
  "step-up-bodyweight",
  "march-in-place",
  "leg-raise-lying",
  "calf-raise-bodyweight",
  "shoulder-tap",
  "mountain-climber-slow",
] as const;

const MOBILITY_WARMUP = [
  "cat-cow",
  "world-greatest-stretch",
  "hip-flexor-stretch",
  "thoracic-rotation",
  "shoulder-dislocate-band",
  "ankle-rocker",
  "arm-circle",
  "jumping-jack-low-impact",
  "leg-swing",
  "hip-circle",
] as const;

const COOLDOWN_STATIC = [
  "childs-pose",
  "pigeon-stretch",
  "hamstring-stretch-supine",
  "quad-stretch-standing",
  "chest-doorway-stretch",
  "cross-body-shoulder-stretch",
  "box-breathing",
  "seated-forward-fold",
] as const;

const RETURNING_EXTRAS = [
  "goblet-squat",
  "dumbbell-bench-press",
  "dumbbell-row-single-arm",
  "dumbbell-romanian-deadlift",
  "dumbbell-shoulder-press",
  "dumbbell-lateral-raise",
  "kettlebell-swing-russian",
  "kettlebell-goblet-hold",
  "barbell-back-squat-moderate",
  "barbell-bench-press-moderate",
  "barbell-deadlift-moderate",
  "barbell-overhead-press-moderate",
  "pull-up-assisted",
  "chin-up-assisted",
  "lat-pulldown",
  "seated-row-cable",
  "leg-press",
  "leg-curl-machine",
  "leg-extension-machine",
  "step-up-loaded",
  "split-squat-bulgarian",
  "romanian-deadlift-dumbbell",
  "face-pull-band",
  "hanging-knee-raise",
] as const;

const EXPERIENCED_EXTRAS = [
  "barbell-back-squat-heavy",
  "barbell-front-squat",
  "barbell-deadlift-heavy",
  "barbell-bench-press-heavy",
  "barbell-overhead-press-heavy",
  "barbell-row-bent-over",
  "barbell-hip-thrust",
  "snatch-power",
  "clean-power",
  "clean-and-jerk",
  "push-press",
  "push-jerk",
  "box-jump",
  "broad-jump",
  "depth-jump",
  "weighted-pull-up",
  "weighted-dip",
  "pistol-squat",
  "nordic-curl",
  "sled-push",
  "sled-pull",
  "farmer-carry",
  "turkish-get-up",
] as const;

const BEGINNER_IDS = [
  ...MOBILITY_WARMUP,
  ...BODYWEIGHT_BASICS,
  ...COOLDOWN_STATIC,
] as const;

const RETURNING_IDS = [
  ...MOBILITY_WARMUP,
  ...BODYWEIGHT_BASICS,
  ...RETURNING_EXTRAS,
  ...COOLDOWN_STATIC,
] as const;

const EXPERIENCED_IDS = [
  ...MOBILITY_WARMUP,
  ...BODYWEIGHT_BASICS,
  ...RETURNING_EXTRAS,
  ...EXPERIENCED_EXTRAS,
  ...COOLDOWN_STATIC,
] as const;

export const ALLOWED_EXERCISES: Record<ExperienceTier, readonly string[]> = {
  beginner: BEGINNER_IDS,
  returning: RETURNING_IDS,
  experienced: EXPERIENCED_IDS,
};

export function filterAllowedByTier(tier: ExperienceTier): readonly string[] {
  return ALLOWED_EXERCISES[tier];
}

export function isAllowedExerciseId(tier: ExperienceTier, id: string): boolean {
  return ALLOWED_EXERCISES[tier].includes(id);
}
