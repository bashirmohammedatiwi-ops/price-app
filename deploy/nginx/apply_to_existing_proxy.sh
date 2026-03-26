#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ./deploy/nginx/apply_to_existing_proxy.sh deemaalhayaprice.online delivery-nginx

DOMAIN="${1:-deemaalhayaprice.online}"
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

CONF_PATH="/etc/nginx/conf.d/${DOMAIN}.conf"
docker cp "${TMP_CONF}" "${TARGET_PROXY_CONTAINER}:${CONF_PATH}"
rm -f "${TMP_CONF}"

docker exec "${TARGET_PROXY_CONTAINER}" nginx -t
docker exec "${TARGET_PROXY_CONTAINER}" nginx -s reload

echo "Domain routing applied in ${TARGET_PROXY_CONTAINER}:"
echo "  http://${DOMAIN}/ -> client (5002)"
echo "  http://${DOMAIN}/admin -> admin (5001)"
echo "  http://${DOMAIN}/api -> backend (5000)"
echo
echo "If your proxy handles TLS, run certbot/SSL on that proxy for ${DOMAIN}."
