#!/usr/bin/env bash
# ==============================================================================
# FactoryOS — Next.js Control Plane Setup Script for self-hosted Linux
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/factoryos/apps/web"
SERVICE_NAME="factoryos-control-plane.service"

echo "============================================================"
echo " [FactoryOS] Setting up Next.js Control Plane on a self-hosted Linux host   "
echo "============================================================"

# 1. Verify Node.js runtime
if ! command -v node &> /dev/null; then
    echo "[+] Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node --version
npm --version

# 2. Build apps/web application
echo "[+] Installing dependencies and building apps/web Next.js bundle..."
cd "$APP_DIR"
npm ci --production=false
npm run build

# 3. Register and start systemd service
echo "[+] Registering systemd service: $SERVICE_NAME..."
cp "$SCRIPT_DIR/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 3

# 4. Probe routes
echo "[+] Probing local callback and claim routes on 127.0.0.1:3000..."
curl -s -i http://127.0.0.1:3000/api/rendering/callback || true
echo ""
curl -s -i http://127.0.0.1:3000/api/rendering/claim || true
echo ""

echo "============================================================"
echo " [FactoryOS] Control Plane Service Status:                  "
echo "============================================================"
systemctl status "$SERVICE_NAME" --no-pager || true
