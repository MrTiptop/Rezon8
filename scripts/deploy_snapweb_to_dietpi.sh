#!/usr/bin/env bash
# MrTiptop / Robbie De Wet
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.dietpi.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy scripts/.env.dietpi.local.example to scripts/.env.dietpi.local and fill values."
  exit 1
fi

read_env_value() {
  local key="$1"
  local line
  line="$(awk -v k="${key}" '
    $0 ~ "^[[:space:]]*"k"=" {
      sub(/^[[:space:]]+/, "", $0);
      print $0;
      exit;
    }
  ' "${ENV_FILE}")"
  line="${line#${key}=}"
  line="${line%$'\r'}"
  # Strip matching surrounding quotes only.
  if [[ "${line}" =~ ^\".*\"$ ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "${line}" =~ ^\'.*\'$ ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "${line}"
}

DIETPI_HOST="$(read_env_value DIETPI_HOST)"
DIETPI_USER="$(read_env_value DIETPI_USER)"
DIETPI_TARGET_ROOT="$(read_env_value DIETPI_TARGET_ROOT)"
DIETPI_RESTART="$(read_env_value DIETPI_RESTART)"
DIETPI_PASSWORD="$(read_env_value DIETPI_PASSWORD)"

: "${DIETPI_HOST:?DIETPI_HOST is required}"
: "${DIETPI_USER:?DIETPI_USER is required}"
: "${DIETPI_TARGET_ROOT:?DIETPI_TARGET_ROOT is required}"
DIETPI_RESTART="${DIETPI_RESTART:-1}"

SRC_JS="${REPO_ROOT}/docker/snapcast-test/snapweb/snapcontrol.js"
SRC_CSS="${REPO_ROOT}/docker/snapcast-test/snapweb/styles.css"

if [[ ! -f "${SRC_JS}" || ! -f "${SRC_CSS}" ]]; then
  echo "Snapweb source files not found under docker/snapcast-test/snapweb/"
  exit 1
fi

REMOTE="${DIETPI_USER}@${DIETPI_HOST}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

run_ssh() {
  if [[ -n "${DIETPI_PASSWORD}" ]]; then
    SSHPASS="${DIETPI_PASSWORD}" sshpass -e ssh "${SSH_OPTS[@]}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$@"
  fi
}

run_scp() {
  if [[ -n "${DIETPI_PASSWORD}" ]]; then
    SSHPASS="${DIETPI_PASSWORD}" sshpass -e scp "${SSH_OPTS[@]}" "$@"
  else
    scp "${SSH_OPTS[@]}" "$@"
  fi
}

if [[ -n "${DIETPI_PASSWORD}" ]] && ! command -v sshpass >/dev/null 2>&1; then
  echo "DIETPI_PASSWORD is set but 'sshpass' is not installed."
  echo "Install sshpass or leave DIETPI_PASSWORD empty to use key-based login."
  exit 1
fi

echo "Uploading snapweb assets to ${REMOTE}:/tmp/"
run_scp "${SRC_JS}" "${SRC_CSS}" "${REMOTE}:/tmp/"

echo "Installing assets into ${DIETPI_TARGET_ROOT}"
run_ssh "${REMOTE}" "install -m 0644 /tmp/snapcontrol.js \"${DIETPI_TARGET_ROOT}/snapcontrol.js\" && install -m 0644 /tmp/styles.css \"${DIETPI_TARGET_ROOT}/styles.css\""

if [[ "${DIETPI_RESTART}" == "1" ]]; then
  echo "Restarting snapserver"
  run_ssh "${REMOTE}" "systemctl restart snapserver"
else
  echo "Skipping snapserver restart (DIETPI_RESTART=${DIETPI_RESTART})"
fi

echo "Deploy complete."
