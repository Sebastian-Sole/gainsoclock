import { describe, it, expect } from "vitest";
import {
  mifflinStJeorBmr,
  approxMaintenanceCalories,
} from "@/lib/bmr";

// Characterization tests: pin CURRENT behavior of the Mifflin-St Jeor BMR and
// activity-adjusted maintenance-calorie math. Expected values are computed by
// hand in the comments so a future edit that changes the formula is caught.

describe("mifflinStJeorBmr", () => {
  it("male: 10*kg + 6.25*cm - 5*age + 5", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(
      mifflinStJeorBmr({ weightKg: 80, heightCm: 180, ageYears: 30, sex: "male" })
    ).toBe(1780);
  });

  it("female: 10*kg + 6.25*cm - 5*age - 161", () => {
    // 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
    expect(
      mifflinStJeorBmr({ weightKg: 65, heightCm: 165, ageYears: 28, sex: "female" })
    ).toBe(1380.25);
  });

  it("sex offset is exactly 166 (male +5 vs female -161) for identical inputs", () => {
    const male = mifflinStJeorBmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: "male" });
    const female = mifflinStJeorBmr({ weightKg: 70, heightCm: 175, ageYears: 25, sex: "female" });
    expect(male - female).toBe(166);
  });
});

describe("approxMaintenanceCalories", () => {
  it("sedentary multiplier 1.2, rounded", () => {
    // round(1780 * 1.2) = round(2136) = 2136
    expect(approxMaintenanceCalories(1780, "sedentary")).toBe(2136);
  });

  it("moderate multiplier 1.55, rounded", () => {
    // round(1380.25 * 1.55) = round(2139.3875) = 2139
    expect(approxMaintenanceCalories(1380.25, "moderate")).toBe(2139);
  });

  it("active multiplier 1.725, rounded (.5 rounds up)", () => {
    // round(1780 * 1.725) = round(3070.5) = 3071 (Math.round rounds half up)
    expect(approxMaintenanceCalories(1780, "active")).toBe(3071);
  });
});
