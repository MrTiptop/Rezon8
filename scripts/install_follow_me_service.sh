#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="snapcast-follow-me.service"
SCRIPT_PATH="/usr/local/bin/follow_me_ap_syslog.py"
CONFIG_DIR="/etc/snapcast-follow-me"
CONFIG_PATH="${CONFIG_DIR}/config.json"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
STATE_DIR="/var/lib/snapcast-follow-me"
STATE_FILE="${STATE_DIR}/enabled"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if [[ ! -f "scripts/follow_me_ap_syslog.py" ]]; then
  echo "Expected script at scripts/follow_me_ap_syslog.py (run from repo root)."
  exit 1
fi

install -m 0755 "scripts/follow_me_ap_syslog.py" "${SCRIPT_PATH}"
mkdir -p "${CONFIG_DIR}" "${STATE_DIR}"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  cat > "${CONFIG_PATH}" <<'EOF'
{
  "snapserver_url": "http://127.0.0.1:1780/jsonrpc",
  "hold_seconds": 30,
  "default_volume_percent": 65,
  "phone_patterns": [
    "aa:bb:cc:dd:ee:ff",
    "phone-hostname"
  ],
  "managed_clients": [
    "client-id-lounge",
    "client-id-kitchen"
  ],
  "room_clients": {
    "lounge": "client-id-lounge",
    "kitchen": "client-id-kitchen"
  },
  "room_matchers": [
    {
      "room": "lounge",
      "regex": "LAPAC1200.*LOUNGE|AP-LOUNGE"
    },
    {
      "room": "kitchen",
      "regex": "LAPAC1200.*KITCHEN|AP-KITCHEN"
    }
  ]
}
EOF
  echo "Created example config at ${CONFIG_PATH}. Edit it before enabling service."
fi

if [[ ! -f "${STATE_FILE}" ]]; then
  echo "1" > "${STATE_FILE}"
fi

cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=Snapcast Follow Me controller from AP syslog
After=network-online.target snapserver.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/env python3 ${SCRIPT_PATH} --config ${CONFIG_PATH}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "Installed ${SERVICE_NAME}."
echo "Next steps:"
echo "1) Edit ${CONFIG_PATH} with real MAC/AP mappings and client IDs."
echo "2) Ensure your syslog stream reaches UDP/5514 on this host."
echo "3) Start service: sudo systemctl start ${SERVICE_NAME}"
echo "4) Check logs: sudo journalctl -u ${SERVICE_NAME} -f"
echo
echo "Toggle API (optional for Snapweb integration):"
echo "  GET  http://127.0.0.1:8765/follow-me"
echo "  POST http://127.0.0.1:8765/follow-me  body: {\"enabled\":true|false}"
echo
echo "State file: ${STATE_FILE}"
echo "  enable : echo 1 | sudo tee ${STATE_FILE}"
echo "  disable: echo 0 | sudo tee ${STATE_FILE}"
