# Snapcast Docker Testbed

Use this to test the redesigned Snapweb GUI locally without touching your Raspberry Pi setup.

## What it provides
- Builds `snapserver` from this repo.
- Serves redesigned Snapweb UI from `docker/snapcast-test/snapweb/`.
- Exposes default Snapcast ports:
  - `1704` (audio streaming)
  - `1705` (TCP control)
  - `1780` (HTTP JSON-RPC + web UI)

## Start
```bash
docker compose -f docker-compose.snapcast-test.yml up --build
```

Open:
- `http://localhost:1780`

## Stop
```bash
docker compose -f docker-compose.snapcast-test.yml down
```

## Notes
- Follow Me defaults to browser-local state.
- To bind the toggle to a real backend service, set `config.followMeApi.statusUrl` and `config.followMeApi.toggleUrl` in `docker/snapcast-test/snapweb/config.js`.
- The provided `scripts/follow_me_ap_syslog.py` includes a lightweight control API (`/follow-me`) that can be used for this integration.
