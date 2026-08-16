#!/bin/bash
set -e

PLATFORM="${1:-mac}"
ARCH="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Skip interactive prompts
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_ENABLE_AUTO_PIN=0

# Fix permissions for container volume overlay (created as root)
if [ -d "node_modules" ] && [ ! -w "node_modules" ] && command -v sudo &>/dev/null; then
  sudo chown "$(id -u):$(id -g)" node_modules
fi

# Install deps only if needed
if [ ! -f "node_modules/.modules.yaml" ]; then
  echo "==> Installing dependencies..."
  pnpm install --frozen-lockfile=false --force
else
  echo "==> Dependencies already installed, skipping."
fi

# On Linux (devcontainer): install platform-specific binaries for cross-build
if [ "$(uname)" != "Darwin" ]; then
  ARCH_NAME=$(uname -m)

  # esbuild: need Linux binary for JS compilation (pnpm installed darwin variant)
  if [ "$ARCH_NAME" = "aarch64" ]; then ESBUILD_PKG="@esbuild/linux-arm64"; else ESBUILD_PKG="@esbuild/linux-x64"; fi
  if [ ! -d "node_modules/$ESBUILD_PKG" ]; then
    echo "==> Installing esbuild Linux binary..."
    npm install --no-save "$ESBUILD_PKG" 2>/dev/null || true
  fi

  # @parcel/watcher: install darwin prebuilt (has platform-specific optional deps)
  if [ ! -d "node_modules/@parcel/watcher-darwin-arm64" ]; then
    echo "==> Installing @parcel/watcher darwin prebuilt..."
    npm install --no-save @parcel/watcher-darwin-arm64 2>/dev/null || true
  fi
fi

echo "==> Building assets..."
pnpm run generate
pnpm run build:esbuild:prod

echo "==> Packaging (platform: $PLATFORM)..."

