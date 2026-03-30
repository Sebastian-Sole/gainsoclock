#!/bin/sh
set -e

# Install Node.js via Homebrew
brew install node

# Install pnpm
npm install -g pnpm

# Install dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --no-frozen-lockfile

# Install CocoaPods dependencies
cd ios
pod install
