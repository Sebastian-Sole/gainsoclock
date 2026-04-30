/**
 * Founder signature — paste your exported SVG here.
 *
 * Export your handwritten signature as SVG (Adobe Express, Figma,
 * Procreate → Vector, or any tracing tool). Open the .svg in a text
 * editor, copy the entire `<svg ...>...</svg>` block, and replace the
 * placeholder string below.
 *
 * Tips for the export:
 *  - Stroke (no fill) reads best on dark + light themes.
 *  - Stroke color: use `currentColor` so the consumer can theme it.
 *  - Strip width/height attributes — let the consumer control size.
 *  - Keep the viewBox; it's how we scale the signature.
 *
 * Example export shape (replace with yours):
 *   <svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
 *     <path d="M ..." stroke="currentColor" stroke-width="2"
 *           fill="none" stroke-linecap="round" stroke-linejoin="round" />
 *   </svg>
 */
export const SEBASTIAN_SIGNATURE_SVG = `
<svg viewBox="0 0 220 60" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M 8 38 Q 14 18 24 24 T 38 38 Q 44 22 52 30 Q 58 36 64 26 L 70 18 Q 76 28 82 36 Q 90 26 96 36 Q 102 46 110 32 Q 118 22 124 36 Q 130 46 138 30 Q 146 18 152 30 Q 158 42 166 30 Q 174 18 180 32 Q 186 44 194 30 Q 200 22 208 30"
    stroke="currentColor"
    stroke-width="2.4"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M 32 44 Q 80 50 142 44"
    stroke="currentColor"
    stroke-width="1.4"
    fill="none"
    stroke-linecap="round"
    opacity="0.6"
  />
</svg>
`.trim();
