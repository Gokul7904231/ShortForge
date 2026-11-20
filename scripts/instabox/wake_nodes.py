import subprocess
import concurrent.futures
import time

NODES = ["box2", "box3", "box4", "box5", "box6", "box7", "box8", "box10", "box11", "box12", "box13"]

def wake_node(node):
    t0 = time.time()
    for attempt in range(5):
        try:
            res = subprocess.run(
                ["ssh", "-o", "ConnectTimeout=10", node, "systemctl is-active instabox-worker.service"],
                capture_output=True,
                text=True,
                timeout=25
            )
            out = res.stdout.strip()
            err = res.stderr.strip()
            if "waking up" in err or "waking up" in out:
                time.sleep(5)
                continue
            return node, res.returncode == 0, out, err, round(time.time() - t0, 2)
        except Exception as e:
            time.sleep(5)
    return node, False, "", str(e), round(time.time() - t0, 2)

if __name__ == "__main__":
    print("Pinging/waking configured worker nodes in parallel...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(NODES)) as ex:
        futs = [ex.submit(wake_node, n) for n in NODES]
        for f in concurrent.futures.as_completed(futs):
            node, ok, out, err, dur = f.result()
            print(f"[{node}] active={ok} ({out}) dur={dur}s")
