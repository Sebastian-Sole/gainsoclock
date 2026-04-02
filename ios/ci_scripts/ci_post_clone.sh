#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

# Install Node.js via Homebrew (available in Xcode Cloud)
brew install node@20
brew link node@20 --force --overwrite

# Navigate to repository root
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install JS dependencies
npm install --legacy-peer-deps

# Install CocoaPods dependencies
cd ios
pod install
