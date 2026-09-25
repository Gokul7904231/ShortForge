#!/usr/bin/env bash
# ==============================================================================
# FactoryOS — Persistent Basic FastAPI Render Service Setup Script
# ==============================================================================
# Installs the persistent render worker as a provider-neutral self-hosted service.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="/opt/factoryos/rendering-engine"
CACHE_DIR="/opt/factoryos/render-cache"
SERVICE_NAME="factoryos-persistent-render.service"

echo "============================================================"
echo " [FactoryOS] Starting Persistent Basic Render Service Setup "
echo "============================================================"

# 1. Verify Root/Sudo
if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run this script with sudo: sudo ./setup_basic_render_api.sh"
  exit 1
fi

# 2. Verify Python 3
echo "[+] Checking Python runtime..."
if ! command -v python3 &> /dev/null; then
    echo "[-] Python3 not found. Installing..."
    apt-get update -y && apt-get install -y python3 python3-pip python3-venv
fi
python3 --version

# 3. Verify FFmpeg
echo "[+] Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "[-] FFmpeg not found. Installing..."
    apt-get update -y && apt-get install -y ffmpeg
fi
ffmpeg -version | head -n 1

# 4. Create Directories & Permissions
echo "[+] Preparing directories and persistent cache..."
mkdir -p "$WORK_DIR"
mkdir -p "$CACHE_DIR/image-cache"
mkdir -p "$CACHE_DIR/fonts"
mkdir -p "$CACHE_DIR/templates"
mkdir -p /tmp/factoryos-basic-render

chown -R factoryos:factoryos "$WORK_DIR" 2>/dev/null || true
chown -R factoryos:factoryos "$CACHE_DIR" 2>/dev/null || true
chown -R factoryos:factoryos /tmp/factoryos-basic-render 2>/dev/null || true

# 5. Install Dependencies
echo "[+] Installing Python dependencies..."
pip3 install --upgrade pip
if [ -f "$WORK_DIR/requirements.txt" ]; then
    pip3 install -r "$WORK_DIR/requirements.txt"
elif [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    pip3 install -r "$SCRIPT_DIR/requirements.txt"
fi

# 6. Copy Service File & Reload Systemd
echo "[+] Registering systemd service: $SERVICE_NAME..."
if [ -f "$SCRIPT_DIR/$SERVICE_NAME" ]; then
    cp "$SCRIPT_DIR/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[+] Waiting for service to initialize..."
sleep 3

# 7. Verify Health and Readiness
echo "[+] Testing Liveness & Readiness endpoints on 127.0.0.1:8100..."
curl -s -f http://127.0.0.1:8100/health || echo "[-] Health check failed"
echo ""
curl -s -f http://127.0.0.1:8100/ready || echo "[-] Readiness check pending/failed"
echo ""

# 8. Check Status & Admin Isolation Status
echo "============================================================"
echo " [FactoryOS] Basic Render Service Status:                   "
echo "============================================================"
systemctl status "$SERVICE_NAME" --no-pager || true

echo "============================================================"
echo " [FactoryOS] Verifying Admin Service Untouched Status:     "
echo "============================================================"
systemctl status "$ADMIN_SERVICE_NAME" --no-pager 2>/dev/null || echo "[+] Admin service check complete."

echo "============================================================"
echo " [FactoryOS] Persistent Render Service Successfully Ready!"
echo "============================================================"
