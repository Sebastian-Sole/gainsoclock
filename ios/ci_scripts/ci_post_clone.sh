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
# Metro bundle phase inlines them. Fail fast if the Convex URL is missing —
# without it the JS bundle throws at module load and TestFlight gets stuck
# on the splash screen.
if [ -z "$EXPO_PUBLIC_CONVEX_URL" ]; then
  echo "error: EXPO_PUBLIC_CONVEX_URL is not set in the Xcode Cloud workflow environment" >&2
  exit 1
fi
{
  echo "EXPO_PUBLIC_CONVEX_URL=$EXPO_PUBLIC_CONVEX_URL"
  [ -n "$EXPO_PUBLIC_CONVEX_SITE_URL" ] && echo "EXPO_PUBLIC_CONVEX_SITE_URL=$EXPO_PUBLIC_CONVEX_SITE_URL"
  [ -n "$EXPO_PUBLIC_POSTHOG_API_KEY" ] && echo "EXPO_PUBLIC_POSTHOG_API_KEY=$EXPO_PUBLIC_POSTHOG_API_KEY"
  [ -n "$EXPO_PUBLIC_REVENUECAT_API_KEY_IOS" ] && echo "EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=$EXPO_PUBLIC_REVENUECAT_API_KEY_IOS"
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
