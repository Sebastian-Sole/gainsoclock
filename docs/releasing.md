# Releasing (version bumps)

`app.json` is the **single source of truth** for the two numbers the App Store cares about.
The bump script mirrors them into the committed Xcode project; `Info.plist` references the
build settings (`$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`), so nothing drifts.

| Number | Where | Apple rule |
|---|---|---|
| Marketing version | `expo.version` → `CFBundleShortVersionString` | Must be **≥ the last publicly released** version. Bump per public release. |
| Build number | `expo.ios.buildNumber` → `CFBundleVersion` (and `expo.android.versionCode`) | Must be **unique for every binary uploaded**. |

We keep the build number a **global monotonic integer** — it increments on _every_ release,
including marketing bumps — so no upload can ever reuse one. iOS build number and Android
`versionCode` are always the same integer.

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

Then archive in Xcode and upload as usual — the numbers are already set.
Use `--dry-run` to preview without writing.

## What stops us forgetting

- **`pnpm version:check`** (runs in CI on every PR via `checks.yml`) fails if `app.json`,
  `project.pbxproj`, and `Info.plist` disagree — you can't merge a mismatch.
- **`.github/workflows/release.yml`** runs on a `v*` tag push and fails the release if the
  build number wasn't bumped past the previous release tag.
- Because `pnpm release:*` **always** increments the build number, going through it makes a
  stale build number impossible.

> Caveat: CI cannot intercept a manual Xcode Archive+upload that skips the script/tag. The
> discipline is: always cut releases with `pnpm release:*`. The consistency check is the
> always-on backstop; the tag guard covers the sanctioned flow.
