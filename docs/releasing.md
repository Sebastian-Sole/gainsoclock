# Releasing (version bumps)

`app.json` is the **source of truth for the marketing version**. The bump script mirrors it into
the committed Xcode project; `Info.plist` references the build settings
(`$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`), so nothing drifts *within the repo*.

| Number | Where | Apple rule | Who owns it |
|---|---|---|---|
| Marketing version | `expo.version` → `CFBundleShortVersionString` | Must be **> the last publicly released** version. Bump per public release. | **The repo** (`pnpm release:*`) |
| Build number | `expo.ios.buildNumber` → `CFBundleVersion` (and `expo.android.versionCode`) | Must be **unique for every binary uploaded**. | **Xcode Cloud** for iOS CI builds (see below) |

### Build number: Xcode Cloud owns it for iOS CI builds

> **Reality check:** for iOS binaries produced by Xcode Cloud, the build number in `app.json` /
> `project.pbxproj` is **not** what ships. Xcode Cloud stamps its own auto-incrementing build
> number onto `CFBundleVersion` at archive time. That's why an upload can be "Build 60" while the
> committed `expo.ios.buildNumber` is a much lower number — the two are independent, and that's
> fine, because Apple only requires the build number to be *unique*, which Xcode Cloud guarantees.

So of the two numbers `pnpm release:*` writes, only **`MARKETING_VERSION`** actually reaches an
Xcode Cloud build (via `project.pbxproj`). The build number it writes is effectively cosmetic for
CI builds — Xcode Cloud overrides it. The build number still matters for **local/manual archives**
that don't go through Xcode Cloud, and for the Android `versionCode`, which the script keeps in
lockstep with the iOS build number.

Practical consequence: **a marketing-version bump is the only thing you must get right in the repo
to unblock a rejected CI upload.** Cut it with `pnpm release:*` as below, push, and let Xcode Cloud
build off the new commit — it will assign the next build number itself.

`pnpm version:check` verifies the three *in-repo* locations agree (`app.json` ↔ `project.pbxproj` ↔
`Info.plist`). It does **not** — and can't — compare against Xcode Cloud's runtime build number, so
that expected drift never trips CI.

## Cutting a release

Run one command from a clean tree, then push:

```bash
pnpm release:patch   # 1.0.0 -> 1.0.1, build +1   (bug-fix release)
pnpm release:minor   # 1.0.0 -> 1.1.0, build +1   (feature release)
pnpm release:major   # 1.0.0 -> 2.0.0, build +1   (breaking release)
pnpm release:build    # version unchanged, build +1 (new TestFlight/App Store binary of same version)
```

Each edits `app.json` + `project.pbxproj` and prints the git commands. Add `--tag` to have it
commit and create the `v<version>+<build>` tag for you:

```bash
pnpm release:patch --tag
git push && git push origin v1.0.1+2
```

Then push and let Xcode Cloud build off the new commit (it assigns the build number). For a
**local/manual** archive, the numbers are already set — archive and upload as usual.
Use `--dry-run` to preview without writing.

## What stops us forgetting

- **`pnpm version:check`** (runs in CI on every PR via `checks.yml`) fails if `app.json`,
  `project.pbxproj`, and `Info.plist` disagree — you can't merge a mismatch.
- **`.github/workflows/release.yml`** runs on a `v*` tag push and fails the release if the
  in-repo build number wasn't bumped past the previous release tag.
- Because `pnpm release:*` **always** increments the in-repo build number, the committed numbers
  stay monotonic even though Xcode Cloud stamps its own build number onto the actual iOS binary.

> Caveat: CI cannot intercept a manual Xcode Archive+upload that skips the script/tag, and it does
> not see Xcode Cloud's runtime build number (which is what real iOS uploads carry). The discipline
> is: always cut the **marketing version** with `pnpm release:*`. The consistency check is the
> always-on backstop for in-repo agreement; the tag guard covers the sanctioned flow.
