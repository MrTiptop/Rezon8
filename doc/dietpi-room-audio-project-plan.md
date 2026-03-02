# DietPi Room Audio Project Plan

## Owner
- Robbie De Wet

## Host Baseline
- Hostname: `dietpi-snapcast` (set if not already set)
- Device: Raspberry Pi running DietPi
- Primary role: Snapcast server with customized Snapweb
- IP address: `192.168.4.40`
- Connected via Ethernet to core switch
- Syslog collector for AP logs: `192.168.4.206`

## Goals
1. Keep Snapcast server/client updated while preserving Snapweb customizations.
2. Automatically trigger amplifier power button press from Pi startup/playback events.
3. Add optional "Follow Me" room switching based on phone location.

## Current Constraints
- Amplifier only supports manual push-button power.
- Available actuator right now: RC servo (GPIO-controlled).
- Wi-Fi infrastructure: Linksys LAPAC1200 with logs exported to syslog.

## Phase 1 - Documentation and Safety Baseline
- Record current package versions (`snapserver`, `snapclient`) before changes.
- Export existing Snapweb custom files to a tracked backup directory.
- Document GPIO pin allocation to avoid conflicts with I2S, HATs, and serial pins.
- Define rollback steps before automation changes.

## Phase 2 - Servo Button Press Automation

### Hardware pattern
- Mount a micro servo physically aligned with the amplifier power button.
- Servo horn should travel only enough to press and release the button.
- Use an external 5V supply for servo power (not Pi 5V rail if servo stalls/spikes).
- Tie grounds together: servo PSU ground and Pi ground must be common.

### GPIO control pattern
- Use software PWM from Python with `gpiozero` + `pigpio`.
- Idle position keeps horn clear of button.
- Press routine:
  1. Move horn to press position.
  2. Hold for configured dwell time (for example 0.5s).
  3. Return to release position.
- Include lock file to prevent double-trigger from rapid repeated events.

### Service pattern
- Expose press action as script callable from:
  - systemd service start,
  - manual command,
  - future "audio activity detected" hook.

## Phase 3 - Snapcast Upgrade Workflow (Customization Safe)
- Backup full current Snapweb root to timestamped directory.
- Upgrade `snapserver` and `snapclient`.
- Update Snapweb separately from official Snapweb release package/zip.
- Diff old vs new Snapweb files.
- Reapply only known custom assets/files from overlay.
- Restart services and verify UI behavior.
- Keep a "custom overlay" directory under version control.

## Phase 4 - Follow Me Audio

### Minimum viable approach (your existing AP syslog path)
- Parse AP association/disassociation log events from `192.168.4.206`.
- Map phone MAC -> room/AP.
- Add confidence and hold timers to avoid room flapping.
- Drive Snapcast control API to switch active client/group output.
- Add Snapweb toggle to enable/disable Follow Me.

### Why AP-log approach can be weak
- Roaming decisions are client-driven and can lag.
- Station may stay attached to previous AP while user already moved.
- RSSI in syslog is often sparse and noisy for room-level precision.

### Better follow-up option (BLE presence, recommended later)
- Place one low-cost BLE scanner per room (ESP32 or Pi Zero W).
- Track phone beacon RSSI at multiple points.
- Use smoothing + hysteresis to infer active room.
- Benefits:
  - faster room transitions,
  - better room resolution than AP association events.

### BLE migration plan (later)
1. Deploy scanners in 2 key rooms first.
2. Collect data for 3-7 days.
3. Tune thresholds/hysteresis.
4. Switch Follow Me source from AP syslog to BLE engine.

## Technical Decisions To Lock
- Servo PWM stack: `pigpio` daemon + `gpiozero` (`PiGPIOFactory`).
- Default GPIO pin for servo signal: GPIO18 (hardware-PWM capable).
- Event trigger strategy:
  - initial: manual trigger + optional on-boot press,
  - later: trigger on first playback after idle period.
- Follow Me hold time recommendation: 20-45 seconds before switching room.

## Verification Checklist
- Servo press/release repeatable for 50 cycles with no jams.
- Amp turns on reliably from script action.
- Snapcast upgrade keeps all custom Snapweb changes.
- Follow Me toggle appears and controls automation state.
- Room-switching does not flap during hallway movement.

## Risks and Mitigations
- Servo jitter/noise: use external power and proper PWM backend.
- Button overtravel: mechanically limit horn angle; start with conservative angles.
- False room switches: apply confidence score and minimum dwell time.
- Upgrade regressions: keep dated backups and a one-command rollback path.

## Next Work Items
1. Run servo calibration script and measure exact safe angles.
2. Install systemd unit for controlled "press once" command.
3. Run both upgrade helpers:
   - `scripts/snapcast_upgrade_preserve_snapweb.sh`
   - `scripts/update_snapweb_release_with_overlay.sh`
   - or run wrapper: `scripts/deploy_to_pi.sh --dry-run` then `scripts/deploy_to_pi.sh`
4. Decide Follow Me prototype source:
   - AP syslog first (fastest), or
   - BLE pilot first (better long-term accuracy).
