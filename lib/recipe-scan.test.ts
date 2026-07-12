import { describe, expect, it } from 'vitest';
import {
  gramsFromScan,
  matchSavedIngredient,
  normalizeQuantity,
  scannedIngredientMacros,
} from './recipe-scan';
import type { SavedIngredient } from './types';

const library: SavedIngredient[] = [
  {
    id: 'ing-1',
    name: 'Chicken Breast',
    per100g: { calories: 120, protein: 22, carbs: 0, fat: 3 },
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ing-2',
    name: 'Oats',
    per100g: { calories: 380, protein: 13, carbs: 60, fat: 7 },
    source: 'barcode',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('normalizeQuantity', () => {
  it('normalizes comma decimals through the shared parser', () => {
    expect(normalizeQuantity('1,5')).toBe('1.5');
  });

  it('keeps dot decimals and trims whitespace', () => {
    expect(normalizeQuantity(' 0.5 ')).toBe('0.5');
  });

  it('passes freeform amounts through untouched (trimmed)', () => {
    expect(normalizeQuantity(' a pinch ')).toBe('a pinch');
    expect(normalizeQuantity('1/2')).toBe('1/2');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeQuantity('')).toBe('');
  });
});

describe('gramsFromScan', () => {
  it('parses gram quantities, including comma decimals', () => {
    expect(gramsFromScan('200', 'g')).toBe(200);
    expect(gramsFromScan('12,5', 'grams')).toBe(12.5);
  });

  it('converts kilograms to grams', () => {
    expect(gramsFromScan('1,5', 'kg')).toBe(1500);
  });

  it('returns null for non-weight units, missing units, and bad numbers', () => {
    expect(gramsFromScan('2', 'cups')).toBeNull();
    expect(gramsFromScan('200', null)).toBeNull();
    expect(gramsFromScan('a pinch', 'g')).toBeNull();
    expect(gramsFromScan('-5', 'g')).toBeNull();
  });
});

describe('matchSavedIngredient', () => {
  it('matches case-insensitively with trimming', () => {
    expect(matchSavedIngredient('  chicken breast ', library)?.id).toBe('ing-1');
  });

  it('returns undefined for unknown or empty names', () => {
    expect(matchSavedIngredient('Quinoa', library)).toBeUndefined();
    expect(matchSavedIngredient('   ', library)).toBeUndefined();
  });
});

describe('scannedIngredientMacros', () => {
  it('scales per-100g macros for a gram-quantified library match', () => {
    const macros = scannedIngredientMacros(
      { name: 'oats', quantity: '50', unit: 'g' },
      library
    );
    expect(macros).toEqual({ calories: 190, protein: 7, carbs: 30, fat: 4 });
  });

  it('returns null when the name has no library match', () => {
    expect(
      scannedIngredientMacros({ name: 'quinoa', quantity: '50', unit: 'g' }, library)
    ).toBeNull();
  });

  it('returns null when the quantity is not gram-convertible', () => {
    expect(
      scannedIngredientMacros({ name: 'Oats', quantity: '2', unit: 'cups' }, library)
    ).toBeNull();
  });
});
