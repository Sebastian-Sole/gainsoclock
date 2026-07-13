#!/usr/bin/env node
// Maestro flow-id drift tripwire.
//
// Extracts every `id:` selector referenced by .maestro/**/*.yaml and verifies a
// matching `testID` (or `tabBarButtonTestID`) is rendered somewhere under app/
// or components/. Exits non-zero (listing the orphans) if a flow references an
// id that no component renders — so a forgotten rename fails fast in CI instead
// of after a 45-minute simulator run.
//
// Dynamic id families (e.g. `set-0-weight` rendered from `set-${index}-weight`)
// are matched against the DYNAMIC_FAMILIES allowlist below. ~no deps.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAESTRO_DIR = join(repoRoot, ".maestro");
const SOURCE_DIRS = [join(repoRoot, "app"), join(repoRoot, "components")];

// Dynamic testID families: a flow id matching the `test` regex is satisfied if
// the source regex `source` is found anywhere in the scanned source files.
const DYNAMIC_FAMILIES = [
  {
    test: /^set-\d+-(weight|reps|complete)$/,
    // set-row.tsx renders these from the `index` prop:
    //   testID={`set-${index}-weight`}  (and -reps / -complete)
    source: /testID=\{`set-\$\{index\}-(weight|reps|complete)`\}/,
  },
  {
    test: /^focus-(weight|reps|duration|distance|pace|speed|incline|cadence|calories|power_avg|heart_rate_avg)$/,
    // focus-set-card.tsx renders one input per metric spec:
    //   testID={`focus-${spec.id}`}
    source: /testID=\{`focus-\$\{spec\.id\}`\}/,
  },
];

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

// 1. Collect id selectors from flows. Matches `id: "foo"` / `id: 'foo'` / `id: foo`.
const ID_LINE = /^\s*id:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/;
const flowFiles = walk(MAESTRO_DIR, [".yaml", ".yml"]);
const referenced = new Map(); // id -> Set<relative flow path>

for (const file of flowFiles) {
  const rel = file.slice(repoRoot.length + 1);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = ID_LINE.exec(line);
    if (!m) continue;
    const id = m[1] ?? m[2] ?? m[3];
    if (!id) continue;
    if (!referenced.has(id)) referenced.set(id, new Set());
    referenced.get(id).add(rel);
  }
}

// 2. Load source once.
const sourceFiles = SOURCE_DIRS.flatMap((d) => walk(d, [".tsx", ".ts"]));
const sources = sourceFiles.map((f) => readFileSync(f, "utf8"));
const haystack = sources.join("\n");

function isDefined(id) {
  // Literal testID / tabBarButtonTestID.
  if (
    haystack.includes(`testID="${id}"`) ||
    haystack.includes(`testID='${id}'`) ||
    haystack.includes(`tabBarButtonTestID: "${id}"`) ||
    haystack.includes(`tabBarButtonTestID: '${id}'`)
  ) {
    return true;
  }
  // Dynamic family.
  for (const fam of DYNAMIC_FAMILIES) {
    if (fam.test.test(id) && fam.source.test(haystack)) return true;
  }
  return false;
}

const missing = [];
for (const [id, flows] of referenced) {
  if (!isDefined(id)) missing.push({ id, flows: [...flows].sort() });
}

if (missing.length > 0) {
  console.error("Maestro flow-id drift: ids referenced by flows but rendered by no component:\n");
  for (const { id, flows } of missing.sort((a, b) => a.id.localeCompare(b.id))) {
    console.error(`  ${id}\n      ${flows.join("\n      ")}`);
  }
  console.error(`\n${missing.length} missing id(s). Add the testID or fix the flow.`);
  process.exit(1);
}

console.log(`all ids found (${referenced.size} unique ids across ${flowFiles.length} flow files)`);
