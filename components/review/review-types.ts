/**
 * Client-side mirror of the `api.weeklyReview` contract (backend lands
 * separately). Keep in sync with `convex/weeklyReview.ts` once it merges —
 * these types only annotate `useQuery`/`useAction` results so the rest of the
 * review UI stays strictly typed before the generated API types exist.
 */

export type RecommendationKind =
  | 'deload'
  | 'swap'
  | 'volume'
  | 'rest'
  | 'keep_going';

export interface WeeklyReviewRecommendation {
  kind: RecommendationKind;
  text: string;
}

export interface WeeklyReviewStats {
  workoutCount: number;
  totalVolumeKg: number;
  totalSets: number;
  prCount: number;
  planAdherencePct?: number;
  externalWorkoutCount: number;
  avgSleepHours?: number;
  sleepNights?: number;
  avgRestingHr?: number;
}

export interface WeeklyReview {
  stats: WeeklyReviewStats;
  narrative?: string;
  recommendation?: WeeklyReviewRecommendation;
  generatedAt: number;
  llmUsed: boolean;
}
