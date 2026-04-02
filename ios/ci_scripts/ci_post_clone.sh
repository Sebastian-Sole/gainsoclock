#!/bin/sh
set -e

# Navigate to repository root
cd "$CI_PRIMARY_REPOSITORY_PATH"

# Install Node.js using nvm (Xcode Cloud has nvm pre-installed)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20

# Install JS dependencies
npm install

# Install CocoaPods dependencies
cd ios
pod install
