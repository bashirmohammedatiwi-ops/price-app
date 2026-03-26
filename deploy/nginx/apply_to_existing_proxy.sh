#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ./deploy/nginx/apply_to_existing_proxy.sh demaalhayaadelivery.online delivery-nginx

DOMAIN="${1:-demaalhayaadelivery.online}"
TARGET_PROXY_CONTAINER="${2:-delivery-nginx}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${PROJECT_ROOT}/deploy/nginx/proxy-domain.conf.template"
TMP_CONF="$(mktemp)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fxq "${TARGET_PROXY_CONTAINER}"; then
  echo "Proxy container '${TARGET_PROXY_CONTAINER}' is not running." >&2
  echo "Pass target container name as 2nd arg." >&2
  exit 1
fi

HOST_GATEWAY="host.docker.internal"
if ! docker exec "${TARGET_PROXY_CONTAINER}" getent hosts "${HOST_GATEWAY}" >/dev/null 2>&1; then
  # Fallback for Linux when host.docker.internal is unavailable
  HOST_GATEWAY="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
  HOST_GATEWAY="${HOST_GATEWAY:-172.17.0.1}"
fi

sed \
  -e "s/__DOMAIN__/${DOMAIN}/g" \
  -e "s/__HOST_GATEWAY__/${HOST_GATEWAY}/g" \
  "${TEMPLATE}" > "${TMP_CONF}"

CONF_PATH="/etc/nginx/conf.d/price-app-paths.inc"
docker cp "${TMP_CONF}" "${TARGET_PROXY_CONTAINER}:${CONF_PATH}"
rm -f "${TMP_CONF}"

# Try to auto-inject include into the domain server block.
TARGET_CONF_IN_CONTAINER="$(docker exec "${TARGET_PROXY_CONTAINER}" sh -lc "grep -Rnl \"server_name .*${DOMAIN}\" /etc/nginx/conf.d 2>/dev/null | head -n 1" || true)"
if [ -n "${TARGET_CONF_IN_CONTAINER}" ]; then
  docker exec "${TARGET_PROXY_CONTAINER}" sh -lc "grep -q 'include /etc/nginx/conf.d/price-app-paths.inc;' '${TARGET_CONF_IN_CONTAINER}' || sed -i '/server_name .*${DOMAIN}/a\\    include /etc/nginx/conf.d/price-app-paths.inc;' '${TARGET_CONF_IN_CONTAINER}'"
else
  echo "Warning: couldn't auto-detect server block for ${DOMAIN}."
  echo "Please add this line manually inside the domain server block:"
  echo "    include /etc/nginx/conf.d/price-app-paths.inc;"
fi

docker exec "${TARGET_PROXY_CONTAINER}" nginx -t
docker exec "${TARGET_PROXY_CONTAINER}" nginx -s reload

echo "Path routing applied in ${TARGET_PROXY_CONTAINER} on domain ${DOMAIN}:"
echo "  http://${DOMAIN}/price/ -> client (5002)"
echo "  http://${DOMAIN}/price-admin/ -> admin (5001)"
echo "  http://${DOMAIN}/price-api/ -> backend (5000)"
echo
echo "If your proxy handles TLS, keep using the same TLS config for ${DOMAIN}."
