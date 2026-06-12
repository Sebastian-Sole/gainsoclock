// Barcode → nutrition lookup via Open Food Facts (frictionless nutrition,
// Phase 3). Default runtime: `fetch` is available in Convex actions.
//
// Future optimization: cache normalized products in a `barcodeProducts`
// table keyed by code (OFF data changes rarely) to cut latency and be a
// good API citizen. Skipped for now — OFF responds fast enough and our
// volume is low.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";

// ── Types ──────────────────────────────────────────────────────

type Per100g = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type BarcodeProduct = {
  title: string;
  per100g: Per100g;
  servingSizeG?: number;
  imageUrl?: string;
};

type LookupResult =
  | { status: "ok"; product: BarcodeProduct }
  | { status: "not_found" }
  | { status: "error" };

// ── Helpers ────────────────────────────────────────────────────

const OFF_USER_AGENT = "Fitbull/1.0 (support@soleinnovations.com)";
const KJ_PER_KCAL = 4.184;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** OFF sometimes returns numeric fields as strings; accept both. */
function asFiniteNumber(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim().length > 0) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeProduct(product: Record<string, unknown>): BarcodeProduct | null {
  const nutriments = isRecord(product.nutriments) ? product.nutriments : {};

  // kcal per 100g: prefer energy-kcal_100g; fall back to converting
  // energy_100g, which OFF reports in kJ.
  let calories = asFiniteNumber(nutriments["energy-kcal_100g"]);
  if (calories === undefined) {
    const kj = asFiniteNumber(nutriments["energy_100g"]);
    if (kj !== undefined) calories = kj / KJ_PER_KCAL;
  }

  const protein = asFiniteNumber(nutriments["proteins_100g"]);
  const carbs = asFiniteNumber(nutriments["carbohydrates_100g"]);
  const fat = asFiniteNumber(nutriments["fat_100g"]);

  // Without calories + all three macros the entry isn't loggable.
  if (
    calories === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return null;
  }

  const name =
    typeof product.product_name === "string" && product.product_name.trim()
      ? product.product_name.trim()
      : undefined;
  if (!name) return null;

  const brand =
    typeof product.brands === "string" && product.brands.trim()
      ? product.brands.split(",")[0].trim()
      : undefined;
  const title = brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${name} (${brand})`
    : name;

  // serving_quantity is the numeric serving size; only meaningful for us
  // when it's in grams (unit missing defaults to g/ml on OFF).
  const servingQuantity = asFiniteNumber(product.serving_quantity);
  const servingUnit =
    typeof product.serving_quantity_unit === "string"
      ? product.serving_quantity_unit
      : undefined;
  const servingSizeG =
    servingQuantity !== undefined &&
    servingQuantity > 0 &&
    (servingUnit === undefined || servingUnit === "g")
      ? round1(servingQuantity)
      : undefined;

  const imageUrl =
    typeof product.image_front_url === "string" && product.image_front_url
      ? product.image_front_url
      : typeof product.image_url === "string" && product.image_url
        ? product.image_url
        : undefined;

  return {
    title,
    per100g: {
      calories: round1(calories),
      protein: round1(protein),
      carbs: round1(carbs),
      fat: round1(fat),
    },
    ...(servingSizeG !== undefined && { servingSizeG }),
    ...(imageUrl !== undefined && { imageUrl }),
  };
}

// ── Action ─────────────────────────────────────────────────────

export const lookupBarcode = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<LookupResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // EAN-8 .. EAN-13/GTIN-14 — digits only. Reject anything else before
    // it reaches the URL.
    if (!/^\d{8,14}$/.test(args.code)) {
      return { status: "error" };
    }

    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${args.code}.json`,
        { headers: { "User-Agent": OFF_USER_AGENT } }
      );

      if (response.status === 404) return { status: "not_found" };
      if (!response.ok) return { status: "error" };

      const body: unknown = await response.json();
      if (!isRecord(body)) return { status: "error" };

      // OFF v2: status 1 = found, 0 = not found (also signalled via 404).
      if (body.status === 0 || !isRecord(body.product)) {
        return { status: "not_found" };
      }

      const product = normalizeProduct(body.product);
      if (!product) return { status: "not_found" };

      return { status: "ok", product };
    } catch {
      return { status: "error" };
    }
  },
});
