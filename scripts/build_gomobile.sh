#!/usr/bin/env bash
set -euo pipefail


ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
GOAPI_DIR="$ROOT_DIR/goapi"
ANDROID_LIBS_DIR="$ROOT_DIR/android/app/libs"
IOS_OUT_DIR="$ROOT_DIR/ios"
ANDROID_API=35


mkdir -p "$ANDROID_LIBS_DIR"


# Ensure gomobile is installed and initialized
if ! command -v gomobile >/dev/null 2>&1; then
    echo "Installing gomobile..."
    go install golang.org/x/mobile/cmd/gomobile@latest
    go install golang.org/x/mobile/cmd/gobind@latest
fi


echo "Running gomobile init (may take a while first time)..."
# ANDROID_NDK_HOME is auto-detected if Android Studio is installed; otherwise set it here
GOMOBILE_VERBOSE=1 gomobile init || true

if [ -z "${ANDROID_NDK_HOME:-}" ] && [ -d "${ANDROID_HOME:-$HOME/Android/Sdk}/ndk" ]; then
    export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
    export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk" | sort -V | tail -1)"
    echo "Detected ANDROID_NDK_HOME=$ANDROID_NDK_HOME"
fi

pushd "$GOAPI_DIR" >/dev/null


# ANDROID (AAR)
echo "Building Android AAR..."
gomobile bind -target=android -androidapi "$ANDROID_API" -o "$ANDROID_LIBS_DIR/api.aar" ./mobileapi


# iOS (XCFramework)
echo "Building iOS XCFramework..."
gomobile bind -target=ios -o "$IOS_OUT_DIR/Mobile.xcframework" ./mobileapi


popd >/dev/null


echo "Done. AAR -> android/app/libs/api.aar | iOS -> ios/Mobile.xcframework"