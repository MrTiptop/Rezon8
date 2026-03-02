#!/usr/bin/env python3
# Robbie De Wet

"""
Servo-based amplifier button press helper.

Use this script to calibrate and trigger a momentary button press using a servo
connected to a Raspberry Pi GPIO pin.
"""

from __future__ import annotations

import argparse
import fcntl
import os
import sys
import time
from contextlib import contextmanager

from gpiozero import AngularServo
from gpiozero.pins.pigpio import PiGPIOFactory


DEFAULT_LOCK_FILE = "/var/lock/amp-servo-press.lock"


@contextmanager
def file_lock(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        yield


def build_servo(gpio_pin: int, min_angle: float, max_angle: float) -> AngularServo:
    # pigpio backend provides more stable timing than default software PWM.
    factory = PiGPIOFactory()
    return AngularServo(
        gpio_pin,
        min_angle=min_angle,
        max_angle=max_angle,
        pin_factory=factory,
    )


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def move_and_wait(servo: AngularServo, angle: float, settle: float) -> None:
    servo.angle = angle
    time.sleep(settle)


def press_button(
    servo: AngularServo,
    idle_angle: float,
    press_angle: float,
    travel_settle: float,
    press_hold: float,
    release_settle: float,
) -> None:
    move_and_wait(servo, idle_angle, travel_settle)
    move_and_wait(servo, press_angle, press_hold)
    move_and_wait(servo, idle_angle, release_settle)


def run_calibration(
    servo: AngularServo,
    min_angle: float,
    max_angle: float,
    step: float,
    settle: float,
) -> None:
    angle = min_angle
    while angle <= max_angle:
        print(f"Testing angle: {angle:.1f}")
        move_and_wait(servo, angle, settle)
        angle += step
    print("Calibration sweep complete. Returning to neutral (0).")
    move_and_wait(servo, clamp(0.0, min_angle, max_angle), settle)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Trigger amplifier button using servo")
    parser.add_argument("--gpio-pin", type=int, default=18, help="GPIO pin number")
    parser.add_argument("--min-angle", type=float, default=-90.0, help="Servo min angle")
    parser.add_argument("--max-angle", type=float, default=90.0, help="Servo max angle")
    parser.add_argument("--idle-angle", type=float, default=-10.0, help="Idle angle")
    parser.add_argument("--press-angle", type=float, default=20.0, help="Press angle")
    parser.add_argument(
        "--travel-settle",
        type=float,
        default=0.35,
        help="Seconds to settle before/after motion",
    )
    parser.add_argument("--press-hold", type=float, default=0.50, help="Press hold seconds")
    parser.add_argument(
        "--release-settle",
        type=float,
        default=0.45,
        help="Seconds to settle after release",
    )
    parser.add_argument("--lock-file", default=DEFAULT_LOCK_FILE, help="Lock file path")
    parser.add_argument(
        "--calibrate",
        action="store_true",
        help="Sweep angles from min to max for alignment testing",
    )
    parser.add_argument(
        "--cal-step",
        type=float,
        default=10.0,
        help="Calibration sweep step size in degrees",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.min_angle >= args.max_angle:
        print("Error: --min-angle must be less than --max-angle", file=sys.stderr)
        return 2

    idle_angle = clamp(args.idle_angle, args.min_angle, args.max_angle)
    press_angle = clamp(args.press_angle, args.min_angle, args.max_angle)

    servo = build_servo(args.gpio_pin, args.min_angle, args.max_angle)
    try:
        with file_lock(args.lock_file):
            if args.calibrate:
                run_calibration(
                    servo=servo,
                    min_angle=args.min_angle,
                    max_angle=args.max_angle,
                    step=max(1.0, args.cal_step),
                    settle=max(0.05, args.travel_settle),
                )
            else:
                press_button(
                    servo=servo,
                    idle_angle=idle_angle,
                    press_angle=press_angle,
                    travel_settle=max(0.05, args.travel_settle),
                    press_hold=max(0.05, args.press_hold),
                    release_settle=max(0.05, args.release_settle),
                )
                print("Amplifier button press sequence complete.")
    finally:
        servo.detach()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
