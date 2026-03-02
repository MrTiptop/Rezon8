#!/usr/bin/env bash
# Robbie De Wet

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PI_HOST="192.168.4.40"
PI_USER="dietpi"
PI_PORT="22"
REMOTE_DIR="/opt/rezon8-tools"
DOC_ROOT=""
IDENTITY_FILE=""

DO_UPLOAD="true"
DO_EXECUTE="true"
DRY_RUN="false"

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy_to_pi.sh [options]

Options:
  --host <ip-or-hostname>     Pi host (default: 192.168.4.40)
  --user <ssh-user>           SSH user (default: dietpi)
  --port <ssh-port>           SSH port (default: 22)
  --remote-dir <path>         Remote directory to store scripts (default: /opt/rezon8-tools)
  --doc-root <path>           Optional Snapweb doc root for update script
  --identity <path>           SSH private key file
  --upload-only               Copy files only, do not run remote updates
  --run-only                  Run remote updates only, do not copy files
  --dry-run                   Print commands without executing
  -h, --help                  Show this help

Examples:
  scripts/deploy_to_pi.sh --dry-run
  scripts/deploy_to_pi.sh --user root --identity ~/.ssh/id_ed25519
  scripts/deploy_to_pi.sh --doc-root /usr/share/snapweb
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      PI_HOST="$2"
      shift 2
      ;;
    --user)
      PI_USER="$2"
      shift 2
      ;;
    --port)
      PI_PORT="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --doc-root)
      DOC_ROOT="$2"
      shift 2
      ;;
    --identity)
      IDENTITY_FILE="$2"
      shift 2
      ;;
    --upload-only)
      DO_UPLOAD="true"
      DO_EXECUTE="false"
      shift
      ;;
    --run-only)
      DO_UPLOAD="false"
      DO_EXECUTE="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
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

SSH_TARGET="${PI_USER}@${PI_HOST}"
SSH_OPTS=(-p "${PI_PORT}" -o BatchMode=yes)
SCP_OPTS=(-P "${PI_PORT}" -o BatchMode=yes)
if [[ -n "${IDENTITY_FILE}" ]]; then
  SSH_OPTS+=(-i "${IDENTITY_FILE}")
  SCP_OPTS+=(-i "${IDENTITY_FILE}")
fi

REQUIRED_FILES=(
  "${REPO_ROOT}/scripts/snapcast_upgrade_preserve_snapweb.sh"
  "${REPO_ROOT}/scripts/update_snapweb_release_with_overlay.sh"
  "${REPO_ROOT}/doc/snapweb-migration-v034.md"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${f}" ]]; then
    echo "Required file missing: ${f}"
    exit 1
  fi
done

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

if [[ "${DO_UPLOAD}" == "true" ]]; then
  echo "Uploading files to ${SSH_TARGET}:${REMOTE_DIR}"
  run_cmd ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "mkdir -p '${REMOTE_DIR}'"
  run_cmd scp "${SCP_OPTS[@]}" "${REQUIRED_FILES[0]}" "${REQUIRED_FILES[1]}" "${REQUIRED_FILES[2]}" "${SSH_TARGET}:${REMOTE_DIR}/"
  run_cmd ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "chmod +x '${REMOTE_DIR}/snapcast_upgrade_preserve_snapweb.sh' '${REMOTE_DIR}/update_snapweb_release_with_overlay.sh'"
fi

if [[ "${DO_EXECUTE}" == "true" ]]; then
  echo "Running remote Snapcast package update..."
  run_cmd ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "sudo bash '${REMOTE_DIR}/snapcast_upgrade_preserve_snapweb.sh'"

  echo "Running remote Snapweb update..."
  if [[ -n "${DOC_ROOT}" ]]; then
    run_cmd ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "sudo bash '${REMOTE_DIR}/update_snapweb_release_with_overlay.sh' '${DOC_ROOT}'"
  else
    run_cmd ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "sudo bash '${REMOTE_DIR}/update_snapweb_release_with_overlay.sh'"
  fi
fi

echo "Complete."
