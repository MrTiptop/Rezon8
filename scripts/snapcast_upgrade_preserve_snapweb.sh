#!/usr/bin/env bash
# Robbie De Wet

set -euo pipefail

TS="$(date +%F-%H%M%S)"
BACKUP_ROOT="/var/backups/snapcast/${TS}"
OVERLAY_ROOT="/opt/snapweb-custom-overlay"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

detect_snapweb_root() {
  local candidates=(
    "/usr/share/snapserver/snapweb"
    "/usr/share/snapweb"
  )

  for p in "${candidates[@]}"; do
    if [[ -d "${p}" ]]; then
      echo "${p}"
      return 0
    fi
  done

  return 1
}

SNAPWEB_ROOT="$(detect_snapweb_root || true)"
if [[ -z "${SNAPWEB_ROOT}" ]]; then
  echo "Could not detect Snapweb root. Update script candidates and retry."
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"
cp -a "${SNAPWEB_ROOT}" "${BACKUP_ROOT}/snapweb-preupgrade"

if command -v snapserver >/dev/null 2>&1; then
  snapserver --version || true
fi

echo "Updating package index..."
apt-get update

echo "Upgrading snapserver and snapclient..."
apt-get install --only-upgrade -y snapserver snapclient

cp -a "${SNAPWEB_ROOT}" "${BACKUP_ROOT}/snapweb-postupgrade"

if [[ -d "${OVERLAY_ROOT}" ]]; then
  echo "Applying custom overlay from ${OVERLAY_ROOT}..."
  rsync -a "${OVERLAY_ROOT}/" "${SNAPWEB_ROOT}/"
else
  echo "Overlay directory not found at ${OVERLAY_ROOT}."
  echo "No custom files reapplied. Create this directory for future upgrades."
fi

systemctl restart snapserver
systemctl restart snapclient || true

echo
echo "Upgrade completed."
echo "Snapweb root: ${SNAPWEB_ROOT}"
echo "Note: this updates snapserver/snapclient only."
echo "For latest Snapweb web UI, run scripts/update_snapweb_release_with_overlay.sh"
echo "Backup location: ${BACKUP_ROOT}"
echo "Diff pre/post (excluding overlay reapplies):"
echo "  diff -ru \"${BACKUP_ROOT}/snapweb-preupgrade\" \"${BACKUP_ROOT}/snapweb-postupgrade\" | less"
echo
echo "To keep customizations upgrade-safe:"
echo "1) Copy only your custom files into ${OVERLAY_ROOT}"
echo "2) Re-run this script on each upgrade"
