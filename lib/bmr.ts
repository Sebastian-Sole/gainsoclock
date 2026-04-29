// Mifflin-St Jeor BMR + activity-adjusted maintenance calories. Used only by
// the aha carousel tile — activityLevel/bmr values must not leave the device
// through analytics (ForbiddenKey in `lib/analytics.ts`).

export type BiologicalSex = "male" | "female";

export type ActivityLevel = "sedentary" | "moderate" | "active";

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  moderate: 1.55,
  active: 1.725,
};

export function mifflinStJeorBmr(args: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: BiologicalSex;
}): number {
  const base = 10 * args.weightKg + 6.25 * args.heightCm - 5 * args.ageYears;
  return base + (args.sex === "male" ? 5 : -161);
}

export function approxMaintenanceCalories(
  bmr: number,
  activityLevel: ActivityLevel
): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
}
