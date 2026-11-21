#!/usr/bin/env python3
"""
ShortForge FactoryOS — Sequential Reconnect of all 11 eligible InstaBox workers.
Strictly excludes box9.
"""

import subprocess
import sys
import time

TARGET_URL = "https://3000-agq3mvsv7rj7orgrsuc3v2zwea.instabox.tech"
WORKERS = ["box2", "box3", "box4", "box5", "box6", "box7", "box8", "box10", "box11", "box12", "box13"]

def reconcile_worker(node: str) -> dict:
    if node == "box9":
        return {"node": node, "status": "SKIPPED_QUARANTINED"}

    remote_sh = (
        f"sudo sed -i 's|^CONTROL_PLANE_URL=.*|CONTROL_PLANE_URL={TARGET_URL}|' /etc/instabox/worker.env && "
        f"sudo systemctl restart instabox-worker.service && "
        f"sudo systemctl is-active instabox-worker.service"
    )

    args = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=25",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=4",
        node,
        remote_sh
    ]

    t0 = time.time()
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=35)
        dur = round(time.time() - t0, 2)
        out = proc.stdout.strip()
        err = proc.stderr.strip()
        is_active = "active" in out
        return {
            "node": node,
            "success": proc.returncode == 0 and is_active,
            "output": out,
            "error": err,
            "duration": dur,
        }
    except subprocess.TimeoutExpired:
        return {"node": node, "success": False, "error": "SSH timeout", "duration": round(time.time() - t0, 2)}
    except Exception as e:
        return {"node": node, "success": False, "error": str(e), "duration": round(time.time() - t0, 2)}


def main():
    print(f"Sequentially reconciling {len(WORKERS)} InstaBox workers to {TARGET_URL}...\n", flush=True)
    results = {}
    for node in WORKERS:
        print(f"[{node}] Connecting...", end="", flush=True)
        res = reconcile_worker(node)
        results[node] = res
        status = "OK" if res.get("success") else "FAILED"
        print(f" -> {status} in {res.get('duration')}s (active={res.get('output')})", flush=True)
        if not res.get("success") and res.get("error"):
            print(f"       error: {res.get('error')[:120]}", flush=True)
        time.sleep(1.0)

    succeeded = sum(1 for r in results.values() if r.get("success"))
    print(f"\n==========================================", flush=True)
    print(f"Fleet Reconnect: {succeeded}/{len(WORKERS)} workers reconciled.", flush=True)
    print(f"==========================================", flush=True)


if __name__ == "__main__":
    main()
