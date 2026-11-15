#!/usr/bin/env bash
# FactoryOS InstaBox Worker Host Provisioning Script (Idempotent & Hardened)
set -euo pipefail

NODE_ID="${1:-}"
if [[ -z "$NODE_ID" ]]; then
  echo "Usage: sudo $0 <box2|box3|...|box13>"
  exit 1
fi

if [[ "$NODE_ID" == "box9" ]]; then
  echo "ERROR: Node box9 is permanently excluded from the InstaBox fleet."
  exit 1
fi

# Ensure running as root
if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: This script must be executed with root privileges: sudo $0 $NODE_ID"
  exit 1
fi

echo "=== [1/5] Validating & Installing Host System Packages ==="
apt-get update -y
apt-get install -y ffmpeg python3 python3-pip python3-venv curl

echo "=== [2/5] Creating Dedicated Unprivileged Service User ==="
if ! id -u instabox >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --user-group instabox
  echo "Created service user 'instabox' (unprivileged)."
else
  echo "Service user 'instabox' already exists."
fi

echo "=== [3/5] Setting Up Agent Directory & Isolated Python Virtualenv ==="
mkdir -p /opt/instabox-agent /etc/instabox /tmp/instabox_workspace /var/log/instabox

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cp "$PARENT_DIR/agent.py" /opt/instabox-agent/
cp "$PARENT_DIR/requirements.txt" /opt/instabox-agent/
cp -r "$SCRIPT_DIR" /opt/instabox-agent/scripts

if [[ ! -d /opt/instabox-agent/venv ]]; then
  python3 -m venv /opt/instabox-agent/venv
fi

/opt/instabox-agent/venv/bin/pip install --upgrade pip
/opt/instabox-agent/venv/bin/pip install -r /opt/instabox-agent/requirements.txt

echo "=== [4/5] Configuring Node Environment (Idempotent Secret Preservation) ==="
if [[ ! -f /etc/instabox/worker.env ]]; then
  cat <<EOF > /etc/instabox/worker.env
CONTROL_PLANE_URL=https://controlplane.shortforge.internal
INSTABOX_WORKER_SECRET=changeme_in_production
WORKER_ID=instabox-${NODE_ID}
HEARTBEAT_INTERVAL_SECONDS=15.0
POLL_INTERVAL_SECONDS=5.0
MAX_JOB_DURATION_SECONDS=1800
WORKSPACE_BASE=/tmp/instabox_workspace
EOF
  echo "Created new /etc/instabox/worker.env with template values."
else
  echo "Existing /etc/instabox/worker.env detected. Preserving existing secrets without modification."
fi

# Permissions: Root owns, instabox group has read-only, others have zero access
chown root:instabox /etc/instabox/worker.env
chmod 640 /etc/instabox/worker.env

# Directory ownerships
chown -R root:instabox /opt/instabox-agent
chmod -R 750 /opt/instabox-agent
chown -R instabox:instabox /tmp/instabox_workspace /var/log/instabox
chmod 700 /tmp/instabox_workspace

echo "=== [5/5] Installing and Enabling Systemd Service Unit ==="
cp "$PARENT_DIR/instabox-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable instabox-worker.service

echo ""
echo "====================================================================="
echo " Provisioning complete for instabox-$NODE_ID"
echo " 1. Configure production secret in /etc/instabox/worker.env"
echo " 2. Start worker: sudo systemctl start instabox-worker"
echo " 3. Check status: sudo systemctl status instabox-worker"
echo "====================================================================="
