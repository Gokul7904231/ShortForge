#!/usr/bin/env bash
# FactoryOS InstaBox Worker Host Provisioning Script
set -euo pipefail

NODE_ID="${1:-}"
if [[ -z "$NODE_ID" ]]; then
  echo "Usage: sudo $0 <box2|box3|...|box13>"
  exit 1
fi

if [[ "$NODE_ID" == "box9" ]]; then
  echo "ERROR: Node box9 is intentionally excluded from the InstaBox fleet."
  exit 1
fi

echo "=== Provisioning InstaBox Node: $NODE_ID ==="

# 1. Update OS and install FFmpeg & Python dependencies
apt-get update -y
apt-get install -y ffmpeg python3 python3-pip curl

# 2. Setup agent directory
mkdir -p /opt/instabox-agent /etc/instabox /tmp/instabox_workspace /var/log/instabox
cp agent.py requirements.txt /opt/instabox-agent/
pip3 install -r /opt/instabox-agent/requirements.txt

# 3. Configure node environment file if not present
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
  chmod 600 /etc/instabox/worker.env
  echo "Created /etc/instabox/worker.env. Update INSTABOX_WORKER_SECRET with genuine credentials."
fi

# 4. Install and enable systemd service
cp instabox-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable instabox-worker.service
echo "=== Setup complete for instabox-$NODE_ID. Run 'sudo systemctl start instabox-worker' to start. ==="
