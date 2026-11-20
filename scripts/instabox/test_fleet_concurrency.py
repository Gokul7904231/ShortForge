import concurrent.futures
import urllib.request
import json
import time
import os
import sys

FLEET_SECRET = os.environ.get("INSTABOX_CONTROL_PLANE_ADMIN_SECRET") or os.environ.get("INSTABOX_FLEET_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY")
if not FLEET_SECRET:
    print("ERROR: INSTABOX_FLEET_SECRET environment variable is required to run concurrency benchmark.", file=sys.stderr)
    sys.exit(1)

NODES = ["box2", "box3", "box4", "box5", "box6", "box7", "box8", "box10", "box11", "box12", "box13"]
CONTROL_PLANE_URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")

NODE_PROFILES = {
    "box2": {"topic": "Quantum Computing Supremacy", "num": "10,000X FASTER", "lbl": "CIRCUIT SPEED", "bg": "DEEP_INDIGO", "freq": 310},
    "box3": {"topic": "James Webb Deep Space", "num": "13.5 BILLION YRS", "lbl": "FIRST GALAXIES", "bg": "AMBER_HISTORY", "freq": 370},
    "box4": {"topic": "Roman Concrete Architecture", "num": "2,000 YEARS", "lbl": "DURABILITY", "bg": "CRIMSON", "freq": 420},
    "box5": {"topic": "Cellular Immune Defense", "num": "38 TRILLION", "lbl": "MICROORGANISMS", "bg": "EMERALD", "freq": 480},
    "box6": {"topic": "Mariana Trench Abyss", "num": "11,000 METERS", "lbl": "DEPTH SOUNDING", "bg": "DEEP_INDIGO", "freq": 540},
    "box7": {"topic": "Silicon Microchip Lithography", "num": "2 NANOMETERS", "lbl": "GATE WIDTH", "bg": "CYBERPUNK", "freq": 600},
    "box8": {"topic": "Neural Network Scaling", "num": "1.8 TRILLION", "lbl": "ACTIVE WEIGHTS", "bg": "ROYAL_PURPLE", "freq": 660},
    "box10": {"topic": "Geothermal Core Dynamo", "num": "6,000 DEGREES", "lbl": "CORE HEAT", "bg": "AMBER_HISTORY", "freq": 720},
    "box11": {"topic": "SR-71 Titanium Aerodynamics", "num": "85,000 FEET", "lbl": "MAX ALTITUDE", "bg": "MIDNIGHT", "freq": 780},
    "box12": {"topic": "Synaptic Brain Bioelectricity", "num": "20 WATTS", "lbl": "POWER BURN", "bg": "SUNSET", "freq": 830},
    "box13": {"topic": "Neutron Star Matter Density", "num": "1 BILLION TONS", "lbl": "PER TEASPOON", "bg": "DEEP_INDIGO", "freq": 890},
}

