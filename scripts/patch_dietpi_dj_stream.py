#!/usr/bin/env python3
# MrTiptop
"""Deploy DJ Controller TCP source on DietPi (scripts/.env.dietpi.local).

Source:
  DJ Controller — TCP listen 0.0.0.0:4953 (dj_live_streamer Snapcast push)

Usage:
  python3 scripts/patch_dietpi_dj_stream.py
  python3 scripts/patch_dietpi_dj_stream.py --status

Canonical conf: docker/snapcast-test/live-pi/snapserver.conf
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
import sys

TCP_LINE = (
    "source = tcp://0.0.0.0:4953?name=DJ Controller&sampleformat=48000:16:2&mode=server"
)

DJ_BLOCK = f"""# DJ Controller: TCP listen — laptop (dj_live_streamer) pushes raw S16LE @ 48000 on port 4953.
# Idle when nothing connects (no ffmpeg spawn/zombie loop).
{TCP_LINE}
"""


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", action="store_true", help="Only print DJ stream status via JSON-RPC")
    args = parser.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    env_path = root / "scripts" / ".env.dietpi.local"
    e = read_env(env_path)
    remote = f"{e['DIETPI_USER']}@{e['DIETPI_HOST']}"
    os.environ["SSHPASS"] = e.get("DIETPI_PASSWORD", "")

    ssh_base = ["sshpass", "-e", "ssh", "-o", "StrictHostKeyChecking=accept-new", remote]

    if args.status:
        r = subprocess.run(
            ssh_base
            + [
                "curl -sS -m 8 -H 'Content-Type: application/json' "
                "-d '{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"Server.GetStatus\"}' "
                "http://127.0.0.1:1780/jsonrpc"
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        print(r.stdout)
        if r.stderr:
            print(r.stderr, end="")
        return r.returncode

    b64_block = base64.b64encode(DJ_BLOCK.encode("utf-8")).decode("ascii")
    bash_script = f"""set -euo pipefail
cp -a /etc/snapserver.conf "/etc/snapserver.conf.bak.rezon8.dj.$(date +%Y%m%d%H%M%S)"
rm -f /usr/local/bin/rezon8-dj-icecast-pull.sh
BLOCK=$(printf '%s' '{b64_block}' | base64 -d)
export BLOCK
python3 << 'PY'
import os, pathlib, re
block = os.environ["BLOCK"]
if not block.endswith("\\n"):
    block += "\\n"
p = pathlib.Path("/etc/snapserver.conf")
text = p.read_text()
pat = re.compile(
    r"(?:^#.*(?:DJ Controller|Icecast|4953|rezon8-dj|zombies|one-liner|TCP listen|HTTP pull).*(?:\\n|$))*"
    r"^#?source = (?:tcp|process)://[^\\n]*name=DJ Controller(?: Legacy)?[^\\n]*\\n",
    re.M,
)
text2, n = pat.subn("", text)
anchor = re.search(r"^source = pipe:///tmp/snapfifo\\?name=Mopidy\\n", text2, re.M)
if anchor:
    i = anchor.end()
    text2 = text2[:i] + block + text2[i:]
else:
    spot = re.search(r"^source = (?:process|librespot)://[^\\n]*[Ss]potify[^\\n]*\\n", text2, re.M)
    if spot:
        text2 = text2[: spot.start()] + block + text2[spot.start() :]
    else:
        raise SystemExit("could not find insertion point for DJ source")
p.write_text(text2)
print("patched DJ Controller TCP only, removed", n, "prior DJ lines")
PY
systemctl restart snapserver
sleep 4
systemctl is-active snapserver
echo -n "zombie ffmpeg: "
ps -eo stat,comm | awk '$1 ~ /Z/ && $2=="ffmpeg" {{c++}} END{{print c+0}}'
grep -n "DJ Controller" /etc/snapserver.conf || true
ss -lnt | grep 4953 || true
curl -sS -m 12 -H 'Content-Type: application/json' -d '{{"id":1,"jsonrpc":"2.0","method":"Server.GetStatus"}}' http://127.0.0.1:1780/jsonrpc
echo ""
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
        ssh_base + ["bash /tmp/rezon8_patch_dj.sh"],
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
            sid = s.get("id") or ""
            if "DJ Controller" in sid:
                print(f"=== {sid} ===")
                print("status:", s.get("status"))
                print("scheme:", s.get("uri", {}).get("scheme"))
                raw = (s.get("uri") or {}).get("raw") or ""
                print("raw:", raw[:200] + ("..." if len(raw) > 200 else ""))
        return 0
    print("No JSON-RPC result in ssh output", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
