#!/usr/bin/env bash
# MrTiptop
# Install/upgrade librespot + shairport-sync on the DietPi Snapserver host
# to the pins in docker/snapcast-test/stream-sources.versions.json.
#
# Requires scripts/.env.dietpi.local (see .env.dietpi.local.example).
#
# Usage:
#   ./scripts/upgrade_dietpi_stream_sources.sh
#   ./scripts/upgrade_dietpi_stream_sources.sh --restart
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.dietpi.local"
VERSIONS_FILE="${REPO_ROOT}/docker/snapcast-test/stream-sources.versions.json"
INSTALLER="${SCRIPT_DIR}/install_stream_sources.sh"
RESTART=0

for arg in "$@"; do
  case "${arg}" in
    --restart) RESTART=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy scripts/.env.dietpi.local.example and fill values."
  exit 1
fi

if [[ ! -f "${INSTALLER}" || ! -f "${VERSIONS_FILE}" ]]; then
  echo "Missing installer or versions file under ${REPO_ROOT}"
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
  if [[ "${line}" =~ ^\".*\"$ ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "${line}" =~ ^\'.*\'$ ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "${line}"
}

DIETPI_HOST="$(read_env_value DIETPI_HOST)"
DIETPI_USER="$(read_env_value DIETPI_USER)"
DIETPI_PASSWORD="$(read_env_value DIETPI_PASSWORD)"
DIETPI_RESTART="$(read_env_value DIETPI_RESTART)"
: "${DIETPI_HOST:?DIETPI_HOST is required}"
: "${DIETPI_USER:?DIETPI_USER is required}"
DIETPI_RESTART="${DIETPI_RESTART:-1}"
[[ "${RESTART}" -eq 1 ]] && DIETPI_RESTART=1

REMOTE="${DIETPI_USER}@${DIETPI_HOST}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

run_ssh() {
  if [[ -n "${DIETPI_PASSWORD}" ]]; then
    if ! command -v sshpass >/dev/null 2>&1; then
      echo "DIETPI_PASSWORD is set but 'sshpass' is not installed."
      exit 1
    fi
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

echo "Uploading installer + version pins to ${REMOTE}..."
run_ssh "${REMOTE}" "mkdir -p /tmp/rezon8-stream-sources"
run_scp "${INSTALLER}" "${VERSIONS_FILE}" "${REMOTE}:/tmp/rezon8-stream-sources/"
# Keep relative path layout the installer expects (…/scripts + …/docker/…)
run_ssh "${REMOTE}" 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p /tmp/rezon8-stream-sources/repo/scripts /tmp/rezon8-stream-sources/repo/docker/snapcast-test
mv /tmp/rezon8-stream-sources/install_stream_sources.sh /tmp/rezon8-stream-sources/repo/scripts/
mv /tmp/rezon8-stream-sources/stream-sources.versions.json /tmp/rezon8-stream-sources/repo/docker/snapcast-test/
chmod +x /tmp/rezon8-stream-sources/repo/scripts/install_stream_sources.sh
echo "Building on device (librespot via cargo can take a while on Pi)..."
/tmp/rezon8-stream-sources/repo/scripts/install_stream_sources.sh
which librespot
which shairport-sync
librespot --version || true
shairport-sync -V || true
cat /usr/local/share/rezon8/stream-sources.versions.json
REMOTE

if [[ "${DIETPI_RESTART}" == "1" ]]; then
  echo "Restarting snapserver on ${REMOTE}..."
  run_ssh "${REMOTE}" "systemctl restart snapserver && systemctl is-active snapserver"
else
  echo "Skipping snapserver restart (DIETPI_RESTART=${DIETPI_RESTART})"
fi

echo "DietPi stream sources upgraded."
