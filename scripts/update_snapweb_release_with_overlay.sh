#!/usr/bin/env bash
# Robbie De Wet

set -euo pipefail

TS="$(date +%F-%H%M%S)"
BACKUP_ROOT="/var/backups/snapweb/${TS}"
OVERLAY_ROOT="/opt/snapweb-custom-overlay"
DEFAULT_DOC_ROOT="/usr/share/snapserver/snapweb"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing dependency: curl"
  exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
  echo "Missing dependency: unzip"
  echo "Install with: sudo apt install -y unzip"
  exit 1
fi

DOC_ROOT="${1:-${DEFAULT_DOC_ROOT}}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${BACKUP_ROOT}"
mkdir -p "${DOC_ROOT}"

if [[ -d "${DOC_ROOT}" ]]; then
  cp -a "${DOC_ROOT}" "${BACKUP_ROOT}/doc-root-preupdate"
fi

RELEASE_JSON="${TMP_DIR}/latest-release.json"
ASSET_URL_FILE="${TMP_DIR}/asset-url.txt"
ZIP_PATH="${TMP_DIR}/snapweb.zip"
UNPACK_DIR="${TMP_DIR}/snapweb-unpack"

echo "Fetching latest Snapweb release metadata..."
curl -fsSL "https://api.github.com/repos/badaix/snapweb/releases/latest" > "${RELEASE_JSON}"

python3 - <<'PY' "${RELEASE_JSON}" "${ASSET_URL_FILE}"
import json
import sys

release_json = sys.argv[1]
out_file = sys.argv[2]

with open(release_json, "r", encoding="utf-8") as f:
    release = json.load(f)

assets = release.get("assets", [])
url = None
for asset in assets:
    name = asset.get("name", "")
    if name == "snapweb.zip":
        url = asset.get("browser_download_url")
        break

if not url:
    raise SystemExit("Could not find snapweb.zip asset in latest release")

with open(out_file, "w", encoding="utf-8") as f:
    f.write(url)
PY

ASSET_URL="$(cat "${ASSET_URL_FILE}")"
echo "Downloading ${ASSET_URL}..."
curl -fL "${ASSET_URL}" -o "${ZIP_PATH}"

mkdir -p "${UNPACK_DIR}"
unzip -q "${ZIP_PATH}" -d "${UNPACK_DIR}"

echo "Installing Snapweb into ${DOC_ROOT}..."
rm -rf "${DOC_ROOT:?}/"*
cp -a "${UNPACK_DIR}/." "${DOC_ROOT}/"

if [[ -d "${OVERLAY_ROOT}" ]]; then
  echo "Applying custom overlay from ${OVERLAY_ROOT}..."
  rsync -a "${OVERLAY_ROOT}/" "${DOC_ROOT}/"
else
  echo "Overlay directory not found at ${OVERLAY_ROOT}."
  echo "No customization overlay applied."
fi

cp -a "${DOC_ROOT}" "${BACKUP_ROOT}/doc-root-postupdate"

systemctl restart snapserver

echo
echo "Snapweb update complete."
echo "Doc root: ${DOC_ROOT}"
echo "Backup path: ${BACKUP_ROOT}"
echo "Optional diff:"
echo "  diff -ru \"${BACKUP_ROOT}/doc-root-preupdate\" \"${BACKUP_ROOT}/doc-root-postupdate\" | less"
