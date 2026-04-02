#!/usr/bin/env python3
# MrTiptop / Robbie De Wet
"""Replace tcp DJ Controller line with ffmpeg HTTP source on DietPi (uses scripts/.env.dietpi.local)."""
from __future__ import annotations

import base64
import json
import os
import pathlib
import subprocess
import sys


def read_env(path: pathlib.Path) -> dict[str, str]:
    vals: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        vals[k] = v
    return vals


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    env_path = root / "scripts" / ".env.dietpi.local"
    conf_path = root / "docker" / "snapcast-test" / "live-pi" / "snapserver.conf"
    e = read_env(env_path)
    remote = f"{e['DIETPI_USER']}@{e['DIETPI_HOST']}"
    os.environ["SSHPASS"] = e.get("DIETPI_PASSWORD", "")

    new_line = None
    for line in conf_path.read_text().splitlines():
        if line.startswith("source = process:///usr/bin/ffmpeg?name=DJ Controller"):
            new_line = line
            break
    if not new_line:
        print("Could not find ffmpeg DJ line in live-pi/snapserver.conf", file=sys.stderr)
        return 1

    b64_payload = base64.b64encode(new_line.encode("utf-8")).decode("ascii")
    bash_script = f"""set -euo pipefail
NEW_LINE=$(printf '%s' '{b64_payload}' | base64 -d)
if ! command -v ffmpeg >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y ffmpeg
fi
cp -a /etc/snapserver.conf /etc/snapserver.conf.bak.rezon8
export NEW_LINE
python3 << 'PY'
import os, pathlib, shutil
new = os.environ["NEW_LINE"]
p = pathlib.Path("/etc/snapserver.conf")
t = p.read_text()
old = "stream = tcp://0.0.0.0:4953?name=DJ Controller"
if old not in t:
    raise SystemExit("missing tcp DJ line in /etc/snapserver.conf")
shutil.copy(p, str(p) + ".bak.rezon8")
p.write_text(t.replace(old, new, 1))
print("patched snapserver.conf")
PY
systemctl restart snapserver
sleep 6
systemctl is-active snapserver
curl -sS -m 12 -H 'Content-Type: application/json' -d '{{"id":1,"jsonrpc":"2.0","method":"Server.GetStatus"}}' http://127.0.0.1:1780/jsonrpc
echo ""
journalctl -u snapserver -n 25 --no-pager | tail -25
"""

    script_path = pathlib.Path("/tmp/rezon8_patch_dj.sh")
    script_path.write_text("#!/bin/bash\n" + bash_script)
    script_path.chmod(0o755)

    subprocess.run(
        [
            "sshpass",
            "-e",
            "scp",
            "-o",
            "StrictHostKeyChecking=accept-new",
            str(script_path),
            f"{remote}:/tmp/rezon8_patch_dj.sh",
        ],
        check=True,
    )
    r = subprocess.run(
        ["sshpass", "-e", "ssh", "-o", "StrictHostKeyChecking=accept-new", remote, "bash /tmp/rezon8_patch_dj.sh"],
        capture_output=True,
        text=True,
    )
    print(r.stdout)
    if r.stderr:
        print(r.stderr, end="")
    if r.returncode != 0:
        return r.returncode

    for line in r.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "result" not in data:
            continue
        for s in data["result"]["server"]["streams"]:
            if s.get("id") == "DJ Controller":
                print("=== DJ Controller ===")
                print("status:", s.get("status"))
                print("scheme:", s.get("uri", {}).get("scheme"))
                raw = (s.get("uri") or {}).get("raw") or ""
                print("raw:", raw[:160] + ("..." if len(raw) > 160 else ""))
        return 0
    print("No JSON-RPC result in ssh output", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
