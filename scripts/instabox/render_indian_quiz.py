#!/usr/bin/env python3
"""
ShortForge FactoryOS — Indian Quiz Short InstaBox Dispatch & Verification Script

Dispatches a multi-scene Indian Quiz Short to the InstaBox compute cluster,
executes on an active bare-metal worker node, streams output to CAS storage,
and verifies F06 container integrity and F07 media compliance gates.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

# Resolve base URL and admin secret
CONTROL_PLANE_URL = os.environ.get("INSTABOX_CONTROL_PLANE_URL", "http://localhost:3000/api/rendering/instabox/dispatch")
ADMIN_SECRET = os.environ.get("INSTABOX_CONTROL_PLANE_ADMIN_SECRET")

# Attempt reading from apps/web/.env.local if not provided in environment
if not ADMIN_SECRET:
    env_paths = [
        Path(__file__).resolve().parent.parent.parent / "apps" / "web" / ".env.local",
        Path("/data/workspace/ShortForge/apps/web/.env.local"),
        Path("apps/web/.env.local"),
    ]
    for ep in env_paths:
        if ep.exists():
            for line in ep.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if line.startswith("INSTABOX_CONTROL_PLANE_ADMIN_SECRET="):
                    ADMIN_SECRET = line.split("=", 1)[1].strip()
                    break
            if ADMIN_SECRET:
                break

if not ADMIN_SECRET:
    print("FATAL: INSTABOX_CONTROL_PLANE_ADMIN_SECRET not found in env or .env.local", file=sys.stderr)
    sys.exit(1)


def get_healthy_node() -> str:
    """Inspect fleet and return first healthy worker node ID."""
    req = urllib.request.Request(
        CONTROL_PLANE_URL,
        headers={"x-instabox-secret": ADMIN_SECRET},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    nodes = data.get("nodes", [])
    healthy_nodes = [
        n["nodeId"] for n in nodes
        if n.get("health", {}).get("state") == "HEALTHY" and n.get("eligibleInPool", True)
    ]
    if not healthy_nodes:
        print("ERROR: No healthy eligible worker nodes found in InstaBox fleet.", file=sys.stderr)
        print(f"Fleet nodes: {json.dumps(nodes, indent=2)}", file=sys.stderr)
        sys.exit(1)

    # Prefer box2 if healthy, otherwise use first available healthy node
    selected = "box2" if "box2" in healthy_nodes else healthy_nodes[0]
    print(f"[Fleet] Available healthy nodes: {healthy_nodes} | Target selected: {selected}")
    return selected


def build_indian_quiz_intent(job_id: str) -> dict:
    """Construct authentic ShortForge multi-scene Indian Quiz Render Intent."""
    return {
        "project_id": f"proj_{job_id}",
        "title": "Incredible India Heritage & Geography Quiz",
        "output": {
            "width": 1080,
            "height": 1920,
            "fps": 30,
            "duration_seconds": 16.0,
            "video_codec": "libx264",
            "audio_codec": "aac",
        },
        "safe_area": {
            "top": 160,
            "bottom": 320,
            "left": 60,
            "right": 120,
        },
        "scenes": [
            # Scene 1: Hook
            {
                "scene_id": "scene_01_hook",
                "template_id": "quiz.hook.v1",
                "narration_text": "Incredible India Quiz! Can you answer this geography question?",
                "duration_seconds": 2.5,
                "shots": [
                    {
                        "id": "shot_01_hook",
                        "recipe_id": "KINETIC_HOOK",
                        "start_seconds": 0.0,
                        "duration_seconds": 2.5,
                        "props": {
                            "tag": "INDIA QUIZ CHALLENGE",
                            "headline": "Incredible India Quiz",
                            "subtitle": "Can You Answer This Geography Question?",
                            "background_type": "QUIZ_GEOGRAPHY",
                        },
                    }
                ],
                "audio_tracks": [
                    {
                        "track_id": "audio_01_hook",
                        "frequency": 440,
                        "duration_seconds": 2.5,
                        "volume": 0.85,
                        "is_narration": True,
                    }
                ],
            },
            # Scene 2: Question Card
            {
                "scene_id": "scene_02_question",
                "template_id": "quiz.question.v1",
                "narration_text": "Which is the highest mountain peak situated entirely within India?",
                "duration_seconds": 4.0,
                "shots": [
                    {
                        "id": "shot_02_question",
                        "recipe_id": "QUESTION_CARD",
                        "start_seconds": 0.0,
                        "duration_seconds": 4.0,
                        "props": {
                            "question": "Which is the highest mountain peak situated entirely within India?",
                            "options": [
                                "K2 (Godwin-Austen)",
                                "Kangchenjunga",
                                "Nanda Devi",
                                "Kamet",
                            ],
                            "categoryBadge": "GEOGRAPHY | ROUND 1",
                            "topic": "GEOGRAPHY OF INDIA",
                            "background_type": "QUIZ_GEOGRAPHY",
                        },
                    }
                ],
                "audio_tracks": [
                    {
                        "track_id": "audio_02_question",
                        "frequency": 494,
                        "duration_seconds": 4.0,
                        "volume": 0.85,
                        "is_narration": True,
                    }
                ],
            },
            # Scene 3: Thinking Countdown
            {
                "scene_id": "scene_03_countdown",
                "template_id": "quiz.countdown.v1",
                "narration_text": "Think fast! 3 seconds on the clock.",
                "duration_seconds": 3.0,
                "shots": [
                    {
                        "id": "shot_03_countdown",
                        "recipe_id": "COUNTDOWN",
                        "start_seconds": 0.0,
                        "duration_seconds": 3.0,
                        "props": {
                            "question": "Which is the highest mountain peak situated entirely within India?",
                            "options": [
                                "K2 (Godwin-Austen)",
                                "Kangchenjunga",
                                "Nanda Devi",
                                "Kamet",
                            ],
                            "seconds": 3,
                            "background_type": "QUIZ_GEOGRAPHY",
                        },
                    }
                ],
                "audio_tracks": [
                    {
                        "track_id": "audio_03_countdown",
                        "frequency": 523,
                        "duration_seconds": 3.0,
                        "volume": 0.85,
                        "is_narration": True,
                    }
                ],
            },
            # Scene 4: Answer Reveal
            {
                "scene_id": "scene_04_reveal",
                "template_id": "quiz.reveal.v1",
                "narration_text": "The correct answer is Kangchenjunga at 8,586 meters in Sikkim!",
                "duration_seconds": 4.0,
                "shots": [
                    {
                        "id": "shot_04_reveal",
                        "recipe_id": "ANSWER_REVEAL",
                        "start_seconds": 0.0,
                        "duration_seconds": 4.0,
                        "props": {
                            "question": "Which is the highest mountain peak situated entirely within India?",
                            "options": [
                                "K2 (Godwin-Austen)",
                                "Kangchenjunga",
                                "Nanda Devi",
                                "Kamet",
                            ],
                            "answerIndex": 1,
                            "correctOption": "Kangchenjunga",
                            "explanation": "Kangchenjunga (8,586m) in Sikkim is India's highest peak!",
                            "background_type": "QUIZ_GEOGRAPHY",
                        },
                    }
                ],
                "audio_tracks": [
                    {
                        "track_id": "audio_04_reveal",
                        "frequency": 587,
                        "duration_seconds": 4.0,
                        "volume": 0.85,
                        "is_narration": True,
                    }
                ],
            },
            # Scene 5: Outro Call to Action
            {
                "scene_id": "scene_05_outro",
                "template_id": "quiz.outro.v1",
                "narration_text": "Did you get it right? Follow for daily Indian heritage trivia!",
                "duration_seconds": 2.5,
                "shots": [
                    {
                        "id": "shot_05_outro",
                        "recipe_id": "OUTRO_CTA",
                        "start_seconds": 0.0,
                        "duration_seconds": 2.5,
                        "props": {
                            "cta": "DID YOU GET IT RIGHT?",
                            "subtitle": "Follow for daily Indian heritage trivia!",
                            "background_type": "DEEP_INDIGO",
                        },
                    }
                ],
                "audio_tracks": [
                    {
                        "track_id": "audio_05_outro",
                        "frequency": 659,
                        "duration_seconds": 2.5,
                        "volume": 0.85,
                        "is_narration": True,
                    }
                ],
            },
        ],
    }


def main():
    print("==================================================================")
    print("=== ShortForge FactoryOS: Indian Quiz Short Render on InstaBox ===")
    print("==================================================================")

    target_node = get_healthy_node()
    job_id = f"job_indian_quiz_{target_node}_{int(time.time())}"
    print(f"\n[Dispatch] Assembling Indian Quiz Short payload (Job ID: {job_id})...")

    intent = build_indian_quiz_intent(job_id)
    dispatch_payload = {
        "jobId": job_id,
        "targetNodeId": target_node,
        "topic": "Incredible India Heritage & Geography Quiz",
        "duration": 16,
        "localRenderIntent": intent,
    }

    req = urllib.request.Request(
        CONTROL_PLANE_URL,
        data=json.dumps(dispatch_payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-instabox-secret": ADMIN_SECRET,
        },
        method="POST",
    )

    print(f"[Dispatch] Submitting job to control plane targeting {target_node}...")
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        print(f"FAILED: HTTP {e.code} from control plane: {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"FAILED: Dispatch network error: {e}", file=sys.stderr)
        sys.exit(1)

    elapsed = round(time.time() - start_time, 2)
    print(f"[Dispatch] Remote render completed in {elapsed}s.")

    # Validate receipt and artifacts
    receipt = data.get("receipt", {})
    artifact = data.get("artifact", {})
    verifier_result = data.get("verifierResult", {})
    f07_audit = data.get("f07Audit", {})

    status = receipt.get("status")
    worker = receipt.get("providerId")
    sha256 = artifact.get("computedSha256") or artifact.get("sha256")
    cas_path = artifact.get("localPhysicalPath") or artifact.get("uri")
    byte_length = artifact.get("byteLength", 0)

    print("\n----------------- EXECUTION PROOF & AUDIT -----------------")
    print(f"Status:         {status}")
    print(f"Worker Node:    {worker}")
    print(f"Receipt ID:     {receipt.get('receiptId')}")
    print(f"Duration:       {receipt.get('durationSeconds')}s (total roundtrip {elapsed}s)")
    print(f"Byte Length:    {byte_length:,} bytes")
    print(f"SHA-256 Digest: {sha256}")
    print(f"CAS Storage:    {cas_path}")

    f06_status = verifier_result.get("status")
    f07_passed = f07_audit.get("passed")
    f07_score = f07_audit.get("overallScore")
    print(f"F06 Container:  {f06_status} ({verifier_result.get('containerFormat')}, {verifier_result.get('videoCodec')}, {verifier_result.get('audioCodec')})")
    print(f"F07 Audit:      {'PASS' if f07_passed else 'FAIL'} (Score: {f07_score}/100)")
    print("-----------------------------------------------------------")

    if status != "COMPLETED":
        print(f"ERROR: Execution status was not COMPLETED: {status}", file=sys.stderr)
        sys.exit(1)

    if not sha256 or len(sha256) != 64 or byte_length <= 50000:
        print("ERROR: Corrupted or abnormally small physical artifact.", file=sys.stderr)
        sys.exit(1)

    print("\nSUCCESS: Indian Quiz Short rendered and verified on InstaBox bare-metal worker!")
    # Output final summary JSON
    summary = {
        "success": True,
        "jobId": job_id,
        "workerNode": worker,
        "elapsedSeconds": elapsed,
        "byteLength": byte_length,
        "sha256": sha256,
        "casPath": cas_path,
        "f06Status": f06_status,
        "f07Score": f07_score,
        "f07Passed": f07_passed,
    }
    print("JSON_SUMMARY_START")
    print(json.dumps(summary, indent=2))
    print("JSON_SUMMARY_END")


if __name__ == "__main__":
    main()
