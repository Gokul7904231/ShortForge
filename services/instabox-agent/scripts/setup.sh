#!/usr/bin/env bash
# FactoryOS InstaBox Host Provisioning & Deployment Script (Production Hardened & Idempotent)
set -euo pipefail

NODE_ID="${1:-}"
if [[ -z "$NODE_ID" ]]; then
  echo "Usage: sudo $0 <box2|box3|box4|box5|box6|box7|box8|box10|box11|box12|box13>"
  exit 1
fi

ALLOWED_NODES="box2 box3 box4 box5 box6 box7 box8 box10 box11 box12 box13"
if [[ "$NODE_ID" == "box9" ]]; then
  echo "CRITICAL ERROR: Node box9 is permanently excluded from the InstaBox fleet."
  exit 1
fi

if [[ "$NODE_ID" == "box1" ]]; then
  echo "CRITICAL ERROR: Node box1 is the control-plane controller, not a render worker."
  exit 1
fi

NODE_VALID=0
for n in $ALLOWED_NODES; do
  if [[ "$NODE_ID" == "$n" ]]; then
    NODE_VALID=1
    break
  fi
done

if [[ "$NODE_VALID" -ne 1 ]]; then
  echo "CRITICAL ERROR: Invalid node ID '$NODE_ID'. Must be one of: $ALLOWED_NODES"
  exit 1
fi

# Ensure running with root privileges
if [[ "$(id -u)" -ne 0 ]]; then
  echo "CRITICAL ERROR: This script must be executed with root privileges: sudo $0 $NODE_ID"
  exit 1
fi

echo "=== [1/5] Validating & Installing Host System Packages ==="
apt-get update -y
apt-get install -y ffmpeg libfontconfig1 python3 python3-pip python3-venv curl

echo "=== [2/5] Creating Dedicated Unprivileged Service User ==="
if ! id -u instabox >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --user-group instabox
  echo "Created dedicated system user 'instabox'."
else
  echo "System user 'instabox' already exists."
fi

echo "=== [3/5] Setting Up Agent Directory & Isolated Python Virtualenv ==="
mkdir -p /opt/instabox-agent /etc/instabox /data/shortforge/workspace /data/shortforge/logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cp "$PARENT_DIR/agent.py" /opt/instabox-agent/
cp "$PARENT_DIR/requirements.txt" /opt/instabox-agent/
cp -r "$SCRIPT_DIR" /opt/instabox-agent/scripts
if [[ -d "$PARENT_DIR/packages" ]]; then
  cp -r "$PARENT_DIR/packages" /opt/instabox-agent/
fi

if [[ ! -d /opt/instabox-agent/venv ]]; then
  python3 -m venv /opt/instabox-agent/venv
fi

/opt/instabox-agent/venv/bin/pip install --upgrade pip
/opt/instabox-agent/venv/bin/pip install -r /opt/instabox-agent/requirements.txt
if [[ -d /opt/instabox-agent/packages/factoryos-render ]]; then
  /opt/instabox-agent/venv/bin/pip install -e /opt/instabox-agent/packages/factoryos-render
fi

echo "=== [4/5] Configuring Node Environment (Idempotent Secret Preservation) ==="
if [[ ! -f /etc/instabox/worker.env ]]; then
  # Cryptographically generate random 32-byte hex secret
  GENERATED_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")

  cat <<EOF > /etc/instabox/worker.env
# FactoryOS InstaBox Production Node Configuration
# Generated automatically during provisioning - root-owned with mode 640
CONTROL_PLANE_URL=https://controlplane.shortforge.internal
INSTABOX_WORKER_SECRET=${GENERATED_SECRET}
WORKER_ID=instabox-${NODE_ID}
HEARTBEAT_INTERVAL_SECONDS=15.0
POLL_INTERVAL_SECONDS=5.0
MAX_JOB_DURATION_SECONDS=1800
WORKSPACE_BASE=/data/shortforge/workspace
MIN_DISK_AVAILABLE_MB=2048
EOF
  echo "Generated new /etc/instabox/worker.env with cryptographically unique random secret."
else
  echo "Existing /etc/instabox/worker.env detected. Preserving existing secrets without modification."
fi

# Permissions: Root owns, instabox group has read-only, others have zero access
chown root:instabox /etc/instabox/worker.env
chmod 640 /etc/instabox/worker.env

# Directory ownerships
chown -R root:instabox /opt/instabox-agent
chmod -R 750 /opt/instabox-agent
chown -R instabox:instabox /data/shortforge/workspace /data/shortforge/logs
chmod 700 /data/shortforge/workspace
chmod 750 /data/shortforge/logs

echo "=== [5/5] Installing and Enabling Systemd Service Unit ==="
cp "$PARENT_DIR/instabox-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable instabox-worker.service

echo ""
echo "====================================================================="
echo " Provisioning complete for instabox-$NODE_ID"
echo " Configuration file: /etc/instabox/worker.env (mode 0640, root:instabox)"
echo " Verify control plane secret alignment before starting the service:"
echo "   sudo grep INSTABOX_WORKER_SECRET /etc/instabox/worker.env"
echo " Commands to manage the worker:"
echo "   Start:   sudo systemctl start instabox-worker"
echo "   Status:  sudo systemctl status instabox-worker"
echo "   Logs:    sudo journalctl -u instabox-worker -f"
echo "   Stop:    sudo systemctl stop instabox-worker"
echo "====================================================================="
