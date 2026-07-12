// Recipe scanning: photos / PDF → structured recipe (issue #109).
//
// Sibling to nutritionVision.ts and, like it, intentionally runs in the
// Convex default runtime (no "use node") — the `openai` v6 SDK is fetch-based.
//
// Upload flow reuses the meal-photo infrastructure in nutritionVision.ts:
// the client uploads via `generateMealPhotoUploadUrl`, registers ownership
// via `registerMealPhoto`, and discards via `discardMealPhoto` when done.
// This action only reads those uploads (ownership-checked) and never
// persists anything — the parsed recipe goes back to the client for a
// mandatory review-before-save step.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { OPENAI_VISION_MODEL } from "./openaiConfig";

// ── Types ──────────────────────────────────────────────────────

type ScannedIngredient = {
  name: string;
  quantity: string;
  unit: string | null;
};

type ScannedMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type ScannedRecipe = {
  title: string;
  servings: number | null;
  ingredients: ScannedIngredient[];
  steps: string[];
  /** Only present when nutrition facts are printed in the source. */
  macros: ScannedMacros | null;
};

type ScanErrorCode = "pro_required" | "not_recipe" | "too_large" | "failed";

type ScanRecipeResult =
  | { status: "ok"; recipe: ScannedRecipe }
  | { status: "error"; code: ScanErrorCode };

// ── Bounds ─────────────────────────────────────────────────────

const MAX_FILES = 4;
const MAX_PDF_BYTES = 15 * 1024 * 1024; // stays under OpenAI's request cap after base64
const MAX_INGREDIENTS = 60;
const MAX_STEPS = 50;
const MAX_TITLE_CHARS = 200;
const MAX_NAME_CHARS = 120;
const MAX_QUANTITY_CHARS = 40;
const MAX_UNIT_CHARS = 30;
const MAX_STEP_CHARS = 1000;
const MAX_SERVINGS = 100;
// Whole-recipe totals, so higher ceilings than a single meal.
const MAX_CALORIES = 20000;
const MAX_MACRO_GRAMS = 2500;

// ── Parsing helpers ────────────────────────────────────────────

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(Math.round(value), 0), max);
}

function parseBoundedNumber(x: unknown, max: number): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return clamp(x, max);
}

function parseBoundedString(x: unknown, maxChars: number): string | null {
  if (typeof x !== "string") return null;
  const trimmed = x.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxChars);
}

function parseIngredient(x: unknown): ScannedIngredient | null {
  if (!isRecord(x)) return null;
  const name = parseBoundedString(x.name, MAX_NAME_CHARS);
  if (name === null) return null;
  const quantity = parseBoundedString(x.quantity, MAX_QUANTITY_CHARS) ?? "";
  const unit = parseBoundedString(x.unit, MAX_UNIT_CHARS);
  return { name, quantity, unit };
}

function parseMacros(x: unknown): ScannedMacros | null {
  if (!isRecord(x)) return null;
  const calories = parseBoundedNumber(x.calories, MAX_CALORIES);
  const protein = parseBoundedNumber(x.protein, MAX_MACRO_GRAMS);
  const carbs = parseBoundedNumber(x.carbs, MAX_MACRO_GRAMS);
  const fat = parseBoundedNumber(x.fat, MAX_MACRO_GRAMS);
  if (calories === null || protein === null || carbs === null || fat === null) {
    return null;
  }
  return { calories, protein, carbs, fat };
}

/**
 * Parse + validate the model's JSON. Returns null when the shape is
 * unusable (→ "failed"), or the literal string "not_recipe" when the model
 * flagged a source that contains no recipe.
 */
function parseScannedRecipeJson(raw: string): ScannedRecipe | "not_recipe" | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  if (data.notRecipe === true) return "not_recipe";

  const title = parseBoundedString(data.title, MAX_TITLE_CHARS);
  if (title === null) return null;

  if (!Array.isArray(data.ingredients)) return null;
  const ingredients = data.ingredients
    .map(parseIngredient)
    .filter((i): i is ScannedIngredient => i !== null)
    .slice(0, MAX_INGREDIENTS);
  if (ingredients.length === 0) return null;

  const steps = Array.isArray(data.steps)
    ? data.steps
        .map((s) => parseBoundedString(s, MAX_STEP_CHARS))
        .filter((s): s is string => s !== null)
        .slice(0, MAX_STEPS)
    : [];

  const servingsRaw = parseBoundedNumber(data.servings, MAX_SERVINGS);
  const servings = servingsRaw !== null && servingsRaw >= 1 ? servingsRaw : null;

  return {
    title,
    servings,
    ingredients,
    steps,
    macros: parseMacros(data.macros),
  };
}

