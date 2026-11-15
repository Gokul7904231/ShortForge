# InstaBox Fleet Node Agent — Operations & Runbook

## Overview
The InstaBox Node Agent is a lightweight, pull-based rendering daemon running on 11 dedicated nodes:
- **Controller:** `box1` (hosts FactoryOS Control Plane)
- **Workers:** `box2`, `box3`, `box4`, `box5`, `box6`, `box7`, `box8`, `box10`, `box11`, `box12`, `box13`
- *`box9` is permanently decommissioned and excluded.*

Each node is equipped with ~4 vCPU, 7.8 GiB RAM, and 20 GB disk (CPU-only render workload).

---

## 1. Fleet Provisioning

### Quick Setup on a Worker Node
Run on the target node (e.g., `box2`):
```bash
sudo ./scripts/setup.sh box2
```

Configure `/etc/instabox/worker.env`:
```ini
CONTROL_PLANE_URL=https://controlplane.shortforge.internal
INSTABOX_WORKER_SECRET=<shared-secret-from-vault>
WORKER_ID=instabox-box2
HEARTBEAT_INTERVAL_SECONDS=15.0
POLL_INTERVAL_SECONDS=5.0
MAX_JOB_DURATION_SECONDS=1800
WORKSPACE_BASE=/tmp/instabox_workspace
```

Start the service:
```bash
sudo systemctl start instabox-worker
sudo systemctl status instabox-worker
```

---

## 2. Secure Credential Rotation Procedure

1. **Generate New Secret:**
   ```bash
   openssl rand -hex 32
   ```
2. **Update Control Plane:**
   Set `INSTABOX_WORKER_SECRET=<new-secret>` in the control plane environment and deploy/restart `box1`.
3. **Update Worker Nodes:**
   Update `/etc/instabox/worker.env` across `box2`–`box8` and `box10`–`box13`:
   ```bash
   sudo sed -i 's/^INSTABOX_WORKER_SECRET=.*/INSTABOX_WORKER_SECRET=<new-secret>/' /etc/instabox/worker.env
   sudo systemctl restart instabox-worker
   ```
4. **Verify Health:**
   Verify all workers report `HEALTHY` in `ComputePool.snapshot()`.

---

## 3. Graceful Draining & Node Maintenance

When taking a node down for maintenance or sandbox restart (e.g., the 8-hour provider cap):
1. Send `SIGTERM` to the daemon:
   ```bash
   sudo systemctl stop instabox-worker
   ```
2. The agent automatically transitions its status to `DRAINING` in the heartbeat, completes any active render job, cleans the temporary workspace, and shuts down cleanly.
3. `ComputeRouter` immediately stops routing new jobs to the draining node.

---

## 4. Operational Troubleshooting

| Symptom | Cause | Remediation |
|---|---|---|
| Node shows `BLOCKED` in ComputePool | Missing initial heartbeat or secret mismatch | Check `/etc/instabox/worker.env` credentials and network route to `CONTROL_PLANE_URL`. |
| Node shows `DEGRADED` | Heartbeat latency exceeded 45s or 3 consecutive failures | Check CPU load on worker node; verify FFmpeg process did not hang. |
| Job fails with `F06_PHYSICAL_ARTIFACT_REJECTED` | FFmpeg output failed container, codec, or geometry checks | Run `ffprobe` on output MP4. Ensure 1080x1920 9:16 geometry and H.264/AAC codecs. |
| Job fails with `SHA-256 mismatch` | Network corruption during artifact stream | Check connection stability between node and control plane. |
| `box9` refused | `box9` is intentionally excluded | Do not provision `box9`. Route workloads only to `box2`–`box8` and `box10`–`box13`. |
