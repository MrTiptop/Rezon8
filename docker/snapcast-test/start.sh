#!/usr/bin/env sh
# Robbie De Wet
set -eu

for fifo in /tmp/snapfifo /tmp/airplay_fifo /tmp/librespot_fifo /tmp/dummy_fifo; do
  if [ ! -p "${fifo}" ]; then
    mkfifo "${fifo}"
  fi
done

# Keep the dummy stream active with silent PCM payload.
(
  while true; do
    dd if=/dev/zero bs=1920 count=250 2>/dev/null
  done > /tmp/dummy_fifo
) &

echo "Snapserver starting with custom Snapweb..."
/usr/bin/snapserver -c /etc/snapserver.conf --logging.sink=stdout &
SERVER_PID=$!

# Auto-select Dummy Source once the first group/client appears.
(
  for _ in $(seq 1 45); do
    sleep 1
    STATUS_JSON="$(curl -sS -H "Content-Type: application/json" -d '{"id":1,"jsonrpc":"2.0","method":"Server.GetStatus"}' http://127.0.0.1:1780/jsonrpc || true)"
    GROUP_ID="$(printf '%s' "${STATUS_JSON}" | jq -r '.result.server.groups[0].id // empty' 2>/dev/null || true)"
    if [ -n "${GROUP_ID}" ]; then
      curl -sS -H "Content-Type: application/json" \
        -d "{\"id\":2,\"jsonrpc\":\"2.0\",\"method\":\"Group.SetStream\",\"params\":{\"id\":\"${GROUP_ID}\",\"stream_id\":\"Dummy Source\"}}" \
        http://127.0.0.1:1780/jsonrpc >/dev/null || true
      echo "Auto-switched initial group to Dummy Source."
      break
    fi
  done
) &

wait "${SERVER_PID}"
