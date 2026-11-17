<!-- MrTiptop -->
# Snapcast Docker Testbed

Local Snapweb + snapserver with **pinned** `librespot` and `shairport-sync` built from
[`stream-sources.versions.json`](stream-sources.versions.json).

## What it provides
- Builds `snapserver`/`snapclient` from Debian packages into a runtime image
- Builds and installs `librespot` + `shairport-sync` (stdout) at the pinned tags
- Serves redesigned Snapweb UI from `docker/snapcast-test/snapweb/`
- Ports: `1704` (audio), `1705` (TCP control), `1780` (HTTP JSON-RPC + web UI)

## Start
```bash
export LIBRESPOT_VERSION=$(python3 -c "import json;print(json.load(open('docker/snapcast-test/stream-sources.versions.json'))['librespot'])")
export SHAIRPORT_SYNC_VERSION=$(python3 -c "import json;print(json.load(open('docker/snapcast-test/stream-sources.versions.json'))['shairport-sync'])")
docker compose -f docker-compose.snapcast-test.yml up --build -d
```

Open `http://localhost:1780`

## Stop
```bash
docker compose -f docker-compose.snapcast-test.yml down
```

## Keeping versions current
- Weekly workflow: `.github/workflows/update-stream-sources.yml` (Mondays + manual)
- Local refresh: `python3 scripts/update_stream_sources_versions.py`
- DietPi host upgrade: `./scripts/upgrade_dietpi_stream_sources.sh --restart`
- Local/host install: `sudo ./scripts/install_stream_sources.sh`
