#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-deemaalhayaprice.online}"
EMAIL="${2:-admin@deemaalhayaprice.online}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_SOURCE="${PROJECT_ROOT}/deploy/nginx/deemaalhayaprice.online.conf"
CONF_TARGET="/etc/nginx/sites-available/${DOMAIN}.conf"
ENABLED_LINK="/etc/nginx/sites-enabled/${DOMAIN}.conf"

echo "[1/7] Ensure dependencies are installed"
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo "[2/7] Ensure app containers are running"
cd "${PROJECT_ROOT}"
docker compose up -d --build

echo "[3/7] Install domain config only (no global changes)"
sudo cp "${CONF_SOURCE}" "${CONF_TARGET}"
sudo sed -i "s/server_name deemaalhayaprice.online;/server_name ${DOMAIN} www.${DOMAIN};/g" "${CONF_TARGET}"
sudo ln -sf "${CONF_TARGET}" "${ENABLED_LINK}"

echo "[4/7] Validate nginx config"
sudo nginx -t

echo "[5/7] Reload nginx"
sudo systemctl restart nginx

echo "[6/7] Issue/renew TLS certificate for this domain only"
sudo certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect || true

echo "[7/7] Final checks"
sudo nginx -t
sudo systemctl reload nginx
echo "Done. Check:"
echo "  https://${DOMAIN}/"
echo "  https://${DOMAIN}/admin"
echo "  https://${DOMAIN}/api/health"
