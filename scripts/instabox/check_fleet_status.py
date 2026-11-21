#!/usr/bin/env python3
"""
Inspect and verify InstaBox fleet status from control plane on box1.
"""
import sys
import json
import urllib.request
from pathlib import Path

env_paths = [
    Path("/data/workspace/ShortForge/apps/web/.env.local"),
    Path(__file__).resolve().parent.parent.parent / "apps" / "web" / ".env.local",
    Path("apps/web/.env.local"),
]

admin_secret = None
for ep in env_paths:
    if ep.exists():
        for line in ep.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line.startswith("INSTABOX_CONTROL_PLANE_ADMIN_SECRET="):
                admin_secret = line.split("=", 1)[1].strip()
                break
        if admin_secret:
            break

if not admin_secret:
    print("ERROR: INSTABOX_CONTROL_PLANE_ADMIN_SECRET missing", file=sys.stderr)
    sys.exit(1)

req = urllib.request.Request(
    "http://127.0.0.1:3000/api/rendering/instabox/dispatch",
    headers={"x-instabox-secret": admin_secret},
    method="GET"
)

with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read().decode("utf-8"))

nodes = data.get("nodes", [])
print(f"Total Nodes: {len(nodes)}")
eligible_11 = ["box2", "box3", "box4", "box5", "box6", "box7", "box8", "box10", "box11", "box12", "box13"]

healthy_count = 0
for nid in eligible_11:
    match = next((n for n in nodes if n.get("nodeId") == nid), None)
    if not match:
        print(f"[{nid}] NOT REGISTERED")
        continue
    h = match.get("health", {})
    state = h.get("state")
    hb = match.get("lastHeartbeatAt")
    in_pool = match.get("eligibleInPool")
    reason = h.get("failureReason")
    if state == "HEALTHY" and in_pool:
        healthy_count += 1
        print(f"[{nid}] HEALTHY (inPool={in_pool}, lastHB={hb})")
    else:
        print(f"[{nid}] {state} (inPool={in_pool}, reason={reason}, lastHB={hb})")

box9 = next((n for n in nodes if n.get("nodeId") == "box9"), None)
print(f"[box9 - Quarantine check] Registered={box9 is not None}")

print(f"\nHEALTHY ELIGIBLE WORKERS: {healthy_count} / {len(eligible_11)}")
