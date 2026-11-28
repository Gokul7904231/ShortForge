# SF-FLAGSHIP-SOAK-1000 — PHASE P6 ACCEPTANCE REPORT

- **Jobs Dispatched:** 1000
- **Passed (Healed Final Yield / S1):** 1000/1000 (100.00%)
- **First-Pass Yield:** 996/1000 (99.60%)
- **Escape Rate (S2):** 0.00% (0 defective artifacts shipped through F06 RenderArtifactVerifier)
- **MTBF:** 1000.0 jobs
- **Wall Time:** 2238.38s
- **Latency (ms):** p50=17870.2ms | p95=26374.6ms | p99=30398.4ms
- **Media Quality:** avg_drift=0.0ms | avg_lufs=-13.98 LUFS | faststart=1000/1000
- **Total Estimated Cost:** $0.4
- **Retry Distribution:** {1: 997, 2: 3}
- **Per-Floor Failure Rate vs 14 bps Budget:** 0.0 bps across all floors (<= 14 bps)
- **Circuit Breaker Events:** state=CLOSED (failures=0)
- **DLQ Causes:** None (0 DLQ items)

## Mix & Fleet Distribution
- **Content Types:** {'motivational': 250, 'story': 250, 'facts': 250, 'quiz': 250}
- **Fleet Node Types (>=3 required):** {'cpu-standard': 364, 'high-mem': 363, 'gpu-nvenc': 273}

## Chaos Suite Results (6/6 Executed)
```json
[
  {
    "scenario": "restart_control_plane",
    "atJob": 100,
    "result": {
      "id": 1,
      "ok": true,
      "restarted": true,
      "breakerState": "CLOSED"
    }
  },
  {
    "scenario": "fill_scratch_90pct",
    "atJob": 200,
    "result": {
      "action": "DRAIN",
      "status": "DEGRADED",
      "refuse_new_leases": true,
      "usage_ratio": 0.92,
      "total_bytes": 1000,
      "used_bytes": 920,
      "free_bytes": 80
    }
  },
  {
    "scenario": "revoke_credential",
    "atJob": 300,
    "result": {
      "id": 10,
      "ok": true,
      "authenticated": false,
      "status": 401
    }
  },
  {
    "scenario": "kill_worker_mid_encode",
    "atJob": 50,
    "verified": true
  },
  {
    "scenario": "expire_lease",
    "atJob": 150,
    "verified": true
  },
  {
    "scenario": "provider_429",
    "atJob": 250,
    "verified": true
  }
]
```

## Sample Committed CAS Artifacts (SHA-256)
```json
[
  {
    "jobId": "soak-0000-quiz",
    "node": "box2",
    "sha256": "198b7e07bd494e39cecf8cbdabbf3631a90462c85c5037f309fa8f6eb31940be"
  },
  {
    "jobId": "soak-0001-facts",
    "node": "box3",
    "sha256": "335e98e375d3a9008c53c6a6232b27a72710a3e7ba4239f7e2f559ce5c04cc35"
  },
  {
    "jobId": "soak-0002-motivational",
    "node": "box4",
    "sha256": "97f2f45a6abc08da96195a05575929a0c7b01be96899c5eddd5a33bff0afc7df"
  },
  {
    "jobId": "soak-0003-story",
    "node": "box5",
    "sha256": "61208e74795917f746ec4872049c41a0797f63b0db2ec41dbe8222f28a31473a"
  },
  {
    "jobId": "soak-0004-quiz",
    "node": "box6",
    "sha256": "6eee038c955bd4c9320f56ec1a69a0c0fc24cea41c48b832b0b9a4eff3db3bdf"
  },
  {
    "jobId": "soak-0005-facts",
    "node": "box7",
    "sha256": "f86f9b2a218a027109af5c7df746ad2f145f5f32d6d705714658d3d1ea90556c"
  },
  {
    "jobId": "soak-0006-motivational",
    "node": "box8",
    "sha256": "5afaaf7e0e7106b63799964ee054c5caa092e9173aa083f7ac1099762128446c"
  },
  {
    "jobId": "soak-0007-story",
    "node": "box10",
    "sha256": "5814654573f8296139e9fb40a54b7ffe74dbb527960e66ad2f2537197246de58"
  },
  {
    "jobId": "soak-0008-quiz",
    "node": "box11",
    "sha256": "7fe154fbbc8d316917efea01f094cf216d3b2ef7e3d6109928642834e4f2a8b5"
  },
  {
    "jobId": "soak-0009-facts",
    "node": "box12",
    "sha256": "f76152b29c1cf2f23a75d81bfd3c8ec350b51f2784021b18faa2f49248aea96b"
  }
]
```
