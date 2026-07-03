"use node";

// DO NOT ADD tools: / tool_choice: — AI-Safety #5. The aha action must not
// expose tool calls. Pasting from chatActions.ts is the dominant failure mode.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
  OPENAI_AHA_MODEL,
  OPENAI_AHA_FALLBACK_MODEL,
} from "./openaiConfig";
import {
  filterAllowedByTier,
  type ExperienceTier,
} from "./exerciseLibrary";
import type { Id } from "./_generated/dataModel";

// ── System prompt (AI-Safety #2: committed verbatim) ────────────────

const SYSTEM_PROMPT = `You are Fitbull's onboarding coach. Generate ONE training session based on the user's profile.

MEDICAL BOUNDARY: You are not a doctor. Never diagnose, prescribe medical treatment, or discuss injury rehabilitation. If the profile suggests pain, injury, pregnancy, or a medical condition, output a single gentle mobility session with coachingNote recommending the user consult a qualified professional before training.

AGE & VOLUME: If ageYears < 18, reduce volume, never prescribe heavy barbell work, and recommend coaching in coachingNote. For experience === "beginner": use RPE-based intensity cues in coachingNote (e.g. "RPE 6 — last 2 reps should feel challenging but clean"); do not prescribe absolute load (kg/lb); forbid olympic lifts, plyometrics, unspotted heavy barbell.

LANGUAGE: intro is 2-3 sentences, second-person address (not possessive), recommend-register ("I'd start with", "Given your", "Since you"). Must reference at least one user input (goal, experience, or days). No possessive ownership ("your plan"), no weight-referencing, no body-shaming, no medical framing, no superlatives, no emojis.

PRIVACY: Never repeat the user's exact weight, height, or age in intro. Never reference HealthKit-derived fields beyond what is in the profile payload.

EXERCISE SELECTION: Select exercises only from the provided allowedExerciseIds list. If empty, output an error. Warmup (2-3 movements) and cooldown (2-3 movements) are required.

VOLUME CAPS: beginner: duration 15-45 min, sets*reps <= 50 per exercise; returning: 20-60 min, <= 80; experienced: 20-90 min, <= 120.`;

// ── Helpers ─────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 30_000;
const LIFETIME_CAP = 5;
const STALENESS_WINDOW_MS = 60_000;
const FLUSH_INTERVAL_MS = 250;

// Profile fields below marked optional reflect the schema after the demo-
// onboarding pivot — the V2 intake flow is dead, so a row may be inserted by
// `updateHealthStats` with only `dataSource`. Aha generation still requires
// the intake fields and short-circuits with `aha/profile_incomplete` if any
// are missing.
type Profile = {
  _id: Id<"userProfile">;
  userId: Id<"users">;
  goals?: string[];
  primaryGoal?: string;
  experience?: ExperienceTier;
  trainingDaysOfWeek?: number[];
  ageYears?: number;
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
  ahaGenerationCount?: number;
  lastAhaAt?: string;
};

type TierBounds = {
  minDuration: number;
  maxDuration: number;
  maxVolume: number;
};

const TIER_BOUNDS: Record<ExperienceTier, TierBounds> = {
  beginner: { minDuration: 15, maxDuration: 45, maxVolume: 50 },
  returning: { minDuration: 20, maxDuration: 60, maxVolume: 80 },
  experienced: { minDuration: 20, maxDuration: 90, maxVolume: 120 },
};

function assertOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key.length === 0) {
    throw new Error("aha/openai_key_missing");
  }
  return key;
}

function assertSanityBounds(profile: Profile): void {
  if (profile.weightKg !== undefined) {
    if (
      !Number.isFinite(profile.weightKg) ||
      profile.weightKg < 30 ||
      profile.weightKg > 250
    ) {
      throw new Error("aha/weight_out_of_range");
    }
  }
  if (profile.heightCm !== undefined) {
    if (
      !Number.isFinite(profile.heightCm) ||
      profile.heightCm < 120 ||
      profile.heightCm > 230
    ) {
      throw new Error("aha/height_out_of_range");
    }
  }
  if (profile.bodyFatPercent !== undefined) {
    if (
      !Number.isFinite(profile.bodyFatPercent) ||
      profile.bodyFatPercent < 3 ||
      profile.bodyFatPercent > 60
    ) {
      throw new Error("aha/bodyfat_out_of_range");
    }
  }
  if (
    profile.trainingDaysOfWeek !== undefined &&
    (profile.trainingDaysOfWeek.length < 1 ||
      profile.trainingDaysOfWeek.length > 7)
  ) {
    throw new Error("aha/training_days_out_of_range");
  }
}

