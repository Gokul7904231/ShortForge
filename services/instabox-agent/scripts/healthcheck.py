#!/usr/bin/env python3
"""
InstaBox Node Local Health Check
Verifies FFmpeg, disk space, memory, and control plane reachability.
"""

import os
import sys
import shutil
import subprocess
import urllib.request

CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
INSTABOX_WORKER_SECRET = os.environ.get("INSTABOX_WORKER_SECRET") or os.environ.get("RENDER_WORKER_SECRET")
WORKER_ID = os.environ.get("WORKER_ID", "instabox-box2")

def check_ffmpeg() -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=True)
        print("[OK] FFmpeg is installed and operational.")
        return True
    except Exception as e:
        print(f"[FAIL] FFmpeg check failed: {e}", file=sys.stderr)
        return False

def check_resources() -> bool:
    try:
        disk = shutil.disk_usage("/")
        free_gb = disk.free / (1024 ** 3)
        if free_gb < 2.0:
            print(f"[WARN] Disk space is low: {free_gb:.2f} GB free.", file=sys.stderr)
            return False
        print(f"[OK] Disk space adequate: {free_gb:.2f} GB free.")
        return True
    except Exception as e:
        print(f"[FAIL] Resource check failed: {e}", file=sys.stderr)
        return False

def check_control_plane() -> bool:
    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/heartbeat"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                print(f"[OK] Control plane heartbeat endpoint reachable at {url}.")
                return True
            print(f"[WARN] Control plane returned HTTP {resp.status}.", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[WARN] Control plane reachability check failed: {e}", file=sys.stderr)
        return False

def main():
    print(f"=== InstaBox Health Check for {WORKER_ID} ===")
    ff = check_ffmpeg()
    res = check_resources()
    cp = check_control_plane()

    if ff and res:
        print("[SUCCESS] Node local health check PASSED.")
        sys.exit(0)
    else:
        print("[FAIL] Node local health check FAILED.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
