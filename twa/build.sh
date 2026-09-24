#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== ZRNote TWA Build ==="

# Requires: npm i -g @bubblewrap/cli
# Requires: Java JDK 11+, Android SDK (ANDROID_HOME set)

if [ ! -f "build.gradle" ]; then
  echo ">>> Initializing Bubblewrap project..."
  bubblewrap init --manifest="https://zrnote.vercel.app/manifest.json"
else
  echo ">>> Updating Bubblewrap project..."
  bubblewrap update --manifest="https://zrnote.vercel.app/manifest.json"
fi

echo ">>> Building APK..."
bubblewrap build

echo ""
echo "Done. Output: app-release-signed.apk"
echo ""
echo "Get your signing fingerprint for assetlinks.json:"
echo "  keytool -list -v -keystore zrnote-keystore.jks -alias zrnote"
