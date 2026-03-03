#!/usr/bin/env bash

set -euo pipefail

TARGET_ROOT="/usr/share/snapserver/snapweb"
API_BASE=""
RESTART_SERVICE="false"

usage() {
  cat <<'EOF'
Usage: deploy_follow_me_snapweb_overlay.sh [options]

Copy Rezon8 Snapweb Follow Me UI integration files into a live Snapweb doc_root.

Options:
  --target-root <path>   Snapweb doc_root (default: /usr/share/snapserver/snapweb)
  --api-base <url>       Enable service-backed toggle, e.g. http://192.168.4.40:8765
                         (writes statusUrl/toggleUrl in config.js)
  --restart              Restart snapserver after copy
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-root)
      TARGET_ROOT="$2"
      shift 2
      ;;
    --api-base)
      API_BASE="$2"
      shift 2
      ;;
    --restart)
      RESTART_SERVICE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "${TARGET_ROOT}" ]]; then
  echo "Target doc_root not found: ${TARGET_ROOT}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_ROOT="${REPO_ROOT}/docker/snapcast-test/snapweb"

for file in config.js snapcontrol.js styles.css; do
  if [[ ! -f "${SOURCE_ROOT}/${file}" ]]; then
    echo "Missing source file: ${SOURCE_ROOT}/${file}"
    exit 1
  fi
done

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${TARGET_ROOT}/.rezon8-follow-me-backup-${timestamp}"
mkdir -p "${backup_dir}"

echo "Backing up existing files to ${backup_dir}"
for file in config.js snapcontrol.js styles.css; do
  if [[ -f "${TARGET_ROOT}/${file}" ]]; then
    cp "${TARGET_ROOT}/${file}" "${backup_dir}/${file}"
  fi
done

echo "Copying Follow Me UI overlay files into ${TARGET_ROOT}"
for file in config.js snapcontrol.js styles.css; do
  cp "${SOURCE_ROOT}/${file}" "${TARGET_ROOT}/${file}"
done

if [[ -n "${API_BASE}" ]]; then
  echo "Patching config.js with Follow Me API endpoint: ${API_BASE}"
  python3 - <<'PY' "${TARGET_ROOT}/config.js" "${API_BASE}"
import re
import sys
from pathlib import Path

cfg_path = Path(sys.argv[1])
api_base = sys.argv[2].rstrip("/")
text = cfg_path.read_text(encoding="utf-8")

block = (
    "    followMeApi: {\n"
    f"        statusUrl: '{api_base}/follow-me',\n"
    f"        toggleUrl: '{api_base}/follow-me',\n"
    "        method: 'POST'\n"
    "    }\n"
)

if "followMeApi" in text:
    text = re.sub(
        r"followMeApi\s*:\s*\{[\s\S]*?\}",
        block.rstrip(),
        text,
        count=1,
    )
else:
    text = re.sub(r"(\s*\};\s*)$", ",\n" + block + r"\1", text, count=1)

cfg_path.write_text(text, encoding="utf-8")
PY
fi

if [[ "${RESTART_SERVICE}" == "true" ]]; then
  echo "Restarting snapserver..."
  systemctl restart snapserver
fi

echo "Done."
echo "If needed, restore from backup files in: ${backup_dir}"
