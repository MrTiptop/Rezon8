<!-- MrTiptop / Robbie De Wet -->
# Amplifier power switch servo

A hobby servo on the Snapcast DietPi (`DIETPI_HOST` in `scripts/.env.dietpi.local`, a Pi 3B+)
presses the amplifier's power button: it swings ~35° right of centre, holds for 0.5 s, returns to
centre and releases. snapweb can trigger it through a small HTTP service on port 8099.

The pulses are timed in software on a plain GPIO (lgpio). The Pi's hardware PWM is never used,
because it also drives the 3.5 mm audio jack; the jack is unaffected, and pulses only exist for the
second or two a press takes. A little jitter during the move is expected and harmless.

| File | Installed to | Purpose |
|---|---|---|
| `pi-servo.py` | `/usr/local/bin/` | Drives the servo with lgpio (`press`, `pulse`, `angle`, `off`) |
| `servo-amp.example` | `/etc/default/servo-amp` | GPIO, rest/press positions and timing (tuned on an E-Sky EK2-0508) |
| `servo-amp-api.py` | `/usr/local/bin/` | `POST /press` runs one press; ignores taps while the arm is moving |
| `servo-amp-api.service` | `/etc/systemd/system/` | Starts the HTTP trigger at boot |
| `install.sh` | — | Installs `python3-lgpio` and everything above |

## Parts

- 5 V hobby servo (E-Sky EK2-0508 or similar)
- 3 female–female jumper wires, or a servo extension lead plus jumpers
- 470–1000 µF electrolytic capacitor, 10 V or higher, across the servo's red and black wires
- 5 V for the servo: the Pi's 5 V pin is fine with a PoE HAT; otherwise a separate 5 V, 1 A supply
- With a PoE HAT: a 2×20 stacking (extra-tall) header so the pins stay reachable under the HAT
- Optional: 330 Ω–1 kΩ resistor in series with the signal wire
- A bracket, double-sided tape or 3D-printed mount to hold the arm just clear of the button

## Wiring (Pi powered off)

| Servo wire | Connect to |
|---|---|
| White (signal) | Pin 32, GPIO12 |
| Black (ground) | Pin 34 (GND), plus the external supply's ground if one is used |
| Red (+5 V) | Pin 2 or 4 (5 V) when powered by PoE, otherwise the external 5 V supply |

Seen from above with the USB/LAN ports on the right, pins 32 and 34 are the 16th and 17th pins on
the row along the board edge; pins 2 and 4 are the first two on that row. Use separate jumpers; the
servo's 3-pin plug order does not match the header. Any free GPIO works if `GPIO=` in
`/etc/default/servo-amp` is changed to match.

## Setup on the Pi

1. Copy this folder to the Pi and run `sudo ./install.sh` (no reboot needed).
2. With the arm free: `pi-servo.py pulse 1500 1` should centre the arm, hold it for a second and
   release it.
3. Mounted at the amplifier, tune `PRESS_US` in `/etc/default/servo-amp` until it presses the button
   firmly without straining (about 110 µs per 10°; lower values turn right on the EK2-0508), then
   run `pi-servo.py press`.
4. From another machine: `curl -X POST http://<pi>:8099/press`.

## Triggering from snapweb

```js
fetch(`http://${location.hostname}:8099/press`, { method: 'POST' });
```

Responses: `200` pressed, `409` a press is already running, `500` the servo command failed.

## Notes

- **Do not add `dtoverlay=pwm…` to `config.txt`.** Hardware PWM would claim the jack's PWM from boot,
  not just during a press; `install.sh` warns if the line is present.
- **PoE HATs** fit the Pi 3B+ (it has the 4-pin PoE header). The official HATs use pins 27/28 for
  their fan; this servo does not need them.
- **Power dips:** on a micro-USB supply every press dipped the 5 V rail into under-voltage, which an
  audio Pi can also turn into a click. PoE power plus the capacitor, or a separate supply with a
  common ground, avoids it.
- **The trigger has no authentication.** Keep port 8099 on the LAN; do not forward it.
