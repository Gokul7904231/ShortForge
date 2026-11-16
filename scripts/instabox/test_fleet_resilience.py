import os
import sys
import json
import time
import subprocess
import urllib.request

FLEET_SECRET = os.environ.get("INSTABOX_CONTROL_PLANE_ADMIN_SECRET") or os.environ.get("INSTABOX_FLEET_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY")
if not FLEET_SECRET:
    print("ERROR: INSTABOX_FLEET_SECRET environment variable is required to run resilience tests.", file=sys.stderr)
    sys.exit(1)

URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")

def call_api(payload=None, method="GET"):
    data = json.dumps(payload).encode() if payload else None
    headers = {"x-instabox-secret": FLEET_SECRET}
    if payload:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(URL, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())

print("=== STEP 2.1: Test Node Draining on box2 ===")
drain_res = call_api({"action": "drain", "targetNodeId": "box2"}, method="POST")
print("Drain Response:", drain_res)
assert drain_res.get("isDraining") == True, "Failed to set isDraining"
assert drain_res.get("health", {}).get("state") == "DRAINING", "Health state not DRAINING"

status_res = call_api()
b2 = next(n for n in status_res["nodes"] if n["nodeId"] == "box2")
print(f"box2 in fleet snapshot: isDraining={b2['isDraining']}, state={b2['health']['state']}, eligible={b2['eligibleInPool']}")
assert b2["isDraining"] == True
assert b2["eligibleInPool"] == False

print("\n=== STEP 2.2: Verify Job Rejection on Drained Node ===")
job_res = call_api({"targetNodeId": "box2", "topic": "Drained Node Job Test"}, method="POST")
print("Job Dispatch Result for Drained Node: success =", job_res.get("success"), "| error =", job_res.get("error"))
assert job_res.get("success") == False or "DRAINING" in str(job_res) or "preflight rejected" in str(job_res), "Job should not execute on draining node"

print("\n=== STEP 2.3: Test Undrain / Restore on box2 ===")
undrain_res = call_api({"action": "undrain", "targetNodeId": "box2"}, method="POST")
print("Undrain Response:", undrain_res)
assert undrain_res.get("isDraining") == False

status_res2 = call_api()
b2_restored = next(n for n in status_res2["nodes"] if n["nodeId"] == "box2")
print(f"box2 restored: isDraining={b2_restored['isDraining']}, state={b2_restored['health']['state']}, eligible={b2_restored['eligibleInPool']}")
assert b2_restored["isDraining"] == False
assert b2_restored["eligibleInPool"] == True

print("\n=== STEP 2.4: Verify Execution after Undrain on box2 ===")
job_restore_res = call_api({"targetNodeId": "box2", "topic": "Restored box2 Execution"}, method="POST")
print("Execution Result:", job_restore_res.get("success"), "| Receipt:", job_restore_res.get("receipt", {}).get("receiptId"), "| F07:", job_restore_res.get("f07Audit", {}).get("overallScore"))
assert job_restore_res.get("success") == True
assert job_restore_res.get("f07Audit", {}).get("overallScore") >= 90

print("\n=== STEP 2.5: Test Worker Daemon Restart Resilience on box4 ===")
print("Restarting instabox-worker.service on box4 via SSH...")
restart_cmd = subprocess.run(["ssh", "box4", "sudo systemctl restart instabox-worker.service"], capture_output=True, text=True)
print("Restart exit code:", restart_cmd.returncode)
print("Waiting 12s for box4 agent daemon to initialize and heartbeat...")
time.sleep(12)

status_res3 = call_api()
b4 = next(n for n in status_res3["nodes"] if n["nodeId"] == "box4")
print(f"box4 post-restart: state={b4['health']['state']}, eligible={b4['eligibleInPool']}, lastHeartbeat={b4['lastHeartbeatAt']}")
assert b4["health"]["state"] == "HEALTHY"
assert b4["eligibleInPool"] == True

print("\n=== STEP 2.6: Verify Execution on Post-Restart box4 ===")
job_b4_res = call_api({"targetNodeId": "box4", "topic": "Post-Restart box4 Execution"}, method="POST")
print("Execution Result:", job_b4_res.get("success"), "| Receipt:", job_b4_res.get("receipt", {}).get("receiptId"), "| F07:", job_b4_res.get("f07Audit", {}).get("overallScore"))
assert job_b4_res.get("success") == True
assert job_b4_res.get("f07Audit", {}).get("overallScore") >= 90

print("\n==================================================================")
print("=== ALL RESILIENCE, DRAIN & RECOVERY GATES PASSED 100% ===")
print("==================================================================")
