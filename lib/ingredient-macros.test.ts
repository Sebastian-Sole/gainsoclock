import { describe, it, expect } from 'vitest';
import { scalePer100gMacros } from './ingredient-macros';
import { parseLocaleNumber } from './format';
import type { Macros } from './types';

const oats: Macros = { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 };

describe('scalePer100gMacros', () => {
  it('is the identity (rounded) at 100 g', () => {
    expect(scalePer100gMacros(oats, 100)).toEqual({
      calories: 389,
      protein: 17,
      carbs: 66,
      fat: 7,
    });
  });

  it('scales down to 50 g', () => {
    expect(scalePer100gMacros(oats, 50)).toEqual({
      calories: 195, // 194.5 rounds up
      protein: 8, // 8.45 rounds down
      carbs: 33, // 33.15
      fat: 3, // 3.45
    });
  });

  it('scales up past 100 g', () => {
    expect(scalePer100gMacros(oats, 250)).toEqual({
      calories: 973, // 972.5
      protein: 42, // 42.25
      carbs: 166, // 165.75 rounds up
      fat: 17, // 17.25
    });
  });

  it('handles fractional grams', () => {
    const sugar: Macros = { calories: 400, protein: 0, carbs: 100, fat: 0 };
    expect(scalePer100gMacros(sugar, 12.5)).toEqual({
      calories: 50,
      protein: 0,
      carbs: 13, // 12.5 rounds up
      fat: 0,
    });
  });

  it('accepts comma-decimal input parsed via parseLocaleNumber', () => {
    const grams = parseLocaleNumber('82,5');
    expect(scalePer100gMacros(oats, grams)).toEqual({
      calories: 321, // 320.925
      protein: 14, // 13.9425
      carbs: 55, // 54.6975
      fat: 6, // 5.6925
    });
  });

  it('returns null for zero grams', () => {
    expect(scalePer100gMacros(oats, 0)).toBeNull();
  });

  it('returns null for negative grams', () => {
    expect(scalePer100gMacros(oats, -25)).toBeNull();
  });

  it('returns null for null (failed parse) and non-finite input', () => {
    expect(scalePer100gMacros(oats, null)).toBeNull();
    expect(scalePer100gMacros(oats, parseLocaleNumber('abc'))).toBeNull();
    expect(scalePer100gMacros(oats, Number.NaN)).toBeNull();
    expect(scalePer100gMacros(oats, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
