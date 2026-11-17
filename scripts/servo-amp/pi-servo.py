#!/usr/bin/env python3
# MrTiptop / Robbie De Wet
"""Drive a hobby servo from a plain GPIO with software-timed pulses (lgpio).

The Pi's hardware PWM also drives the 3.5 mm audio jack, so this never touches it:
the pin is an ordinary GPIO and pulses only exist while a command runs. A little
jitter during a move is expected. Needs python3-lgpio. Run as root.

  pi-servo.py press               rest -> press -> rest, then stop the pulses
  pi-servo.py pulse 1500 [secs]   hold a 1500 us pulse (default 1 s), then stop
  pi-servo.py angle 90 [secs]     0-180 degrees, mapped onto MIN_US..MAX_US
  pi-servo.py off                 drive the pin low, no pulses

Pin, positions and timing come from /etc/default/servo-amp (KEY=value lines).
"""

import sys
import time

import lgpio

CONFIG = "/etc/default/servo-amp"
SERVO_HZ = 50
HARD_MIN_US, HARD_MAX_US = 500, 2500

DEFAULTS = {
    "GPIOCHIP": 0,
    "GPIO": 12,
    "MIN_US": 900,
    "MAX_US": 2000,
    "REST_US": 1500,
    "PRESS_US": 950,
    "HOLD_MS": 500,
    "SETTLE_MS": 400,
}


def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG, encoding="utf-8") as f:
            for line in f:
                line = line.split("#", 1)[0].strip()
                if "=" not in line:
                    continue
                key, value = (part.strip().strip('"') for part in line.split("=", 1))
                if key in cfg:
                    cfg[key] = int(value)
    except FileNotFoundError:
        pass
    return cfg


class Servo:
    """Pulses run in lgpio's own thread and stop when this process releases the pin."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.gpio = cfg["GPIO"]
        self.handle = lgpio.gpiochip_open(cfg["GPIOCHIP"])
        lgpio.gpio_claim_output(self.handle, self.gpio, 0)

    def pulse(self, us):
        lo = max(HARD_MIN_US, self.cfg["MIN_US"])
        hi = min(HARD_MAX_US, self.cfg["MAX_US"])
        us = max(lo, min(hi, int(us)))
        lgpio.tx_servo(self.handle, self.gpio, us, SERVO_HZ)
        return us

    def close(self):
        lgpio.tx_servo(self.handle, self.gpio, 0)
        lgpio.gpio_write(self.handle, self.gpio, 0)
        lgpio.gpiochip_close(self.handle)


def press(servo, cfg):
    servo.pulse(cfg["REST_US"])
    time.sleep(cfg["SETTLE_MS"] / 1000)
    servo.pulse(cfg["PRESS_US"])
    time.sleep(cfg["HOLD_MS"] / 1000)
    servo.pulse(cfg["REST_US"])
    time.sleep(cfg["SETTLE_MS"] / 1000)


def main(argv):
    if len(argv) < 2 or argv[1] not in ("pulse", "angle", "press", "off"):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd in ("pulse", "angle") and len(argv) < 3:
        print(f"servo: {cmd} needs a value", file=sys.stderr)
        return 2

    cfg = load_config()
    servo = Servo(cfg)
    try:
        if cmd == "press":
            press(servo, cfg)
            print(f"servo: pressed ({cfg['REST_US']} -> {cfg['PRESS_US']} -> {cfg['REST_US']} us)")
        elif cmd in ("pulse", "angle"):
            value = float(argv[2])
            if cmd == "angle":
                value = cfg["MIN_US"] + (cfg["MAX_US"] - cfg["MIN_US"]) * max(0.0, min(180.0, value)) / 180.0
            seconds = float(argv[3]) if len(argv) > 3 else 1.0
            us = servo.pulse(value)
            print(f"servo: holding {us} us for {seconds:g} s")
            time.sleep(seconds)
    finally:
        servo.close()
    if cmd == "off":
        print("servo: off")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
