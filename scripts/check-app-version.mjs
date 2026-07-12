#!/usr/bin/env node
// Version drift + release guard.
//
// Default mode (runs on every PR): asserts the app version is consistent across
// its three homes so we can never ship a mismatch —
//   - app.json          expo.version, expo.ios.buildNumber, expo.android.versionCode
//   - project.pbxproj   MARKETING_VERSION, CURRENT_PROJECT_VERSION (all configs)
//   - Info.plist        must reference $(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION),
//                       not a hardcoded literal (which would silently override pbxproj)
//
// --release mode (runs on a `v*` tag push): additionally asserts the build number
// strictly increased and the marketing version did not regress versus the previous
// release tag — so a forgotten bump fails the release instead of getting rejected
// by App Store Connect. ~no deps.
//
// Usage:
//   node scripts/check-app-version.mjs            # consistency only
//   node scripts/check-app-version.mjs --release  # consistency + monotonic vs last tag

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_JSON = join(repoRoot, "app.json");
const PBXPROJ = join(repoRoot, "ios", "Fitbull.xcodeproj", "project.pbxproj");
const INFO_PLIST = join(repoRoot, "ios", "Fitbull", "Info.plist");

const errors = [];
const fail = (msg) => errors.push(msg);

// --- app.json ---
const app = JSON.parse(readFileSync(APP_JSON, "utf8"));
const expo = app.expo ?? {};
const appVersion = String(expo.version ?? "");
const appBuild = String(expo.ios?.buildNumber ?? "");
const appVersionCode = String(expo.android?.versionCode ?? "");

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  fail(`app.json expo.version "${appVersion}" is not a 3-part semver.`);
}
if (!/^\d+$/.test(appBuild)) {
  fail(`app.json expo.ios.buildNumber "${appBuild}" is not set to an integer string.`);
}
if (appVersionCode !== appBuild) {
  fail(
    `app.json expo.android.versionCode (${appVersionCode}) must equal ` +
      `expo.ios.buildNumber (${appBuild}).`,
  );
}

// --- pbxproj: every config must carry the same values, matching app.json ---
// Values may be quoted (`MARKETING_VERSION = "1.1.1";`) — the expo-live-activity
// prebuild plugin writes the LiveActivity extension target's settings quoted,
// while Expo's template writes the app target's unquoted. Both are equivalent
// in pbxproj, so strip surrounding quotes before comparing.
const unquote = (s) => s.replace(/^"(.*)"$/, "$1");
const pbx = readFileSync(PBXPROJ, "utf8");
const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((x) => unquote(x[1]));
const current = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((x) => unquote(x[1]));

if (marketing.length === 0) fail("project.pbxproj has no MARKETING_VERSION.");
if (current.length === 0) fail("project.pbxproj has no CURRENT_PROJECT_VERSION.");
for (const v of marketing) {
  if (v !== appVersion) {
    fail(`pbxproj MARKETING_VERSION "${v}" != app.json version "${appVersion}".`);
  }
}
for (const v of current) {
  if (v !== appBuild) {
    fail(`pbxproj CURRENT_PROJECT_VERSION "${v}" != app.json buildNumber "${appBuild}".`);
  }
}

// --- Info.plist must defer to the build settings, not hardcode a literal ---
const plist = readFileSync(INFO_PLIST, "utf8");
const shortVer = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/);
const bundleVer = plist.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]*)<\/string>/);
if (shortVer && shortVer[1] !== "$(MARKETING_VERSION)") {
  fail(
    `Info.plist CFBundleShortVersionString is hardcoded to "${shortVer[1]}"; ` +
      `it must be $(MARKETING_VERSION).`,
  );
}
if (bundleVer && bundleVer[1] !== "$(CURRENT_PROJECT_VERSION)") {
  fail(
    `Info.plist CFBundleVersion is hardcoded to "${bundleVer[1]}"; ` +
      `it must be $(CURRENT_PROJECT_VERSION).`,
  );
}

// --- --release: monotonic vs the previous release tag ---
if (process.argv.includes("--release") && errors.length === 0) {
  // Tags are `v<version>+<build>`. Find the highest by (version, build).
  let tags = [];
  try {
    tags = execSync('git tag --list "v*"', { cwd: repoRoot })
      .toString()
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    tags = [];
  }
  const parse = (t) => {
    const mt = t.match(/^v(\d+)\.(\d+)\.(\d+)\+(\d+)$/);
    if (!mt) return null;
    const [maj, min, pat, bld] = mt.slice(1).map(Number);
    return { maj, min, pat, bld, raw: t };
  };
  const thisTag = `v${appVersion}+${appBuild}`;
  const prev = tags
    .map(parse)
    .filter(Boolean)
    .filter((p) => p.raw !== thisTag) // ignore the tag we're validating
    .sort((a, b) => a.maj - b.maj || a.min - b.min || a.pat - b.pat || a.bld - b.bld)
    .pop();

  if (prev) {
    const buildNum = Number(appBuild);
    if (buildNum <= prev.bld) {
      fail(
        `Build number ${buildNum} must be greater than the last release ` +
          `(${prev.raw}, build ${prev.bld}). Run: pnpm release:build (or release:patch).`,
      );
    }
    const [maj, min, pat] = appVersion.split(".").map(Number);
    const regressed =
      maj < prev.maj ||
      (maj === prev.maj && min < prev.min) ||
      (maj === prev.maj && min === prev.min && pat < prev.pat);
    if (regressed) {
      fail(
        `Marketing version ${appVersion} is lower than the last release ` +
          `(${prev.maj}.${prev.min}.${prev.pat}).`,
      );
    }
  } else {
    console.log("No prior release tag found — treating this as the first release.");
  }
}

if (errors.length > 0) {
  console.error("\n✖ Version check failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ Version consistent: ${appVersion} (build ${appBuild}).`);
