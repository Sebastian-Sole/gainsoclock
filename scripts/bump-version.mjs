#!/usr/bin/env node
// Release version bumper — the single sanctioned way to iterate the app version.
//
// app.json is the source of truth for BOTH numbers Apple cares about:
//   - expo.version         -> CFBundleShortVersionString (the marketing version users see)
//   - expo.ios.buildNumber -> CFBundleVersion            (unique per uploaded binary)
// android.versionCode is kept in lockstep with the iOS build number so a single
// integer identifies every store upload on both platforms.
//
// The build number is a GLOBAL monotonic integer: it increments on every release,
// including marketing-version bumps. That makes every binary unique regardless of
// its marketing version, which is the property App Store Connect / TestFlight care
// about — you can never accidentally reuse a build number.
//
// This script also mirrors the two numbers into the committed Xcode project
// (ios/Fitbull.xcodeproj/project.pbxproj), because that project — not app.json —
// is what `xcodebuild`/Archive reads. Info.plist references $(MARKETING_VERSION) /
// $(CURRENT_PROJECT_VERSION), so pbxproj is the only native place that carries the
// literal numbers. ~no deps.
//
// Usage:
//   node scripts/bump-version.mjs <patch|minor|major|build> [--tag] [--dry-run] [--allow-dirty]
//     patch|minor|major  bump the marketing version (and the build number)
//     build              keep the marketing version, bump only the build number
//                        (a new TestFlight/App Store binary of the same version)
//     --tag              also `git commit` the change and create a `v<version>+<build>` tag
//     --dry-run          print what would change; write nothing
//     --allow-dirty      skip the clean-working-tree check (implied off with --tag)

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_JSON = join(repoRoot, "app.json");
const PBXPROJ = join(repoRoot, "ios", "Fitbull.xcodeproj", "project.pbxproj");

const BUMP_TYPES = new Set(["patch", "minor", "major", "build"]);

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const bumpType = args.find((a) => !a.startsWith("--"));
const flags = new Set(args.filter((a) => a.startsWith("--")));
const dryRun = flags.has("--dry-run");
const wantTag = flags.has("--tag");
const allowDirty = flags.has("--allow-dirty");

if (!bumpType || !BUMP_TYPES.has(bumpType)) {
  die(
    `Pick a bump type: patch | minor | major | build\n` +
      `  e.g. node scripts/bump-version.mjs patch --tag`,
  );
}

// A tagged release must be an isolated, reviewable commit.
if (wantTag && !dryRun) {
  const dirty = execSync("git status --porcelain", { cwd: repoRoot }).toString().trim();
  if (dirty) {
    die(
      `--tag needs a clean working tree so the release is a single commit.\n` +
        `Commit or stash your changes first.`,
    );
  }
} else if (!allowDirty && !dryRun) {
  const dirty = execSync("git status --porcelain", { cwd: repoRoot }).toString().trim();
  if (dirty) {
    die(
      `Working tree is dirty. Commit/stash first, or pass --allow-dirty to bump anyway.`,
    );
  }
}

const app = JSON.parse(readFileSync(APP_JSON, "utf8"));
const expo = app.expo;
if (!expo) die("app.json has no `expo` block.");

const currentVersion = String(expo.version ?? "");
const m = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) die(`expo.version "${currentVersion}" is not a 3-part semver (X.Y.Z).`);
let [major, minor, patch] = m.slice(1).map(Number);

const currentBuild = Number(expo.ios?.buildNumber ?? 0);
if (!Number.isInteger(currentBuild) || currentBuild < 0) {
  die(`expo.ios.buildNumber "${expo.ios?.buildNumber}" is not a non-negative integer.`);
}

// Sanity: iOS build number and Android versionCode should already agree.
const currentVersionCode = Number(expo.android?.versionCode ?? 0);
if (currentVersionCode !== currentBuild) {
  die(
    `expo.ios.buildNumber (${currentBuild}) and expo.android.versionCode ` +
      `(${currentVersionCode}) disagree. Reconcile them before bumping.`,
  );
}

switch (bumpType) {
  case "major":
    major += 1;
    minor = 0;
    patch = 0;
    break;
  case "minor":
    minor += 1;
    patch = 0;
    break;
  case "patch":
    patch += 1;
    break;
  case "build":
    // marketing version unchanged
    break;
}

const newVersion = `${major}.${minor}.${patch}`;
const newBuild = currentBuild + 1; // always monotonic

// --- app.json ---
expo.version = newVersion;
expo.ios = { ...expo.ios, buildNumber: String(newBuild) };
expo.android = { ...expo.android, versionCode: newBuild };
const appOut = JSON.stringify(app, null, 2) + "\n";

// --- pbxproj (all build configs get the same values) ---
let pbx = readFileSync(PBXPROJ, "utf8");
pbx = pbx
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${newVersion};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${newBuild};`);

const tagName = `v${newVersion}+${newBuild}`;

console.log(
  `\n${dryRun ? "[dry-run] " : ""}Release bump (${bumpType})\n` +
    `  version:      ${currentVersion}  ->  ${newVersion}\n` +
    `  build/code:   ${currentBuild}  ->  ${newBuild}\n` +
    `  tag:          ${tagName}\n`,
);

if (dryRun) {
  console.log("No files written (--dry-run).\n");
  process.exit(0);
}

writeFileSync(APP_JSON, appOut);
writeFileSync(PBXPROJ, pbx);
console.log("Wrote app.json and ios/Fitbull.xcodeproj/project.pbxproj.");

if (wantTag) {
  execSync(`git add "${APP_JSON}" "${PBXPROJ}"`, { cwd: repoRoot });
  execSync(
    `git commit -m "chore(release): ${newVersion} (build ${newBuild})"`,
    { cwd: repoRoot, stdio: "inherit" },
  );
  execSync(
    `git tag -a "${tagName}" -m "Release ${newVersion} (build ${newBuild})"`,
    { cwd: repoRoot },
  );
  console.log(
    `\nCommitted and tagged ${tagName}.\n` +
      `Push with:  git push && git push origin ${tagName}\n`,
  );
} else {
  console.log(
    `\nReview the diff, then:\n` +
      `  git add app.json ios/Fitbull.xcodeproj/project.pbxproj\n` +
      `  git commit -m "chore(release): ${newVersion} (build ${newBuild})"\n` +
      `  git tag -a ${tagName} -m "Release ${newVersion} (build ${newBuild})"\n` +
      `(or re-run with --tag to do the commit + tag automatically)\n`,
  );
}
