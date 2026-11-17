#!/usr/bin/env bash
# MrTiptop
# Build/install librespot + shairport-sync at the pins in
# docker/snapcast-test/stream-sources.versions.json (Snapcast-compatible builds).
#
# Usage (Debian/DietPi/Raspberry Pi OS):
#   sudo ./scripts/install_stream_sources.sh
#   sudo ./scripts/install_stream_sources.sh --prefix /usr/local
#   sudo LIBRESPOT_VERSION=v0.8.0 SHAIRPORT_SYNC_VERSION=5.6.3 ./scripts/install_stream_sources.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSIONS_FILE="${REPO_ROOT}/docker/snapcast-test/stream-sources.versions.json"
PREFIX="${PREFIX:-/usr/local}"
BUILD_ROOT="${BUILD_ROOT:-/tmp/rezon8-stream-sources-build}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo) so binaries can be installed to ${PREFIX}/bin"
  exit 1
fi

if [[ ! -f "${VERSIONS_FILE}" ]]; then
  echo "Missing ${VERSIONS_FILE}"
  exit 1
fi

read_json_version() {
  local key="$1"
  python3 -c "import json; print(json.load(open('${VERSIONS_FILE}'))['${key}'])"
}

LIBRESPOT_VERSION="${LIBRESPOT_VERSION:-$(read_json_version librespot)}"
SHAIRPORT_SYNC_VERSION="${SHAIRPORT_SYNC_VERSION:-$(read_json_version shairport-sync)}"

echo "Installing stream sources to ${PREFIX}/bin"
echo "  librespot:       ${LIBRESPOT_VERSION}"
echo "  shairport-sync:  ${SHAIRPORT_SYNC_VERSION}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  git \
  pkg-config \
  python3 \
  autoconf \
  automake \
  libtool \
  libpopt-dev \
  libconfig-dev \
  libssl-dev \
  libsoxr-dev \
  libavahi-client-dev \
  avahi-daemon \
  cmake \
  clang \
  libasound2-dev

install_rustup_if_needed() {
  if command -v cargo >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing rustup (minimal profile)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  # shellcheck disable=SC1091
  source "${HOME}/.cargo/env"
}

install_librespot() {
  install_rustup_if_needed
  # shellcheck disable=SC1091
  [[ -f "${HOME}/.cargo/env" ]] && source "${HOME}/.cargo/env"

  echo "Building librespot ${LIBRESPOT_VERSION}..."
  cargo install \
    --locked \
    --force \
    --root "${PREFIX}" \
    --git https://github.com/librespot-org/librespot \
    --tag "${LIBRESPOT_VERSION}" \
    --bins
  # cargo install --root puts binaries in PREFIX/bin
  "${PREFIX}/bin/librespot" --version || true
}

install_shairport_sync() {
  mkdir -p "${BUILD_ROOT}"
  local src="${BUILD_ROOT}/shairport-sync"
  rm -rf "${src}"
  echo "Cloning shairport-sync ${SHAIRPORT_SYNC_VERSION}..."
  git clone --depth 1 --branch "${SHAIRPORT_SYNC_VERSION}" \
    https://github.com/mikebrady/shairport-sync.git "${src}"
  cd "${src}"
  autoreconf -fi
  # Snapcast launches shairport-sync and reads stdout PCM + metadata.
  ./configure \
    --prefix="${PREFIX}" \
    --sysconfdir=/etc \
    --with-stdout \
    --with-pipe \
    --with-avahi \
    --with-ssl=openssl \
    --with-metadata \
    --with-soxr \
    --without-configfiles
  make -j"${JOBS}"
  make install
  "${PREFIX}/bin/shairport-sync" -V || true

  # Snapcast must own the process — disable any distro/systemd unit if present.
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now shairport-sync 2>/dev/null || true
  fi
}

install_librespot
install_shairport_sync

# Record installed pins for operators / CI.
mkdir -p "${PREFIX}/share/rezon8"
cat > "${PREFIX}/share/rezon8/stream-sources.versions.json" <<EOF
{
  "librespot": "${LIBRESPOT_VERSION}",
  "shairport-sync": "${SHAIRPORT_SYNC_VERSION}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Done."
echo "  librespot:      $(command -v librespot || echo missing) ($(librespot --version 2>/dev/null | head -1 || echo '?'))"
echo "  shairport-sync: $(command -v shairport-sync || echo missing) ($(shairport-sync -V 2>/dev/null | head -1 || echo '?'))"
echo "  pins written:   ${PREFIX}/share/rezon8/stream-sources.versions.json"
