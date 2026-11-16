import concurrent.futures
import urllib.request
import json
import time
import os
import sys

FLEET_SECRET = os.environ.get("INSTABOX_FLEET_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY") or os.environ.get("INSTABOX_WORKER_SECRET")
if not FLEET_SECRET:
    print("ERROR: INSTABOX_FLEET_SECRET environment variable is required to run concurrency benchmark.", file=sys.stderr)
    sys.exit(1)

NODES = ["box2", "box3", "box4", "box5", "box6", "box7", "box8", "box10", "box11", "box12", "box13"]
CONTROL_PLANE_URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")

def submit_node_render(node, custom_payload=None):
    t0 = time.time()
    payload = custom_payload or {
        "targetNodeId": node,
        "jobId": f"concurrent-{node}-{int(t0)}",
        "topic": f"ShortForge Production Render - Node {node.upper()}",
        "duration": 2
    }
    req = urllib.request.Request(
        CONTROL_PLANE_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-instabox-secret": FLEET_SECRET
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode())
            dur = time.time() - t0
            receipt = data.get("receipt", {})
            artifact = data.get("artifact", {})
            f07 = data.get("f07Audit", {})
            return {
                "node": node,
                "jobId": payload["jobId"],
                "success": data.get("success"),
                "status": receipt.get("status"),
                "receiptId": receipt.get("receiptId"),
                "executionDurationMs": receipt.get("durationMs"),
                "f07Score": f07.get("overallScore"),
                "f07HardGates": f07.get("hardGates"),
                "f07Passed": f07.get("passed"),
                "sha256": artifact.get("computedSha256"),
                "casUri": artifact.get("casUri"),
                "sizeBytes": artifact.get("sizeBytes"),
                "roundtripDurationSec": round(dur, 2)
            }
    except Exception as e:
        dur = time.time() - t0
        return {
            "node": node,
            "jobId": payload["jobId"],
            "success": False,
            "error": str(e),
            "roundtripDurationSec": round(dur, 2)
        }

if __name__ == "__main__":
    print("==================================================================", flush=True)
    print("=== Launching 11-Node Simultaneous Concurrency Stress Test ===", flush=True)
    print(f"Target Nodes ({len(NODES)}): {', '.join(NODES)}", flush=True)
    print("==================================================================", flush=True)
    wall_start = time.time()

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(NODES)) as executor:
        futures = {executor.submit(submit_node_render, node): node for node in NODES}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            results.append(res)
            if res.get("success"):
                print(f"[{res['node']}] OK ({res['roundtripDurationSec']}s) | status={res['status']} | F07={res['f07Score']} | sha256={str(res['sha256'])[:16]}... | receipt={res['receiptId']}", flush=True)
            else:
                print(f"[{res['node']}] FAILED ({res['roundtripDurationSec']}s) | error={res.get('error')}", flush=True)

    wall_total = round(time.time() - wall_start, 2)
    print("\n==================================================================", flush=True)
    print("=== Fleet Concurrency Test Complete ===", flush=True)
    print(f"Total Dispatched: {len(NODES)} nodes", flush=True)
    all_success = all(r.get("success") and r.get("status") == "COMPLETED" and r.get("f07Score", 0) >= 90 for r in results)
    print(f"All 11 Nodes Succeeded & Passed F07: {all_success}", flush=True)
    print(f"Total Concurrency Wall-Clock: {wall_total}s", flush=True)
    print("==================================================================", flush=True)

    out_path = os.environ.get("CONCURRENCY_RESULTS_PATH", "/tmp/fleet_concurrency_results.json")
    try:
        with open(out_path, "w") as f:
            json.dump({
                "timestamp": time.time(),
                "wallClockDurationSec": wall_total,
                "allSuccess": all_success,
                "results": sorted(results, key=lambda x: x["node"])
            }, f, indent=2)
        print(f"Detailed results saved to {out_path}", flush=True)
    except Exception as e:
        print(f"Could not save JSON output: {e}", file=sys.stderr)