function assertAgeGate(profile: Profile): void {
  if (profile.ageYears !== undefined) {
    if (!Number.isFinite(profile.ageYears) || profile.ageYears < 16) {
      throw new Error("aha/age_gate");
    }
  }
}

function tryParse(raw: string): unknown | null {
  if (!raw || raw[0] !== "{") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildSchema(allowedExerciseIds: readonly string[]) {
  const exercise = {
    type: "object",
    additionalProperties: false,
    required: ["exerciseId", "sets", "reps", "restSeconds", "coachingNote"],
    properties: {
      exerciseId: {
        type: "string",
        enum: [...allowedExerciseIds],
      },
      sets: { type: "integer", minimum: 1, maximum: 10 },
      reps: { type: "integer", minimum: 1, maximum: 30 },
      restSeconds: { type: "integer", minimum: 30, maximum: 300 },
      coachingNote: { type: "string" },
    },
  } as const;

  return {
    type: "object",
    additionalProperties: false,
    required: ["intro", "warmup", "workout", "cooldown"],
    properties: {
      intro: { type: "string" },
      warmup: {
        type: "object",
        additionalProperties: false,
        required: ["exercises"],
        properties: {
          exercises: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: exercise,
          },
        },
      },
      workout: {
        type: "object",
        additionalProperties: false,
        required: ["name", "targetMuscleGroups", "durationMinutes", "exercises"],
        properties: {
          name: { type: "string" },
          targetMuscleGroups: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 6,
          },
          durationMinutes: { type: "number" },
          exercises: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            items: exercise,
          },
        },
      },
      cooldown: {
        type: "object",
        additionalProperties: false,
        required: ["exercises"],
        properties: {
          exercises: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: exercise,
          },
        },
      },
    },
  } as const;
}

type AhaExerciseShape = {
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  coachingNote: string;
};

type AhaShape = {
  intro: string;
  warmup: { exercises: AhaExerciseShape[] };
  workout: {
    name: string;
    targetMuscleGroups: string[];
    durationMinutes: number;
    exercises: AhaExerciseShape[];
  };
  cooldown: { exercises: AhaExerciseShape[] };
};

function assertPostParseSafety(
  final: AhaShape,
  tier: ExperienceTier,
  allowed: readonly string[]
): void {
  const bounds = TIER_BOUNDS[tier];
  if (
    final.workout.durationMinutes < bounds.minDuration ||
    final.workout.durationMinutes > bounds.maxDuration
  ) {
    throw new Error("aha/post_parse/duration");
  }
  const allAll: AhaExerciseShape[] = [
    ...final.warmup.exercises,
    ...final.workout.exercises,
    ...final.cooldown.exercises,
  ];
  for (const ex of allAll) {
    if (!allowed.includes(ex.exerciseId)) {
      throw new Error("aha/post_parse/exercise_id");
    }
  }
  for (const ex of final.workout.exercises) {
    if (ex.sets * ex.reps > bounds.maxVolume) {
      throw new Error("aha/post_parse/volume_cap");
    }
  }
}

class RefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusalError";
  }
}

// ── Public action (called from client) ──────────────────────────────

export const generateAhaWorkout = action({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.runAction(internal.onboardingActions.runAhaGeneration, {
      userId,
      generationId,
    });
  },
});

// ── Internal action (run by scheduler + public wrapper) ─────────────

