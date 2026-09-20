#!/bin/sh
set -eu

if [ -z "${TAILSCALE_AUTHKEY:-}" ]; then
  echo "[ERROR] TAILSCALE_AUTHKEY is required"
  exit 1
fi

mkdir -p /tmp/tailscale /var/run/tailscale /var/cache/tailscale /var/lib/tailscale

echo "[LOG] Starting Tailscale userspace networking"
/usr/local/bin/tailscaled \
  --tun=userspace-networking \
  --socks5-server=127.0.0.1:1055 \
  --state=/tmp/tailscale/tailscaled.state &

TAILSCALED_PID=$!
trap 'kill "$TAILSCALED_PID" 2>/dev/null || true' EXIT

echo "[LOG] Authenticating Cloud Run container with Tailscale"
until /usr/local/bin/tailscale up \
  --auth-key="${TAILSCALE_AUTHKEY}" \
  --hostname="${TAILSCALE_HOSTNAME:-loading-dock-runner}" \
  --accept-dns=false
do
  echo "[LOG] Waiting for Tailscale daemon..."
  sleep 1
done

echo "[LOG] Tailscale started"

if [ -n "${TAILSCALE_TEST_HOST:-}" ]; then
  echo "[LOG] Testing Tailscale connectivity to ${TAILSCALE_TEST_HOST}"
  /usr/local/bin/tailscale ping "${TAILSCALE_TEST_HOST}"
fi

export ALL_PROXY=socks5://127.0.0.1:1055
export all_proxy="$ALL_PROXY"

exec node runner.js
