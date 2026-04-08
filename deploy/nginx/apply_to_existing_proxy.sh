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

INJECT_PY="${PROJECT_ROOT}/deploy/nginx/inject_price_include.py"
INJECTED=0

# Find any nginx conf mentioning the domain (not only conf.d; not only one-line server_name).
mapfile -t DOMAIN_FILES < <(
  docker exec "${TARGET_PROXY_CONTAINER}" sh -c "grep -rIl '${DOMAIN}' /etc/nginx 2>/dev/null" \
    | grep -vF 'price-app-paths.inc' || true
)

inject_one() {
  local conf_path="$1"
  local tmp
  tmp="$(mktemp)"
  if docker cp "${TARGET_PROXY_CONTAINER}:${conf_path}" "${tmp}" 2>/dev/null; then
    if command -v python3 >/dev/null 2>&1 && [ -f "${INJECT_PY}" ]; then
      if python3 "${INJECT_PY}" "${tmp}" "${DOMAIN}" 2>/dev/null; then
        docker cp "${tmp}" "${TARGET_PROXY_CONTAINER}:${conf_path}"
        INJECTED=1
      fi
    fi
  fi
  rm -f "${tmp}"
}

if [ "${#DOMAIN_FILES[@]}" -gt 0 ] && command -v python3 >/dev/null 2>&1 && [ -f "${INJECT_PY}" ]; then
  for f in "${DOMAIN_FILES[@]}"; do
    [ -n "${f}" ] || continue
    inject_one "${f}"
  done
fi

if [ "${INJECTED}" -eq 0 ]; then
  echo "Warning: could not auto-inject include for ${DOMAIN}." >&2
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Install python3 on this machine, or add the include manually (see below)." >&2
  fi
  echo "Files mentioning the domain (pick the server block for HTTPS and edit):" >&2
  docker exec "${TARGET_PROXY_CONTAINER}" sh -c "grep -rn '${DOMAIN}' /etc/nginx 2>/dev/null" >&2 || true
  echo "" >&2
  echo "Inside that server { ... } block (same one as listen 443 ssl), add:" >&2
  echo "    include /etc/nginx/conf.d/price-app-paths.inc;" >&2
  echo "Then: docker exec ${TARGET_PROXY_CONTAINER} nginx -t && docker exec ${TARGET_PROXY_CONTAINER} nginx -s reload" >&2
fi

docker exec "${TARGET_PROXY_CONTAINER}" nginx -t
docker exec "${TARGET_PROXY_CONTAINER}" nginx -s reload

echo "Path routing applied in ${TARGET_PROXY_CONTAINER} on domain ${DOMAIN}:"
echo "  http://${DOMAIN}/price/ -> client (5002)"
echo "  http://${DOMAIN}/price-admin/ -> admin (5001)"
echo "  http://${DOMAIN}/price-api/ -> backend (5000)"
echo
echo "Verify: curl -sS https://${DOMAIN}/price-api/health  (expect JSON with ok:true)"
echo
echo "NOTE: If you rebuild/redeploy the DELIVERY app nginx container, re-run this script"
echo "      or the domain will serve the delivery app under /price/ again."
echo
echo "If your proxy handles TLS, keep using the same TLS config for ${DOMAIN}."