if [ "$PLATFORM" = "mac" ]; then
  ARCH_FLAG=""
  if [ -n "$ARCH" ]; then
    ARCH_FLAG="--$ARCH"
  fi

  if [ "$(uname)" = "Darwin" ]; then
    # On macOS: normal build with ad-hoc signing
    SIGNAL_ENV=production \
    CSC_IDENTITY_AUTO_DISCOVERY=false \
    SIGN_MACOS_SCRIPT="$SCRIPT_DIR/sign-macos-local.sh" \
      npx electron-builder --mac --dir $ARCH_FLAG \
        -c.mac.notarize=false \
        -c.forceCodeSigning=false
  else
    # On Linux: cross-build macOS .app
    echo "    Cross-building macOS .app from Linux..."

    NOSIGN="/tmp/nosign.sh"
    echo '#!/bin/bash' > "$NOSIGN" && chmod +x "$NOSIGN"

    # No-op hooks: skip fuses (OnlyLoadAppFromAsar breaks asar=false) and notarization
    NOOP_JS="/tmp/noop-hook.cjs"
    echo 'exports.afterPack = async () => {}; exports.afterSign = async () => {}' > "$NOOP_JS"

    SIGNAL_ENV=production \
    CSC_IDENTITY_AUTO_DISCOVERY=false \
    SIGN_MACOS_SCRIPT="$NOSIGN" \
      npx electron-builder --mac --dir $ARCH_FLAG \
        -c.mac.notarize=false \
        -c.forceCodeSigning=false \
        -c.npmRebuild=false \
        -c.asar=false \
        -c.afterPack="$NOOP_JS" \
        -c.afterSign="$NOOP_JS"

    # Fix native modules in the .app bundle
    for dir in dist/mac-arm64 dist/mac-x64 dist/mac; do
      if [ -d "$dir/Signal.app" ]; then
        APP_RES="$dir/Signal.app/Contents/Resources/app"

        # Re-copy @signalapp modules with dereferenced symlinks (pnpm symlinks break)
        echo "==> Fixing native module prebuilds..."
        for pkg in @signalapp/libsignal-client @signalapp/sqlcipher @signalapp/ringrtc; do
          if [ -d "node_modules/$pkg" ] && [ -d "$APP_RES/node_modules/$pkg" ]; then
            rm -rf "$APP_RES/node_modules/$pkg"
            cp -rL "node_modules/$pkg" "$APP_RES/node_modules/$pkg"
          fi
        done

        # Inject pre-compiled macOS binaries (compiled on host, committed to repo)
        if [ -f "prebuilds/darwin-arm64/fs-xattr.node" ]; then
          echo "==> Injecting fs-xattr darwin prebuilt..."
          mkdir -p "$APP_RES/node_modules/fs-xattr/build/Release"
          cp "prebuilds/darwin-arm64/fs-xattr.node" "$APP_RES/node_modules/fs-xattr/build/Release/xattr.node"
        fi
        if [ -f "prebuilds/darwin-arm64/mac-screen-share.node" ]; then
          echo "==> Injecting mac-screen-share darwin prebuilt..."
          mkdir -p "$APP_RES/node_modules/@indutny/mac-screen-share/build/Release"
          cp "prebuilds/darwin-arm64/mac-screen-share.node" "$APP_RES/node_modules/@indutny/mac-screen-share/build/Release/mac-screen-share.node"
        fi

        # Inject @parcel/watcher darwin prebuilt
        if [ -d "node_modules/@parcel/watcher-darwin-arm64" ]; then
          echo "==> Injecting @parcel/watcher darwin prebuilt..."
          rm -rf "$APP_RES/node_modules/@parcel/watcher-darwin-arm64"
          cp -rL "node_modules/@parcel/watcher-darwin-arm64" "$APP_RES/node_modules/@parcel/watcher-darwin-arm64"
        fi
      fi
    done

    # Ad-hoc sign with rcodesign if available
    if command -v rcodesign &>/dev/null; then
      for dir in dist/mac-arm64 dist/mac-x64 dist/mac; do
        if [ -d "$dir/Signal.app" ]; then
          APP="$dir/Signal.app"
          echo "==> Signing $APP with rcodesign..."
          find "$APP" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" \) -exec rcodesign sign {} \; 2>/dev/null
          find "$APP/Contents/Frameworks" -maxdepth 2 -name "*.app" -exec rcodesign sign {} \; 2>/dev/null
          find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.framework" -exec rcodesign sign {} \; 2>/dev/null
          rcodesign sign "$APP"
        fi
      done
    fi
  fi

  echo ""
  echo "==> Build complete!"
  for dir in dist/mac-arm64 dist/mac-x64 dist/mac; do
    if [ -d "$dir/Signal.app" ]; then
      echo "    .app: $dir/Signal.app"
    fi
  done

elif [ "$PLATFORM" = "linux" ]; then
  SIGNAL_ENV=production \
    npx electron-builder --linux --dir

  echo ""
  echo "==> Build complete!"
  echo "    Output: dist/linux-unpacked/"

elif [ "$PLATFORM" = "windows" ]; then
  # Wine is required for Windows cross-build, but only works on x86_64 Linux
  if [ "$(uname)" != "Darwin" ] && ! command -v wine64 &>/dev/null; then
    if [ "$(uname -m)" != "x86_64" ]; then
      echo "Error: Windows cross-build requires x86_64 Linux (Wine can't run on ARM64)."
      echo "Use an x86_64 host or build on Windows directly."
      exit 1
    fi
    echo "==> Installing Wine (required for Windows cross-build)..."
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends wine64
  fi

  SIGNAL_ENV=production \
  CSC_IDENTITY_AUTO_DISCOVERY=false \
    npx electron-builder --win --dir \
      -c.forceCodeSigning=false

  echo ""
  echo "==> Build complete!"
  echo "    Output: dist/win-unpacked/"

else
  echo "Usage: $0 [mac|linux|windows] [arm64|x64]"
  echo ""
  echo "Examples:"
  echo "  $0             # Build macOS .app (native arch)"
  echo "  $0 mac arm64   # Build macOS .app for Apple Silicon"
  echo "  $0 mac x64     # Build macOS .app for Intel"
  echo "  $0 linux       # Build Linux app"
  echo "  $0 windows     # Build Windows app"
  exit 1
fi
