// Meal-photo macro estimation (frictionless nutrition, Phase 3).
//
// NOTE: like weeklyReview.ts this file intentionally runs in the Convex
// default runtime (no "use node"). The `openai` v6 SDK is fetch-based and
// works in the default runtime, so the upload-url mutation, the vision
// action, and the photo-cleanup mutations can live together.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation } from "./_generated/server";
import { OPENAI_VISION_MODEL } from "./openaiConfig";

// ── Types ──────────────────────────────────────────────────────

type Confidence = "low" | "medium" | "high";

type MealEstimate = {
  title: string;
  portionDescription: string;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  confidence: Confidence;
  assumptions: string[];
};

type AnalyzeResult =
  | { status: "ok"; estimate: MealEstimate }
  | { status: "error"; code: "pro_required" | "not_food" | "failed" };

// ── Bounds & parsing helpers ───────────────────────────────────

const MAX_CALORIES = 5000;
const MAX_MACRO_GRAMS = 1000;
const MAX_ASSUMPTIONS = 6;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(Math.round(value), 0), max);
}

function parseMacroNumber(x: unknown, max: number): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return clamp(x, max);
}

function isConfidence(x: unknown): x is Confidence {
  return x === "low" || x === "medium" || x === "high";
}

/**
 * Parse + validate the model's JSON. Returns null when the shape is
 * unusable (→ "failed"), or the literal string "not_food" when the model
 * flagged a non-food image.
 */
function parseEstimateJson(raw: string): MealEstimate | "not_food" | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  if (data.notFood === true) return "not_food";

  const title = data.title;
  if (typeof title !== "string" || title.trim().length === 0) return null;

  if (!isRecord(data.macros)) return null;
  const calories = parseMacroNumber(data.macros.calories, MAX_CALORIES);
  const protein = parseMacroNumber(data.macros.protein, MAX_MACRO_GRAMS);
  const carbs = parseMacroNumber(data.macros.carbs, MAX_MACRO_GRAMS);
  const fat = parseMacroNumber(data.macros.fat, MAX_MACRO_GRAMS);
  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }

  const portionDescription =
    typeof data.portionDescription === "string"
      ? data.portionDescription.trim()
      : "";

  const assumptions = Array.isArray(data.assumptions)
    ? data.assumptions
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .map((a) => a.trim())
        .slice(0, MAX_ASSUMPTIONS)
    : [];

  return {
    title: title.trim(),
    portionDescription,
    macros: { calories, protein, carbs, fat },
    confidence: isConfidence(data.confidence) ? data.confidence : "low",
    assumptions,
  };
}

// ── Vision prompt ──────────────────────────────────────────────

const VISION_SYSTEM_PROMPT = `You are a nutrition assistant analyzing a photo of food the user is about to log.

Respond with JSON only, exactly one of these shapes:

If the image clearly is NOT food (people, screenshots, objects, scenery):
{"notFood": true}

Otherwise:
{
  "title": "short meal name, e.g. 'Chicken teriyaki with rice'",
  "portionDescription": "the visible portion, e.g. 'one plate, ~300g rice + ~150g chicken'",
  "macros": {"calories": number, "protein": number, "carbs": number, "fat": number},
  "confidence": "low" | "medium" | "high",
  "assumptions": ["key assumption 1", "key assumption 2"]
}

Rules:
- Identify the meal and estimate TOTAL macros for the visible portion only (calories in kcal, protein/carbs/fat in grams).
- Estimate conservatively from typical portion sizes; do not inflate.
- List the key assumptions behind the numbers (e.g. "assumed 300g cooked rice", "assumed pan-fried in ~1 tbsp oil").
- Set confidence by visual ambiguity: "high" when ingredients and portion are clearly visible, "medium" when some components are hidden or mixed, "low" when sauces, oils, or hidden ingredients make the estimate rough.`;

// ── Public mutations ───────────────────────────────────────────

/** Step 1 of photo logging: the client uploads the photo to this URL. */
export const generateMealPhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 3 of photo logging: the client calls this after logging the meal
 * (or canceling) so meal photos never accumulate in storage. Privacy:
 * photos are transient inputs, not persisted user content.
 */
export const discardMealPhoto = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.storage.delete(args.storageId);
  },
});

// ── Internal mutations ─────────────────────────────────────────

/** Internal cleanup hook (server-side callers, e.g. future crons). */
export const deleteMealPhoto = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

// ── Action: analyze a meal photo ───────────────────────────────

/**
 * Step 2 of photo logging: estimate the meal + macros from the uploaded
 * photo. Does NOT delete the photo — the client may re-analyze and calls
 * `discardMealPhoto` when done.
 */
export const analyzeMealPhoto = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<AnalyzeResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Photo macro estimation is a Pro feature.
    const isPro: boolean = await ctx.runQuery(
      internal.subscriptions.checkSubscription,
      { userId }
    );
    if (!isPro) {
      return { status: "error", code: "pro_required" };
    }

    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) {
      return { status: "error", code: "failed" };
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: OPENAI_VISION_MODEL,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this meal photo and estimate its macros.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 600,
      });

      const raw = response.choices[0]?.message?.content;
      const parsed = raw ? parseEstimateJson(raw) : null;

      if (parsed === null) return { status: "error", code: "failed" };
      if (parsed === "not_food") return { status: "error", code: "not_food" };

      return { status: "ok", estimate: parsed };
    } catch {
      return { status: "error", code: "failed" };
    }
  },
});
