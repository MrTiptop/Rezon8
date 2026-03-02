#!/usr/bin/env python3
# Robbie De Wet

from __future__ import annotations

import argparse
import json
import re
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Matcher:
    room: str
    pattern: re.Pattern[str]


class SnapcastRpc:
    def __init__(self, url: str, timeout: float) -> None:
        self.url = url
        self.timeout = timeout
        self._rpc_id = 0

    def call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._rpc_id += 1
        payload = {"id": self._rpc_id, "jsonrpc": "2.0", "method": method, "params": params}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise RuntimeError(f"RPC request failed: {exc}") from exc
        if "error" in body:
            raise RuntimeError(f"RPC error for {method}: {body['error']}")
        return body


def load_config(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)
    required = ["snapserver_url", "room_clients", "managed_clients", "phone_patterns", "room_matchers"]
    for key in required:
        if key not in config:
            raise ValueError(f"Missing config key: {key}")
    return config


def enabled(state_file: Path) -> bool:
    if not state_file.exists():
        return True
    content = state_file.read_text(encoding="utf-8").strip().lower()
    return content in {"1", "true", "on", "enabled", "yes"}


def build_matchers(config: dict[str, Any]) -> list[Matcher]:
    out: list[Matcher] = []
    for item in config["room_matchers"]:
        out.append(Matcher(room=item["room"], pattern=re.compile(item["regex"], re.IGNORECASE)))
    return out


def extract_room(message: str, phone_patterns: list[str], matchers: list[Matcher]) -> str | None:
    lowered = message.lower()
    if not any(p.lower() in lowered for p in phone_patterns):
        return None
    for matcher in matchers:
        if matcher.pattern.search(message):
            return matcher.room
    return None


def set_active_room(
    rpc: SnapcastRpc,
    managed_clients: list[str],
    room_clients: dict[str, str],
    room: str,
    default_volume_percent: int,
    dry_run: bool,
) -> None:
    target = room_clients.get(room)
    if not target:
        raise RuntimeError(f"No target client configured for room '{room}'")

    for client_id in managed_clients:
        muted = client_id != target
        params = {"id": client_id, "volume": {"percent": default_volume_percent, "muted": muted}}
        if dry_run:
            print(f"[dry-run] Client.SetVolume {params}")
        else:
            rpc.call("Client.SetVolume", params)


def main() -> int:
    parser = argparse.ArgumentParser(description="Follow-me prototype from AP syslog lines")
    parser.add_argument("--config", required=True, help="Path to JSON config")
    parser.add_argument("--listen-host", default="0.0.0.0", help="UDP syslog listen address")
    parser.add_argument("--listen-port", type=int, default=5514, help="UDP syslog listen port")
    parser.add_argument("--state-file", default="/var/lib/snapcast-follow-me/enabled", help="Follow-me state flag file")
    parser.add_argument("--rpc-timeout", type=float, default=2.0, help="Snapserver JSON-RPC timeout")
    parser.add_argument("--dry-run", action="store_true", help="Log actions without calling Snapserver API")
    args = parser.parse_args()

    config = load_config(args.config)
    hold_seconds = int(config.get("hold_seconds", 30))
    default_volume_percent = int(config.get("default_volume_percent", 65))
    room_clients = dict(config["room_clients"])
    managed_clients = list(config["managed_clients"])
    phone_patterns = list(config["phone_patterns"])
    matchers = build_matchers(config)
    state_file = Path(args.state_file)
    state_file.parent.mkdir(parents=True, exist_ok=True)

    rpc = SnapcastRpc(url=config["snapserver_url"], timeout=args.rpc_timeout)
    current_room: str | None = None
    switched_at = 0.0

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((args.listen_host, args.listen_port))
    print(f"Listening for syslog on {args.listen_host}:{args.listen_port}")

    while True:
        data, addr = sock.recvfrom(65535)
        message = data.decode("utf-8", errors="replace").strip()
        room = extract_room(message, phone_patterns, matchers)
        if not room:
            continue
        if not enabled(state_file):
            continue
        now = time.time()
        if room == current_room:
            continue
        if now - switched_at < hold_seconds:
            continue

        print(f"Switching active room to '{room}' from log source {addr[0]}")
        set_active_room(
            rpc=rpc,
            managed_clients=managed_clients,
            room_clients=room_clients,
            room=room,
            default_volume_percent=default_volume_percent,
            dry_run=args.dry_run,
        )
        current_room = room
        switched_at = now


if __name__ == "__main__":
    raise SystemExit(main())
