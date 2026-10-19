#!/usr/bin/env bash
# MrTiptop / Robbie De Wet
#
# Installs the amplifier-switch servo on the Snapcast DietPi. Run as root from this directory.
# Wiring: white (signal) -> pin 32 / GPIO12, black -> pin 34 GND, red -> 5 V.
# Software-timed pulses (lgpio) leave the PWM hardware, and so the 3.5 mm jack, alone.

set -euo pipefail
cd "$(dirname "$0")"
[[ "$(id -u)" -eq 0 ]] || { echo "run as root" >&2; exit 1; }

if ! python3 -c 'import lgpio' 2>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq python3-lgpio
fi

CFG=/boot/firmware/config.txt
[[ -f "$CFG" ]] || CFG=/boot/config.txt
if grep -qE '^dtoverlay=pwm' "$CFG"; then
    echo ">>> WARNING: $CFG enables hardware PWM (dtoverlay=pwm...). That conflicts with the 3.5 mm jack" >&2
    echo ">>> and is not needed for this servo; remove the line and reboot." >&2
fi

install -m 0755 pi-servo.py /usr/local/bin/pi-servo.py
install -m 0755 servo-amp-api.py /usr/local/bin/servo-amp-api.py
[[ -f /etc/default/servo-amp ]] || install -m 0644 servo-amp.example /etc/default/servo-amp
install -m 0644 servo-amp-api.service /etc/systemd/system/servo-amp-api.service
systemctl daemon-reload
systemctl enable --now servo-amp-api.service

echo ">>> Installed pi-servo.py and servo-amp-api (POST http://<pi>:8099/press)"
echo ">>> Test with the arm free: pi-servo.py pulse 1500 1"
