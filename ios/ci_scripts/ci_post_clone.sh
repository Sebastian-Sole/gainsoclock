#!/bin/sh
set -e

# Install Node.js via Homebrew (available in Xcode Cloud)
brew install node@20
brew link node@20 --force --overwrite

# Navigate to repository root
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install JS dependencies
npm install

# Install CocoaPods dependencies
cd ios
pod install