def submit_node_render(node, custom_payload=None):
    t0 = time.time()
    prof = NODE_PROFILES.get(node, {"topic": f"ShortForge Production {node.upper()}", "num": "100%", "lbl": "VERIFIED", "bg": "DEEP_INDIGO", "freq": 440})
    job_id = f"concurrent-{node}-{int(t0)}"
    
    payload = custom_payload or {
        "targetNodeId": node,
        "jobId": job_id,
        "topic": prof["topic"],
        "duration": 4.5,
        "localRenderIntent": {
            "project_id": f"proj_{job_id}",
            "title": prof["topic"],
            "output": {"width": 1080, "height": 1920, "fps": 30, "video_codec": "libx264", "audio_codec": "aac"},
            "safe_area": {"top": 160, "bottom": 320, "left": 60, "right": 120},
            "scenes": [
                {
                    "scene_id": "scene_01",
                    "template_id": "facts.rapid-facts.v1",
                    "narration_text": prof["topic"],
                    "duration_seconds": 1.5,
                    "shots": [
                        {
                            "id": "shot_01",
                            "recipe_id": "KINETIC_HOOK",
                            "start_seconds": 0.0,
                            "duration_seconds": 1.5,
                            "props": {
                                "headline": prof["topic"],
                                "subtext": f"Rendered on {node.upper()}",
                                "background_type": prof["bg"]
                            }
                        }
                    ],
                    "audio_tracks": [
                        {
                            "track_id": f"audio_hook_{node}",
                            "frequency": prof["freq"],
                            "duration_seconds": 1.5,
                            "volume": 0.8,
                            "is_narration": True
                        }
                    ]
                },
                {
                    "scene_id": "scene_02",
                    "template_id": "facts.rapid-facts.v1",
                    "narration_text": f"{prof['num']} {prof['lbl']}",
                    "duration_seconds": 1.5,
                    "shots": [
                        {
                            "id": "shot_02",
                            "recipe_id": "BIG_NUMBER",
                            "start_seconds": 0.0,
                            "duration_seconds": 1.5,
                            "props": {
                                "number": prof["num"],
                                "label": prof["lbl"],
                                "background_type": prof["bg"]
                            }
                        }
                    ],
                    "audio_tracks": [
                        {
                            "track_id": f"audio_num_{node}",
                            "frequency": prof["freq"] + 55,
                            "duration_seconds": 1.5,
                            "volume": 0.8,
                            "is_narration": True
                        }
                    ]
                },
                {
                    "scene_id": "scene_03",
                    "template_id": "facts.rapid-facts.v1",
                    "narration_text": "Follow for daily verified intelligence",
                    "duration_seconds": 1.5,
                    "shots": [
                        {
                            "id": "shot_03",
                            "recipe_id": "OUTRO_CTA",
                            "start_seconds": 0.0,
                            "duration_seconds": 1.5,
                            "props": {
                                "cta": "FOLLOW FOR MORE",
                                "subtitle": f"Verified on FactoryOS {node.upper()}",
                                "background_type": prof["bg"]
                            }
                        }
                    ],
                    "audio_tracks": [
                        {
                            "track_id": f"audio_outro_{node}",
                            "frequency": prof["freq"] + 110,
                            "duration_seconds": 1.5,
                            "volume": 0.8,
                            "is_narration": True
                        }
                    ]
                }
            ]
        }
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
            receipt = data.get("receipt") or {}
            artifact = data.get("artifact") or {}
            verifier = data.get("verifierResult") or {}
            f07 = data.get("f07Audit") or {}
            output_artifacts = receipt.get("outputArtifacts") or []
            first_output = output_artifacts[0] if output_artifacts else {}

            cas_uri = artifact.get("uri") or artifact.get("localPhysicalPath") or first_output.get("uri")
            byte_length = artifact.get("byteLength") or first_output.get("byteLength") or 0
            computed_sha256 = artifact.get("computedSha256") or artifact.get("sha256") or first_output.get("sha256")
            provider_id = receipt.get("providerId")

            return {
                "node": node,
                "jobId": payload["jobId"],
                "success": bool(data.get("success")),
                "status": receipt.get("status"),
                "workerId": provider_id,
                "receiptId": receipt.get("receiptId"),
                "executionDurationMs": (receipt.get("metrics") or {}).get("totalTimeMs"),
                "f06Status": verifier.get("status"),
                "f07Passed": bool(f07.get("passed")),
                "f07OverallStatus": f07.get("overallStatus"),
                "f07Score": f07.get("overallScore"),
                "f07HardGates": f07.get("hardGates") or {},
                "sha256": computed_sha256,
                "sha256Match": artifact.get("sha256Match", False),
                "casUri": cas_uri,
                "localPhysicalPath": artifact.get("localPhysicalPath"),
                "byteLength": byte_length,
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
                print(f"[{res['node']}] OK ({res['roundtripDurationSec']}s) | status={res['status']} | worker={res.get('workerId')} | F06={res.get('f06Status')} | F07_passed={res.get('f07Passed')} (score={res.get('f07Score')}) | sha256={str(res.get('sha256'))[:16]}... | bytes={res.get('byteLength')} | receipt={res.get('receiptId')}", flush=True)
            else:
                print(f"[{res['node']}] FAILED ({res['roundtripDurationSec']}s) | error={res.get('error')}", flush=True)

    wall_total = round(time.time() - wall_start, 2)
    print("\n==================================================================", flush=True)
    print("=== Fleet Concurrency Acceptance Verification ===", flush=True)
    print(f"Total Dispatched: {len(NODES)} nodes | Received: {len(results)} results", flush=True)

    passed_all_conditions = True
    failure_reasons = []

    # 1. Exactly eleven results
    if len(results) != len(NODES):
        passed_all_conditions = False
        failure_reasons.append(f"Expected exactly {len(NODES)} results, got {len(results)}")

    # 2. Eleven distinct physical worker identities
    worker_ids = [r.get("workerId") for r in results if r.get("workerId")]
    expected_workers = {f"instabox-{node}" for node in NODES}
    actual_workers = set(worker_ids)
    if len(actual_workers) != len(NODES) or actual_workers != expected_workers:
        passed_all_conditions = False
        failure_reasons.append(f"Worker identities mismatch. Expected {expected_workers}, got {actual_workers}")

    # 3. All returned success: true and status: COMPLETED
    non_completed = [r["node"] for r in results if not r.get("success") or r.get("status") != "COMPLETED"]
    if non_completed:
        passed_all_conditions = False
        failure_reasons.append(f"Nodes failed execution: {non_completed}")

    # 4. F06 PASS for every artifact
    f06_failures = [r["node"] for r in results if r.get("f06Status") != "PASS"]
    if f06_failures:
        passed_all_conditions = False
        failure_reasons.append(f"F06 container verification failed for nodes: {f06_failures}")

    # 5. F07 passed for every artifact (do not confuse score with pass)
    f07_failures = [r["node"] for r in results if not r.get("f07Passed") or r.get("f07OverallStatus") != "PASSED"]
    if f07_failures:
        passed_all_conditions = False
        failure_reasons.append(f"F07 media verification gate failed for nodes: {f07_failures}")

    # 6. All nine hard gates passed for every artifact
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
    gate_failures = []
    for r in results:
        node_gates = r.get("f07HardGates") or {}
        missing_gates = [g for g in REQUIRED_HARD_GATES if not node_gates.get(g)]
        if missing_gates:
            gate_failures.append(f"{r['node']} missing: {missing_gates}")
    if gate_failures:
        passed_all_conditions = False
        failure_reasons.append(f"F07 hard gate failures: {gate_failures}")

    # 7. Eleven non-empty SHA-256 digests
    empty_hashes = [r["node"] for r in results if not r.get("sha256") or len(str(r.get("sha256"))) != 64]
    if empty_hashes:
        passed_all_conditions = False
        failure_reasons.append(f"Invalid/empty SHA-256 digests on nodes: {empty_hashes}")

    # 8. Eleven distinct SHA-256 digests
    sha256_set = set(r.get("sha256") for r in results if r.get("sha256"))
    if len(sha256_set) != len(NODES):
        passed_all_conditions = False
        failure_reasons.append(f"Duplicate SHA-256 digests detected! ({len(sha256_set)} unique of {len(NODES)})")

    # 9. Verify actual CAS URI and non-zero byte length
    invalid_artifacts = [r["node"] for r in results if not r.get("casUri") or (r.get("byteLength") or 0) <= 0]
    if invalid_artifacts:
        passed_all_conditions = False
        failure_reasons.append(f"Invalid CAS URI or zero byteLength on nodes: {invalid_artifacts}")

    print(f"Results Count: {len(results)}/{len(NODES)}")
    print(f"Distinct Physical Workers: {len(actual_workers)}/{len(NODES)}")
    print(f"F06 Container Verification (PASS): {len(NODES) - len(f06_failures)}/{len(NODES)}")
    print(f"F07 Media Acceptance (passed): {len(NODES) - len(f07_failures)}/{len(NODES)}")
    print(f"F07 9-Hard-Gate Compliance: {len(NODES) - len(gate_failures)}/{len(NODES)}")
    print(f"Unique Verified SHA-256 Digests: {len(sha256_set)}/{len(NODES)}")
    print(f"CAS URI & Byte Length Verified: {len(NODES) - len(invalid_artifacts)}/{len(NODES)}")
    print(f"Total Concurrency Wall-Clock: {wall_total}s")

    if not passed_all_conditions:
        print("\n❌ CONCURRENCY ACCEPTANCE FAILED:", file=sys.stderr)
        for reason in failure_reasons:
            print(f"  - {reason}", file=sys.stderr)
    else:
        print("\n✅ ALL 11 NODES PASSED FULL CONCURRENCY ACCEPTANCE GATES")
    print("==================================================================", flush=True)

    out_path = os.environ.get("CONCURRENCY_RESULTS_PATH", "/tmp/fleet_concurrency_results.json")
    try:
        with open(out_path, "w") as f:
            json.dump({
                "timestamp": time.time(),
                "wallClockDurationSec": wall_total,
                "passedAllConditions": passed_all_conditions,
                "failureReasons": failure_reasons,
                "distinctWorkers": list(actual_workers),
                "uniqueSha256": len(sha256_set) == len(NODES),
                "results": sorted(results, key=lambda x: x["node"])
            }, f, indent=2)
        print(f"Detailed results saved to {out_path}", flush=True)
    except Exception as e:
        print(f"Could not save JSON output: {e}", file=sys.stderr)

    if not passed_all_conditions:
        sys.exit(1)
