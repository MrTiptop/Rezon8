# Follow Me Audio - BLE Design Notes

## Owner
- Robbie De Wet

## Why BLE for room-level presence
- Wi-Fi association logs are useful for coarse location but often too slow for room transitions.
- BLE scans provide stronger room-level signal gradients when one scanner is installed per room.
- You can combine BLE confidence with hold timers to avoid rapid audio switching.

## Minimal Hardware Options

### Option A (recommended): ESP32 scanner per room
- 1x ESP32 node in each key room.
- Firmware scans for your phone's BLE identifier and reports RSSI to a central service.
- Pros: low cost, low power, simple placement.
- Cons: needs initial firmware setup.

### Option B: Raspberry Pi Zero W scanner per room
- Runs Linux + scanner service.
- Pros: flexible software stack.
- Cons: higher power use and cost.

## Phone Tracking Identifier
- Best: use a dedicated BLE beacon app/profile if your phone supports stable advertising.
- Fallback: rotating phone MAC/privacy randomization can reduce reliability.
- Mitigation:
  - use app-based beacon UUID,
  - identify by service UUID + manufacturer data,
  - track known device set with confidence scoring.

## Data Pipeline
1. Room scanners publish observations:
   - `device_id`, `room_id`, `rssi`, `timestamp`
2. Aggregator computes confidence per room:
   - smoothing window (5-10s)
   - hysteresis threshold (for example 6-10 dB equivalent)
3. Follow Me decision engine selects target room.
4. Snapcast controller maps room -> client/group and switches output.
5. UI toggle in Snapweb enables/disables Follow Me automation.

## Suggested Decision Logic
- Only switch rooms when:
  - candidate room confidence is above current room confidence by threshold,
  - minimum dwell time elapsed (20-45 seconds),
  - optional cooldown since last switch elapsed (15-30 seconds).
- Never switch while no strong room confidence exists.

## Integration with Snapcast
- Use JSON-RPC control endpoint of Snapserver.
- Maintain a map:
  - `room_id` -> `snapclient_id` or target group
- On switch:
  - optionally fade current room down,
  - unmute target room and set volume profile,
  - keep stream synchronized via Snapcast grouping.

## Reliability Expectations
- With 1 scanner per room and proper placement:
  - good room discrimination in most homes,
  - occasional boundary ambiguity near doorways/hallways.
- Improve by:
  - placing scanners away from metal/AV cabinets,
  - avoiding hidden enclosures,
  - adding one extra scanner in overlap zones.

## Security and Privacy Notes
- Keep scanner traffic on local network only.
- Avoid storing raw long-term traces unless needed.
- Log only what is needed for debugging and confidence tuning.

## Phase Plan
1. Start with your AP syslog method as prototype (fastest to launch).
2. In parallel, deploy BLE in 2 rooms for comparison.
3. Compare transition latency and false-switch rate for 1 week.
4. Promote BLE to primary input if it performs better.

## Prototype assets in this repo
- `scripts/follow_me_ap_syslog.py`
  - Listens on UDP `5514` for syslog messages.
  - Detects room transitions using configurable regex matchers.
  - Applies hold timer before room changes.
  - Calls Snapserver JSON-RPC `Client.SetVolume` to mute/unmute target room clients.
- `scripts/install_follow_me_service.sh`
  - Installs the script to `/usr/local/bin`.
  - Creates `/etc/snapcast-follow-me/config.json` template.
  - Installs and enables `snapcast-follow-me.service`.
  - Uses `/var/lib/snapcast-follow-me/enabled` as Follow Me on/off flag.
