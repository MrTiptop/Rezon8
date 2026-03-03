#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import socket
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


class FollowMeState:
    def __init__(self, state_file: Path) -> None:
        self._state_file = state_file
        self._lock = threading.Lock()
        self._current_room: str | None = None
        self._switched_at = 0.0
        self._state_file.parent.mkdir(parents=True, exist_ok=True)

    @property
    def state_file(self) -> Path:
        return self._state_file

    def enabled(self) -> bool:
        if not self._state_file.exists():
            return True
        content = self._state_file.read_text(encoding="utf-8").strip().lower()
        return content in {"1", "true", "on", "enabled", "yes"}

    def set_enabled(self, enabled: bool) -> None:
        self._state_file.write_text("1\n" if enabled else "0\n", encoding="utf-8")

    def get_current_room(self) -> str | None:
        with self._lock:
            return self._current_room

    def can_switch(self, room: str, hold_seconds: int) -> bool:
        with self._lock:
            if room == self._current_room:
                return False
            return (time.time() - self._switched_at) >= hold_seconds

    def mark_switched(self, room: str) -> None:
        with self._lock:
            self._current_room = room
            self._switched_at = time.time()


def load_config(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)
    required = ["snapserver_url", "room_clients", "managed_clients", "phone_patterns", "room_matchers"]
    for key in required:
        if key not in config:
            raise ValueError(f"Missing config key: {key}")
    return config


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


def make_control_handler(state: FollowMeState) -> type[BaseHTTPRequestHandler]:
    class ControlHandler(BaseHTTPRequestHandler):
        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self._send_json(200, {"ok": True})

        def do_GET(self) -> None:
            if self.path not in {"/follow-me", "/health"}:
                self._send_json(404, {"ok": False, "error": "not_found"})
                return
            if self.path == "/health":
                self._send_json(200, {"ok": True})
                return
            self._send_json(
                200,
                {
                    "ok": True,
                    "enabled": state.enabled(),
                    "active_room": state.get_current_room(),
                },
            )

        def do_POST(self) -> None:
            if self.path != "/follow-me":
                self._send_json(404, {"ok": False, "error": "not_found"})
                return
            try:
                raw_len = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(raw_len) if raw_len > 0 else b"{}"
                body = json.loads(raw_body.decode("utf-8"))
                enabled = body["enabled"]
                if not isinstance(enabled, bool):
                    raise ValueError("enabled must be a boolean")
            except (ValueError, KeyError, json.JSONDecodeError) as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
                return
            state.set_enabled(enabled)
            self._send_json(
                200,
                {
                    "ok": True,
                    "enabled": state.enabled(),
                    "active_room": state.get_current_room(),
                },
            )

        def log_message(self, format: str, *args: Any) -> None:
            print(f"[control-api] {self.address_string()} - {format % args}")

    return ControlHandler


def start_control_api(host: str, port: int, state: FollowMeState) -> ThreadingHTTPServer:
    handler = make_control_handler(state)
    server = ThreadingHTTPServer((host, port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="Follow-me prototype from AP syslog lines")
    parser.add_argument("--config", required=True, help="Path to JSON config")
    parser.add_argument("--listen-host", default="0.0.0.0", help="UDP syslog listen address")
    parser.add_argument("--listen-port", type=int, default=5514, help="UDP syslog listen port")
    parser.add_argument("--state-file", default="/var/lib/snapcast-follow-me/enabled", help="Follow-me state flag file")
    parser.add_argument("--rpc-timeout", type=float, default=2.0, help="Snapserver JSON-RPC timeout")
    parser.add_argument("--control-host", default="127.0.0.1", help="HTTP control API listen address")
    parser.add_argument("--control-port", type=int, default=8765, help="HTTP control API listen port")
    parser.add_argument("--disable-control-api", action="store_true", help="Disable the HTTP control API")
    parser.add_argument("--dry-run", action="store_true", help="Log actions without calling Snapserver API")
    args = parser.parse_args()

    config = load_config(args.config)
    hold_seconds = int(config.get("hold_seconds", 30))
    default_volume_percent = int(config.get("default_volume_percent", 65))
    room_clients = dict(config["room_clients"])
    managed_clients = list(config["managed_clients"])
    phone_patterns = list(config["phone_patterns"])
    matchers = build_matchers(config)
    state = FollowMeState(Path(args.state_file))

    if not args.disable_control_api:
        start_control_api(args.control_host, args.control_port, state)
        print(f"Control API listening on http://{args.control_host}:{args.control_port}/follow-me")

    rpc = SnapcastRpc(url=config["snapserver_url"], timeout=args.rpc_timeout)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((args.listen_host, args.listen_port))
    print(f"Listening for syslog on {args.listen_host}:{args.listen_port}")

    while True:
        data, addr = sock.recvfrom(65535)
        message = data.decode("utf-8", errors="replace").strip()
        room = extract_room(message, phone_patterns, matchers)
        if not room:
            continue
        if not state.enabled():
            continue
        if not state.can_switch(room, hold_seconds):
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
        state.mark_switched(room)


if __name__ == "__main__":
    raise SystemExit(main())