// ── Base64 (default runtime: no Buffer) ───────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
}

// ── Vision prompt ──────────────────────────────────────────────

const SCAN_SYSTEM_PROMPT = `You are extracting a structured recipe from photos or a PDF of a recipe source (cookbook page, printout, screenshot, handwritten card, blog export).

Respond with JSON only, exactly one of these shapes:

If the source clearly does NOT contain a recipe:
{"notRecipe": true}

Otherwise:
{
  "title": "recipe name as printed",
  "servings": number | null,
  "ingredients": [{"name": "flour", "quantity": "1.5", "unit": "cups"}],
  "steps": ["first instruction", "second instruction"],
  "macros": {"calories": number, "protein": number, "carbs": number, "fat": number} | null
}

Rules:
- Transcribe what the source says; do NOT invent ingredients, quantities, or steps that are not present.
- "quantity" is a string: prefer decimal numbers ("1.5", "0.5" — not "1/2"); keep genuinely freeform amounts as text ("a pinch", "to taste"); use "" when no quantity is given.
- "unit" is the unit as printed ("g", "cups", "tbsp"), or null when there is none.
- "servings" only when the source states it; otherwise null.
- "macros" ONLY when nutrition facts are printed in the source — never estimate. Report totals for the WHOLE recipe: if the source prints per-serving values and a servings count, multiply them out; if totals cannot be determined, use null. Calories in kcal, protein/carbs/fat in grams.
- Multiple images are pages/parts of the same single recipe.`;

// ── Action: scan a recipe from photos or a PDF ─────────────────

/**
 * Extract a structured recipe from uploaded photos (1-4) or a single PDF.
 * Pro-gated. Files must have been registered via
 * `nutritionVision.registerMealPhoto`; the client discards them afterwards.
 * Nothing is saved server-side — the client shows an editable review.
 */
export const scanRecipe = action({
  args: {
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        kind: v.union(v.literal("image"), v.literal("pdf")),
      })
    ),
  },
  handler: async (ctx, args): Promise<ScanRecipeResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Recipe scanning is a Pro feature (same gate as meal-photo analysis).
    const isPro: boolean = await ctx.runQuery(
      internal.subscriptions.checkSubscription,
      { userId }
    );
    if (!isPro) {
      return { status: "error", code: "pro_required" };
    }

    // Shape guards: 1-4 images, or exactly one PDF.
    if (args.files.length === 0 || args.files.length > MAX_FILES) {
      return { status: "error", code: "failed" };
    }
    const hasPdf = args.files.some((f) => f.kind === "pdf");
    if (hasPdf && args.files.length !== 1) {
      return { status: "error", code: "failed" };
    }

    // Ownership check: the caller must have registered every upload.
    // Fail generically — don't leak whether a foreign id exists.
    for (const file of args.files) {
      const owner: Id<"users"> | null = await ctx.runQuery(
        internal.nutritionVision.getPhotoOwner,
        { storageId: file.storageId }
      );
      if (owner !== userId) {
        return { status: "error", code: "failed" };
      }
    }

    // Build the user message content: image URLs, or the PDF inlined as
    // base64 (the Chat Completions `file` content part handles multi-page
    // PDFs natively — no client-side rendering needed).
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: "Extract the recipe from this source." },
    ];
    for (const file of args.files) {
      if (file.kind === "image") {
        const url = await ctx.storage.getUrl(file.storageId);
        if (!url) return { status: "error", code: "failed" };
        content.push({ type: "image_url", image_url: { url } });
      } else {
        const blob = await ctx.storage.get(file.storageId);
        if (!blob) return { status: "error", code: "failed" };
        if (blob.size > MAX_PDF_BYTES) {
          return { status: "error", code: "too_large" };
        }
        const base64 = arrayBufferToBase64(await blob.arrayBuffer());
        content.push({
          type: "file",
          file: {
            filename: "recipe.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
        });
      }
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: OPENAI_VISION_MODEL,
        messages: [
          { role: "system", content: SCAN_SYSTEM_PROMPT },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const raw = response.choices[0]?.message?.content;
      const parsed = raw ? parseScannedRecipeJson(raw) : null;

      if (parsed === null) return { status: "error", code: "failed" };
      if (parsed === "not_recipe") {
        return { status: "error", code: "not_recipe" };
      }

      return { status: "ok", recipe: parsed };
    } catch {
      return { status: "error", code: "failed" };
    }
  },
});
