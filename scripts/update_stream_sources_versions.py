# Robbie De Wet
#!/usr/bin/env python3
"""Refresh tracked upstream versions for stream source dependencies."""

from __future__ import annotations

import json
import pathlib
import urllib.request


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSIONS_FILE = REPO_ROOT / "docker" / "snapcast-test" / "stream-sources.versions.json"


def fetch_latest_tag(repo: str) -> str:
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "rezon8-stream-source-updater",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    tag = payload.get("tag_name", "").strip()
    if not tag:
        raise RuntimeError(f"Missing tag_name for repo '{repo}'")
    return tag


def load_existing() -> dict:
    if not VERSIONS_FILE.exists():
        return {}
    return json.loads(VERSIONS_FILE.read_text(encoding="utf-8"))


def main() -> int:
    current = load_existing()
    updated = {
        "librespot": fetch_latest_tag("librespot-org/librespot"),
        "shairport-sync": fetch_latest_tag("mikebrady/shairport-sync"),
    }

    if current == updated:
        print("No version changes detected.")
        return 0

    VERSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    VERSIONS_FILE.write_text(
        json.dumps(updated, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("Updated stream source versions:")
    for name, version in updated.items():
        print(f"  - {name}: {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
