# ShortForge Compute Roadmap — 2026-10-02

| Phase | Status | Evidence / remaining gate |
|---|---|---|
| 1. Finish Sandbox providers | INTEGRATION-WAVE | Hosted Daytona + InstaVM + existing Modal adapter; PandaStack removed from sandbox plane; InstaVM repository-side F07 proof remains the promotion gate |
| 2. Build ONE Compute Pool | DONE | ComputePool is bound to ComputeRouter and ComputeGateway |
| 3. Standardize Workers | DONE | ShortForgeRenderWorker contract wraps real render-capable providers |
| 4. Add Ascalon decision layer | DONE | GLiDE fast/shadow/canary decision tier; hard admission remains deterministic |
| 5. Add smart selection | DONE | Capability + health + load + ETA + observed reliability/latency telemetry |
| 6. Add automatic failover | DONE | Availability recheck, timeout/error failover, physical artifact failover |
| 7. Real distributed rendering | ACTIVATION-READY | Manual live smoke supports AMD/Kaggle/Daytona/Modal/InstaVM; requires live provider credentials/configuration |
| 8. Prove speed + reliability | CODE-COMPLETE | Chaos matrix covers dead worker, saturation, timeout, telemetry learning; live provider stress still requires credentials |
| 9. Golden mission | DONE AT COMPUTE BOUNDARY | RenderFabric -> ComputePool -> provider -> CAS -> F07 passes; full mission delivery is a separate integration gate |
| 10. Optimize | CODE-COMPLETE | 3-sample telemetry promotion floor; measured startup/execution/transfer data feeds utility scoring |

## Production activation order

1. Configure one non-local provider (AMD DevCloud or a hosted sandbox/notebook with a real render command).
2. Run the Live Multi-Provider Render workflow.
3. Record provider startup, render, transfer, failure, and F07 verification telemetry.
4. Repeat with a second provider.
5. Exercise failover with one provider unavailable.
6. Promote GLiDE from shadow to canary only after observed calibration evidence.
7. Use measured telemetry to tune provider preference and provisioning policy.

## Hard boundaries

- No self-hosted PandaStack sandbox.
- Control-only provider adapters are not render workers.
- GLiDE cannot grant capability, lease, fencing, publication, or F07 authority.
- F07 and CAS remain physical truth gates.
