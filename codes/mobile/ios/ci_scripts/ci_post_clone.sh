#!/bin/bash
# Xcode Cloud: run after clone, next to Timia.xcodeproj.
# https://developer.apple.com/documentation/xcode/writing-custom-build-scripts
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f Config/Debug.xcconfig ]]; then
  cp Config/Debug.xcconfig.example Config/Debug.xcconfig
fi

if [[ -n "${CI_BUILD_NUMBER:-}" ]]; then
  sed -i '' "s/CURRENT_PROJECT_VERSION: \"1\"/CURRENT_PROJECT_VERSION: \"${CI_BUILD_NUMBER}\"/" project.yml
fi

brew install xcodegen && xcodegen generate
