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
- The Follow Me toggle in this prototype is a UI-state toggle (stored in browser local storage).
- Backend integration to your `follow_me_ap_syslog.py` service can be wired in next by adding a tiny control endpoint.
