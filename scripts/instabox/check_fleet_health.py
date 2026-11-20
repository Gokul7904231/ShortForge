import os
import sys
import json
import urllib.request

FLEET_SECRET = os.environ.get("INSTABOX_CONTROL_PLANE_ADMIN_SECRET") or os.environ.get("INSTABOX_FLEET_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY")
if not FLEET_SECRET:
    print("ERROR: INSTABOX_FLEET_SECRET environment variable is required to query fleet health.", file=sys.stderr)
    sys.exit(1)

CONTROL_PLANE_URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")
req = urllib.request.Request(CONTROL_PLANE_URL, headers={"x-instabox-secret": FLEET_SECRET})

try:
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode())
        print("Status:", data.get("status"))
        for n in data.get("nodes", []):
            h = n.get("health", {})
            print(f"{n['nodeId']}: state={h.get('state')}, eligible={n.get('eligibleInPool')}, isDraining={n.get('isDraining')}, lastHeartbeat={n.get('lastHeartbeatAt')}, failReason={h.get('failureReason')}")
except Exception as e:
    print("Error querying fleet health:", e, file=sys.stderr)
    sys.exit(1)
