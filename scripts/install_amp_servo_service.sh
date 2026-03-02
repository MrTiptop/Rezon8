#!/usr/bin/env bash
# Robbie De Wet

set -euo pipefail

SERVICE_NAME="amp-servo-press.service"
SCRIPT_PATH="/usr/local/bin/amp_servo_press.py"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
PIGPIO_SERVICE="pigpiod.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if [[ ! -f "scripts/amp_servo_press.py" ]]; then
  echo "Expected script at scripts/amp_servo_press.py (run from repo root)."
  exit 1
fi

install -m 0755 "scripts/amp_servo_press.py" "${SCRIPT_PATH}"

cat > "${SERVICE_PATH}" <<'EOF'
[Unit]
Description=Press amplifier button via servo
After=network.target pigpiod.service
Wants=pigpiod.service

[Service]
Type=oneshot
ExecStart=/usr/bin/env python3 /usr/local/bin/amp_servo_press.py --gpio-pin 18 --idle-angle -10 --press-angle 20 --travel-settle 0.35 --press-hold 0.50 --release-settle 0.45

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${PIGPIO_SERVICE}"
systemctl start "${PIGPIO_SERVICE}"

echo "Installed ${SERVICE_NAME}."
echo "Run a test press:"
echo "  sudo systemctl start ${SERVICE_NAME}"
echo "Tune angles by editing ${SCRIPT_PATH} args in ${SERVICE_PATH}."