export const runAhaGeneration = internalAction({
  args: {
    userId: v.id("users"),
    generationId: v.string(),
  },
  handler: async (ctx, { userId, generationId }) => {
    assertOpenAiKey();

    // Consent gate (AI-Safety #12)
    const consent = await ctx.runQuery(
      internal.onboardingInternal.getAiConsentForUser,
      { userId }
    );
    if (!consent.granted) {
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "ai_coach_inference_consent_missing",
      });
      throw new Error("aha/consent_missing");
    }

    const rawProfile = await ctx.runQuery(
      internal.onboardingInternal.getProfileForUser,
      { userId }
    );
    if (!rawProfile) {
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "profile_missing",
      });
      throw new Error("aha/profile_missing");
    }
    const profile = rawProfile as unknown as Profile;

    assertSanityBounds(profile);
    assertAgeGate(profile);

    // Demo-onboarding pivot: profile rows can now exist without the legacy
    // intake fields (created by `updateHealthStats` from the HealthKit prompt
    // when no V2 intake ran). Aha generation still needs all four to build
    // the OpenAI prompt; bail with a clear reason rather than crashing on
    // `.length` / undefined `experience`.
    if (
      profile.goals === undefined ||
      profile.primaryGoal === undefined ||
      profile.experience === undefined ||
      profile.trainingDaysOfWeek === undefined
    ) {
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "profile_incomplete",
      });
      throw new Error("aha/profile_incomplete");
    }

    // Rate limit (AI-Safety #8)
    if ((profile.ahaGenerationCount ?? 0) >= LIFETIME_CAP) {
      const last = await ctx.runQuery(
        internal.onboardingInternal.findLastCompletedAha,
        { userId }
      );
      if (last) {
        await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
          userId,
          generationId,
          status: "complete",
          workout: last.workout,
          intro: last.intro,
          completedAt: last.completedAt ?? new Date().toISOString(),
          profileSnapshot: last.profileSnapshot,
          startedAt: last.startedAt,
        });
        return;
      }
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "rate_limit_lifetime",
      });
      throw new Error("aha/rate_limit_lifetime");
    }
    if (profile.lastAhaAt) {
      const last = Date.parse(profile.lastAhaAt);
      if (
        Number.isFinite(last) &&
        Date.now() - last < RATE_LIMIT_WINDOW_MS
      ) {
        const row = await ctx.runQuery(
          internal.onboardingInternal.findLastCompletedAha,
          { userId }
        );
        if (row) {
          await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
            userId,
            generationId,
            status: "complete",
            workout: row.workout,
            intro: row.intro,
            completedAt: row.completedAt ?? new Date().toISOString(),
            profileSnapshot: row.profileSnapshot,
            startedAt: row.startedAt,
          });
          return;
        }
      }
    }

    // Idempotency (Convex-Realtime C4)
    const existing = await ctx.runQuery(
      internal.onboardingInternal.findAhaByGenerationId,
      { userId, generationId }
    );
    if (existing) {
      if (existing.status === "complete") return;
      if (
        existing.status === "streaming" &&
        Date.now() - Date.parse(existing.updatedAt) < STALENESS_WINDOW_MS
      ) {
        return;
      }
      await ctx.runMutation(internal.onboardingInternal.markAhaStaleById, {
        ahaId: existing._id,
        reason: "stale_streaming",
      });
    }

    const tier = profile.experience;
    const allowedExerciseIds = filterAllowedByTier(tier);
    if (allowedExerciseIds.length === 0) {
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "allowed_exercises_empty",
      });
      throw new Error("aha/allowed_exercises_empty");
    }

    const profilePayload = {
      goals: profile.goals,
      primaryGoal: profile.primaryGoal,
      experience: profile.experience,
      trainingDaysOfWeek: profile.trainingDaysOfWeek,
      ageYears: profile.ageYears,
      allowedExerciseIds,
    };

    const profileSnapshot = JSON.stringify(profilePayload);
    const startedAt = new Date().toISOString();

    await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
      userId,
      generationId,
      status: "streaming",
      startedAt,
      profileSnapshot,
    });
    await ctx.runMutation(internal.onboardingInternal.incrementAhaCount, {
      userId,
    });

    const schema = buildSchema(allowedExerciseIds);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const kickoffMs = Date.now();
    let firstByteReported = false;

    const runWithModel = async (model: string): Promise<AhaShape> => {
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(profilePayload) },
      ];
      const stream = await openai.chat.completions.create({
        model,
        stream: true,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "AhaSession",
            schema,
            strict: true,
          },
        },
      });

      let full = "";
      let lastFlush = 0;
      let lastValid: AhaShape | null = null;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta as
          | { content?: string; refusal?: string }
          | undefined;
        if (delta?.refusal) {
          throw new RefusalError(delta.refusal);
        }
        const text = delta?.content ?? "";
        if (!text) continue;
        full += text;

        if (!firstByteReported) {
          firstByteReported = true;
          await ctx.runAction(internal.analytics.captureServer, {
            distinctId: userId,
            eventName: "plan_first_byte",
            properties: { latencyMs: Date.now() - kickoffMs },
          });
        }

        const now = Date.now();
        if (now - lastFlush < FLUSH_INTERVAL_MS) continue;
        const parsed = tryParse(full);
        if (parsed && typeof parsed === "object") {
          lastValid = parsed as AhaShape;
          await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
            userId,
            generationId,
            status: "streaming",
            workout: lastValid,
            intro: typeof lastValid.intro === "string"
              ? lastValid.intro
              : undefined,
          });
          lastFlush = now;
        }
      }

      const final = JSON.parse(full) as AhaShape;
      assertPostParseSafety(final, tier, allowedExerciseIds);

      const mod = await openai.moderations.create({ input: final.intro });
      const flagged = mod.results?.[0]?.flagged === true;
      if (flagged) {
        await ctx.runMutation(
          internal.onboardingInternal.logAiSafetyIncident,
          {
            userId,
            kind: "moderation_flag",
            detail: JSON.stringify(mod.results[0]),
          }
        );
        final.intro = "Here's your first session — let's start.";
      }
      return final;
    };

    let final: AhaShape | null = null;
    let modelUsed = OPENAI_AHA_MODEL;
    try {
      final = await runWithModel(OPENAI_AHA_MODEL);
    } catch (err) {
      await ctx.runMutation(
        internal.onboardingInternal.logAiSafetyIncident,
        {
          userId,
          kind: err instanceof RefusalError ? "refusal" : "primary_model_error",
          detail: String(err).slice(0, 2000),
        }
      );
      // Report genuine primary-model failures as a degradation warning: the
      // user still gets a plan via the fallback below, so the native (uncaught)
      // Sentry integration never sees this. Refusals are expected safety
      // behaviour, not faults, so they're excluded.
      if (!(err instanceof RefusalError)) {
        await ctx.scheduler.runAfter(
          0,
          internal.errorReporting.reportHandledError,
          {
            where: "onboarding.ahaMoment.primaryModel",
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            level: "warning",
            userId,
            extra: { model: OPENAI_AHA_MODEL },
          },
        );
      }
      try {
        modelUsed = OPENAI_AHA_FALLBACK_MODEL;
        final = await runWithModel(OPENAI_AHA_FALLBACK_MODEL);
      } catch (err2) {
        await ctx.runMutation(
          internal.onboardingInternal.logAiSafetyIncident,
          {
            userId,
            kind: "fallback_model_error",
            detail: String(err2).slice(0, 2000),
          }
        );
        await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
          userId,
          generationId,
          reason: String(err2).slice(0, 500),
        });
        await ctx.runAction(internal.analytics.captureServer, {
          distinctId: userId,
          eventName: "plan_generation_failed",
          properties: { reason: String(err2).slice(0, 200) },
        });
        throw err2;
      }
    }

    if (!final) {
      await ctx.runMutation(internal.onboardingInternal.markAhaFailed, {
        userId,
        generationId,
        reason: "final_null",
      });
      throw new Error("aha/final_null");
    }

    const completedAt = new Date().toISOString();
    await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
      userId,
      generationId,
      status: "complete",
      workout: final,
      intro: final.intro,
      completedAt,
    });

    await ctx.runAction(internal.analytics.captureServer, {
      distinctId: userId,
      eventName: "plan_visible",
      properties: {
        latencyMs: Date.now() - kickoffMs,
        model: modelUsed,
      },
    });
  },
});
