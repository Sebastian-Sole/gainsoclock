#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# Install Node.js and CMake via Homebrew (available in Xcode Cloud).
# CMake is needed when hermes-engine falls back to building from source.
brew install node@20 cmake
brew link node@20 --force --overwrite

# Navigate to repository root
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Materialize EXPO_PUBLIC_* secrets from Xcode Cloud into .env.local so the
# Metro bundle phase inlines them. Fail fast on anything required — without
# Convex the JS bundle throws at module load, and without the RevenueCat
# key the paywall ships disabled and TestFlight subscribers can't unlock
# gated features (e.g. the chat tab).
required_vars="EXPO_PUBLIC_CONVEX_URL EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"
missing=""
for v in $required_vars; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then
    missing="$missing $v"
  fi
done
if [ -n "$missing" ]; then
  echo "error: required Xcode Cloud env vars are missing:$missing" >&2
  exit 1
fi

# Diagnostic: log presence (names + length only — never values) of every
# EXPO_PUBLIC_* var the bundle expects, so a missing var is obvious in the
# Xcode Cloud build log instead of silently producing a broken bundle.
echo "[ci_post_clone] EXPO_PUBLIC_* env presence:"
for v in EXPO_PUBLIC_CONVEX_URL \
         EXPO_PUBLIC_CONVEX_SITE_URL \
         EXPO_PUBLIC_POSTHOG_API_KEY \
         EXPO_PUBLIC_REVENUECAT_API_KEY_IOS \
         EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID \
         EXPO_PUBLIC_SENTRY_DSN \
         SENTRY_AUTH_TOKEN \
         SENTRY_ORG \
         SENTRY_PROJECT; do
  eval "val=\${$v:-}"
  if [ -n "$val" ]; then
    echo "  $v: set (${#val} chars)"
  else
    echo "  $v: MISSING"
  fi
done

{
  echo "EXPO_PUBLIC_CONVEX_URL=$EXPO_PUBLIC_CONVEX_URL"
  [ -n "$EXPO_PUBLIC_CONVEX_SITE_URL" ] && echo "EXPO_PUBLIC_CONVEX_SITE_URL=$EXPO_PUBLIC_CONVEX_SITE_URL"
  [ -n "$EXPO_PUBLIC_POSTHOG_API_KEY" ] && echo "EXPO_PUBLIC_POSTHOG_API_KEY=$EXPO_PUBLIC_POSTHOG_API_KEY"
  echo "EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=$EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"
  [ -n "$EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID" ] && echo "EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=$EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID"
  [ -n "$EXPO_PUBLIC_SENTRY_DSN" ] && echo "EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN"
} > .env.local

# Sentry source-map upload during the Xcode bundle phase reads these from
# the shell env (no need to be inlined into the JS bundle).
# SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT must be set in the Xcode
# Cloud workflow environment. We don't echo them here — they're already in
# the process env when xcodebuild runs.

# Install pnpm and JS dependencies
npm install -g pnpm
pnpm install --frozen-lockfile

# Install CocoaPods dependencies
cd ios
pod install --repo-update
