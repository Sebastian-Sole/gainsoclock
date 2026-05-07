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

# Install pnpm and JS dependencies
npm install -g pnpm
pnpm install --frozen-lockfile

# Install CocoaPods dependencies
cd ios
pod install --repo-update
