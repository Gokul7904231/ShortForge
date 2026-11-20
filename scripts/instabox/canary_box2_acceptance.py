#!/usr/bin/env python3
"""
ShortForge FactoryOS — Canary Box2 Live Verification Procedure

Validates live physical execution on worker node 'box2' without mutating service state,
deploying code, or modifying production credentials.

OPERATOR APPROVAL REQUIRED:
Do not run without explicit operational confirmation.
"""

import os
import sys
import json
import time
import urllib.request
import ssl

CONTROL_PLANE_URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")
ADMIN_SECRET = (
    os.environ.get("INSTABOX_CONTROL_PLANE_ADMIN_SECRET") or
    os.environ.get("INSTABOX_FLEET_SECRET") or
    os.environ.get("INTERNAL_API_SECRET_KEY")
)

def verify_box2_canary():
    if not ADMIN_SECRET:
        print("ERROR: INSTABOX_CONTROL_PLANE_ADMIN_SECRET environment variable is required.", file=sys.stderr)
        sys.exit(1)

    print("==================================================================", flush=True)
    print("=== ShortForge FactoryOS: Canary Box2 Live Verification ===", flush=True)
    print(f"Control Plane URL: {CONTROL_PLANE_URL}", flush=True)
    print("==================================================================", flush=True)

    # 1. Inspect live fleet status for box2
    print("[1/4] Checking live fleet status for box2...", flush=True)
    req_status = urllib.request.Request(
        CONTROL_PLANE_URL,
        headers={"x-instabox-secret": ADMIN_SECRET},
        method="GET"
    )

    try:
        with urllib.request.urlopen(req_status, timeout=15) as r:
            status_data = json.loads(r.read().decode())
    except Exception as e:
        print(f"FAILED: Unable to query control plane status: {e}", file=sys.stderr)
        sys.exit(1)

    nodes = status_data.get("nodes", [])
    box2_entry = next((n for n in nodes if n.get("nodeId") == "box2"), None)
    if not box2_entry:
        print("FAILED: Node 'box2' is not registered in the control plane fleet.", file=sys.stderr)
        sys.exit(1)

    health = box2_entry.get("health", {})
    state = health.get("state")
    last_hb = box2_entry.get("lastHeartbeatAt")
    print(f"      box2 state={state}, eligibleInPool={box2_entry.get('eligibleInPool')}, lastHeartbeat={last_hb}", flush=True)

    if state != "HEALTHY":
        print(f"FAILED: box2 state is '{state}' (failureReason: {health.get('failureReason')}). Live canary requires HEALTHY state.", file=sys.stderr)
        sys.exit(1)

    # 2. Dispatch genuine multi-scene render targeted to box2
    print("\n[2/4] Dispatching genuine multi-scene render job to box2...", flush=True)
    job_id = f"job_canary_box2_{int(time.time())}"
    payload = {
        "jobId": job_id,
        "targetNodeId": "box2",
        "renderIntent": {
            "topic": "Canary Verification Box2",
            "scenes": [
                {
                    "scene_id": "scene_01",
                    "template_id": "tech.canary.v1",
                    "narration_text": "Live physical execution verified on Box2 node.",
                    "duration_seconds": 2.0,
                    "shots": [
                        {
                            "id": "shot_01",
                            "recipe_id": "KINETIC_TEXT",
                            "start_seconds": 0.0,
                            "duration_seconds": 2.0,
                            "props": {
                                "headline": "CANARY BOX2 ACCEPTANCE",
                                "subtitle": "Physical Hardware Execution",
                                "background_type": "mesh_dark"
                            }
                        }
                    ],
                    "audio_tracks": [
                        {
                            "track_id": "audio_canary_box2",
                            "frequency": 440,
                            "duration_seconds": 2.0,
                            "volume": 0.8,
                            "is_narration": True
                        }
                    ]
                }
            ]
        }
    }

    req_dispatch = urllib.request.Request(
        CONTROL_PLANE_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-instabox-secret": ADMIN_SECRET
        },
        method="POST"
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req_dispatch, timeout=120) as resp:
            dispatch_data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"FAILED: Dispatch to box2 encountered error: {e}", file=sys.stderr)
        sys.exit(1)

    dur = round(time.time() - t0, 2)
    print(f"      Render completed in {dur}s.", flush=True)

    # 3. Verify receipt and artifact
    print("\n[3/4] Verifying authoritative execution receipt & CAS storage...", flush=True)
    receipt = dispatch_data.get("receipt") or {}
    artifact = dispatch_data.get("artifact") or {}
    verifier = dispatch_data.get("verifierResult") or {}
    f07 = dispatch_data.get("f07Audit") or {}

    provider_id = receipt.get("providerId")
    if provider_id != "instabox-box2":
        print(f"FAILED: Mismatched providerId in receipt: {provider_id} (expected 'instabox-box2')", file=sys.stderr)
        sys.exit(1)

    sha256 = artifact.get("computedSha256") or artifact.get("sha256")
    cas_uri = artifact.get("localPhysicalPath") or artifact.get("uri")
    byte_len = artifact.get("byteLength") or 0

    print(f"      Worker: {provider_id}")
    print(f"      Receipt ID: {receipt.get('receiptId')}")
    print(f"      SHA-256: {sha256}")
    print(f"      CAS URI: {cas_uri}")
    print(f"      Byte Length: {byte_len} bytes")

    if not sha256 or len(sha256) != 64 or byte_len <= 0 or not cas_uri:
        print("FAILED: Invalid artifact metadata (empty digest, zero length, or missing URI)", file=sys.stderr)
        sys.exit(1)

    # 4. Verify F06 container check and F07 media acceptance
    print("\n[4/4] Evaluating F06 container & F07 media acceptance gates...", flush=True)
    f06_status = verifier.get("status")
    f07_passed = f07.get("passed")
    f07_overall = f07.get("overallStatus")
    f07_score = f07.get("overallScore")
    hard_gates = f07.get("hardGates") or {}

    print(f"      F06 Status: {f06_status}")
    print(f"      F07 Passed: {f07_passed} (overall: {f07_overall}, score: {f07_score})")

    REQUIRED_HARD_GATES = [
        "artifactExists",
        "validContainer",
        "videoStreamPresent",
        "audioStreamPresent",
        "exact9x16Geometry",
        "compliantCodecs",
        "durationWithinBounds",
        "audioVideoSyncValid",
        "decodeSmokePassed"
    ]
    missing = [g for g in REQUIRED_HARD_GATES if not hard_gates.get(g)]
    if missing:
        print(f"FAILED: F07 hard gates failed: {missing}", file=sys.stderr)
        sys.exit(1)

    if f06_status != "PASS" or not f07_passed or f07_overall != "PASSED":
        print("FAILED: Quality gates did not pass.", file=sys.stderr)
        sys.exit(1)

    print("\n==================================================================", flush=True)
    print("✅ CANARY BOX2 ACCEPTANCE VERIFIED ON RUNNING INFRASTRUCTURE")
    print("==================================================================", flush=True)

if __name__ == "__main__":
    verify_box2_canary()
