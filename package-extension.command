#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$ROOT_DIR/FABXTension"
DIST_DIR="$ROOT_DIR/distribution"
BUILD_DIR="$DIST_DIR/build"
TMP_DIR="$BUILD_DIR/tmp"
LICENSE_PATH="$ROOT_DIR/LICENSE"

DEFAULT_FIREFOX_ID="fabxtension@sulifoj.local"
FIREFOX_ID="${FIREFOX_EXTENSION_ID:-$DEFAULT_FIREFOX_ID}"
BUMP_MODE="patch"
MANIFEST_PATH="$SRC_DIR/manifest.json"

usage() {
    cat <<'EOF'
Usage:
  ./package-extension.command [--firefox-id addon@example.com] [--bump patch|minor|major|none]

Description:
  Generates two ZIP files ready for Chrome Web Store and Firefox Add-ons.

Outputs:
  distribution/build/FABXTension-chrome-<version>.zip
  distribution/build/FABXTension-firefox-<version>.zip

Tip:
  Default Firefox ID: fabxtension@sulifoj.local
  Default version bump: patch
  You can override it with --firefox-id or FIREFOX_EXTENSION_ID.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --firefox-id)
            shift
            if [[ $# -eq 0 ]]; then
                echo "Error: --firefox-id requires a value." >&2
                exit 1
            fi
            FIREFOX_ID="$1"
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        --bump)
          shift
          if [[ $# -eq 0 ]]; then
            echo "Error: --bump requires one of: patch, minor, major, none." >&2
            exit 1
          fi
          BUMP_MODE="$1"
          ;;
        --no-bump)
          BUMP_MODE="none"
          ;;
        *)
            echo "Error: unknown argument '$1'." >&2
            usage
            exit 1
            ;;
    esac
    shift
done

if [[ ! -d "$SRC_DIR" ]]; then
    echo "Error: source directory not found: $SRC_DIR" >&2
    exit 1
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Error: manifest not found: $MANIFEST_PATH" >&2
  exit 1
fi

case "$BUMP_MODE" in
  patch|minor|major|none)
    ;;
  *)
    echo "Error: invalid --bump value '$BUMP_MODE'. Use patch, minor, major, none." >&2
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required to patch manifests for store packaging." >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    echo "Error: zip command is required." >&2
    exit 1
fi

bump_version_in_manifest() {
    local manifest_path="$1"
    local bump_mode="$2"

    node -e '
const fs = require("fs");
const manifestPath = process.argv[1];
const bumpMode = process.argv[2];

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const current = String(manifest.version || "").trim();
const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!m) {
  throw new Error(`manifest.version must be semver-like x.y.z, got: ${current || "<empty>"}`);
}

const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]);

let nextMajor = major;
let nextMinor = minor;
let nextPatch = patch;

if (bumpMode === "patch") {
  nextPatch += 1;
} else if (bumpMode === "minor") {
  nextMinor += 1;
  nextPatch = 0;
} else if (bumpMode === "major") {
  nextMajor += 1;
  nextMinor = 0;
  nextPatch = 0;
}

const next = `${nextMajor}.${nextMinor}.${nextPatch}`;

if (bumpMode !== "none") {
  manifest.version = next;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

process.stdout.write(`${current}|${next}`);
' "$manifest_path" "$bump_mode"
}

VERSION_INFO="$(bump_version_in_manifest "$MANIFEST_PATH" "$BUMP_MODE")"
OLD_VERSION="${VERSION_INFO%%|*}"
NEW_VERSION="${VERSION_INFO##*|}"

if [[ "$BUMP_MODE" == "none" ]]; then
    echo "Version kept: $OLD_VERSION"
else
    echo "Version bumped ($BUMP_MODE): $OLD_VERSION -> $NEW_VERSION"
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/chrome" "$TMP_DIR/firefox" "$BUILD_DIR"

cp -R "$SRC_DIR"/. "$TMP_DIR/chrome"/
cp -R "$SRC_DIR"/. "$TMP_DIR/firefox"/

if [[ -f "$LICENSE_PATH" ]]; then
    cp "$LICENSE_PATH" "$TMP_DIR/chrome/LICENSE"
    cp "$LICENSE_PATH" "$TMP_DIR/firefox/LICENSE"
fi

find "$TMP_DIR" -name '.DS_Store' -delete

patch_manifest() {
    local target="$1"
    local manifest_path="$2"
    local firefox_id="$3"

    node -e '
const fs = require("fs");
const target = process.argv[1];
const manifestPath = process.argv[2];
const firefoxId = process.argv[3];

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const background = manifest.background || {};
const serviceWorker = typeof background.service_worker === "string" ? background.service_worker : null;

if (target === "chrome") {
  if (manifest.background && Object.prototype.hasOwnProperty.call(manifest.background, "scripts")) {
    delete manifest.background.scripts;
  }

  if (Object.prototype.hasOwnProperty.call(manifest, "browser_specific_settings")) {
    delete manifest.browser_specific_settings;
  }
}

if (target === "firefox") {
  manifest.background = manifest.background || {};
  if (Object.prototype.hasOwnProperty.call(manifest.background, "service_worker")) {
    delete manifest.background.service_worker;
  }
  if (!Array.isArray(manifest.background.scripts)) {
    const fallbackScript = serviceWorker || "events.js";
    manifest.background.scripts = [fallbackScript];
  }

  manifest.browser_specific_settings = manifest.browser_specific_settings || {};
  manifest.browser_specific_settings.gecko = manifest.browser_specific_settings.gecko || {};
  manifest.browser_specific_settings.gecko.strict_min_version = manifest.browser_specific_settings.gecko.strict_min_version || "140.0";

  manifest.browser_specific_settings.gecko_android = manifest.browser_specific_settings.gecko_android || {};
  manifest.browser_specific_settings.gecko_android.strict_min_version = manifest.browser_specific_settings.gecko_android.strict_min_version || "142.0";

  manifest.browser_specific_settings.gecko.id = firefoxId;

  if (!manifest.browser_specific_settings.gecko.data_collection_permissions) {
    manifest.browser_specific_settings.gecko.data_collection_permissions = {
      required: ["none"]
    };
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
' "$target" "$manifest_path" "$firefox_id"
}

patch_manifest "chrome" "$TMP_DIR/chrome/manifest.json" ""
patch_manifest "firefox" "$TMP_DIR/firefox/manifest.json" "$FIREFOX_ID"

CHROME_ZIP="$BUILD_DIR/FABXTension-chrome-$NEW_VERSION.zip"
FIREFOX_ZIP="$BUILD_DIR/FABXTension-firefox-$NEW_VERSION.zip"

# En zsh, los globs sin coincidencias pueden abortar el script (nomatch).
# Usamos find para limpiar artefactos previos sin romper la ejecución.
find "$BUILD_DIR" -maxdepth 1 -type f \( -name 'FABXTension-chrome-*.zip' -o -name 'FABXTension-firefox-*.zip' \) -delete

(
    cd "$TMP_DIR/chrome"
    zip -rq "$CHROME_ZIP" .
)

(
    cd "$TMP_DIR/firefox"
    zip -rq "$FIREFOX_ZIP" .
)

echo "Build complete:"
echo "  - $CHROME_ZIP"
echo "  - $FIREFOX_ZIP"
echo "  - Firefox gecko.id: $FIREFOX_ID"
echo "  - Extension version: $NEW_VERSION"
