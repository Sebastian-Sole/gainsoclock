#!/usr/bin/env node
// Single-line TextInput Dynamic-Type tripwire.
//
// A single-line TextInput whose box has a FIXED height clips its text against
// the border once iOS Dynamic Type scales the font (the box doesn't grow with
// the text). The fix pattern is a *minimum* height (`min-h-[Npx]`) plus
// padding so the box grows. The `Input` primitive (components/ui/input.tsx)
// implements this; raw TextInputs that stay raw must follow the same rule.
//
// This script scans app/** and components/** for raw `<TextInput` elements
// (not `multiline`) and errors when:
//   1. the TextInput's own className contains a fixed height (h-N / h-[Npx]),
//   2. the TextInput's className contains a named Tailwind text-size class
//      (text-sm/base/lg/…) — these inject a line-height that re-introduces
//      the iOS off-centre placeholder bug; size with text-[Npx] instead,
//   3. the nearest enclosing JSX element (same file, lower indentation,
//      within 15 lines) has a fixed height in its className — the wrapper
//      variant of the same clipping bug.
//
// False positive? Add a `// input-height-ok: <reason>` comment on the line
// directly above the flagged TextInput or wrapper. ~no deps.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = [join(repoRoot, "app"), join(repoRoot, "components")];

const FIXED_HEIGHT = /(?<![a-z]-)\bh-(\d+(\.\d+)?|\[\d+(px|pt)\])/; // not min-h-/max-h-
const NAMED_TEXT_SIZE = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/;
const WAIVER = /input-height-ok/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(entry)) yield p;
  }
}

function indentOf(line) {
  const m = line.match(/^\s*/);
  return m ? m[0].length : 0;
}

const problems = [];

for (const dir of SOURCE_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<TextInput")) continue;
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("<TextInput")) continue;

      // Collect the element's props until the closing `>` / `/>`.
      let propsEnd = i;
      while (
        propsEnd < lines.length - 1 &&
        !/\/?>/.test(lines[propsEnd]) &&
        propsEnd - i < 40
      ) {
        propsEnd++;
      }
      const props = lines.slice(i, propsEnd + 1).join("\n");
      if (/\bmultiline\b/.test(props)) continue;
      if (i > 0 && WAIVER.test(lines[i - 1])) continue;

      const rel = relative(repoRoot, file);

      if (FIXED_HEIGHT.test(props)) {
        problems.push(
          `${rel}:${i + 1} — single-line TextInput has a fixed height; use min-h-[Npx] so Dynamic Type can grow the box`,
        );
      }
      if (NAMED_TEXT_SIZE.test(props)) {
        problems.push(
          `${rel}:${i + 1} — single-line TextInput uses a named text-size class (injects line-height); size with text-[Npx]`,
        );
      }

      // Nearest enclosing element with lower indentation: the wrapper box.
      const tiIndent = indentOf(lines[i]);
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const line = lines[j];
        if (!/<(View|Pressable|Animated\.View)\b/.test(line)) continue;
        if (indentOf(line) >= tiIndent) continue;
        // className may continue on following lines up to the tag close.
        let wrapEnd = j;
        while (
          wrapEnd < i &&
          !/>\s*$/.test(lines[wrapEnd]) &&
          wrapEnd - j < 8
        ) {
          wrapEnd++;
        }
        const wrapper = lines.slice(j, wrapEnd + 1).join("\n");
        if (
          FIXED_HEIGHT.test(wrapper) &&
          !(j > 0 && WAIVER.test(lines[j - 1]))
        ) {
          problems.push(
            `${rel}:${j + 1} — fixed-height wrapper around a single-line TextInput; use min-h-[Npx] + padding so Dynamic Type can grow the box`,
          );
        }
        break; // only the nearest enclosing element
      }
    }
  }
}

if (problems.length > 0) {
  console.error("Dynamic-Type input check failed:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\n${problems.length} problem(s). Fix the height (min-h, not h) or add a` +
      ` \`// input-height-ok: <reason>\` waiver on the line above.`,
  );
  process.exit(1);
}

console.log("check-input-heights: OK");
