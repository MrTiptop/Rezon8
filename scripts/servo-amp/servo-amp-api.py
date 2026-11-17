#!/usr/bin/env python3
# MrTiptop / Robbie De Wet
"""HTTP trigger for the amplifier servo: POST /press runs one press (rest -> press -> rest).

Lets snapweb (port 1780) fire the servo with fetch(); CORS is open because the
page and this service sit on different ports of the same Pi. LAN use only.
"""

import http.server
import subprocess
import threading

PORT = 8099
PI_SERVO = "/usr/local/bin/pi-servo.py"
busy = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, code):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_OPTIONS(self):
        self.reply(204)

    def do_POST(self):
        if self.path != "/press":
            return self.reply(404)
        # A second tap while the arm is still moving would only queue another swing.
        if not busy.acquire(blocking=False):
            return self.reply(409)
        try:
            ok = subprocess.run([PI_SERVO, "press"], timeout=10).returncode == 0
        except subprocess.TimeoutExpired:
            ok = False
        finally:
            busy.release()
        self.reply(200 if ok else 500)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
