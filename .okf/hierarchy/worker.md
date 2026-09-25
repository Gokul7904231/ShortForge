# Hierarchy: Floor Workers & Execution Swarms

> **Tier**: Bounded Stage Execution Units (Level 3)  
> **Instance Count**: Dynamic Worker Swarms Scaled on Demand  
> **Source Location**: `apps/web/factoryos/core/workers/` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: Leased, Sandboxed Execution Units

In FactoryOS, **Workers** are the specialized execution units that perform discrete computational and generative tasks on specific production floors (e.g., extracting audio features, generating image prompts, calculating syllable alignments, compiling Remotion frames).

Workers operate under strict distributed bounding principles:
1. **Isolated Execution Context**: Workers never mutate global world state directly. They receive an immutable task payload, execute in an ephemeral sandbox, and return structured results to their floor Guardian.
2. **Leased Operation**: A worker must acquire an active lease (`LeaseManager`) with a fencing token before processing a task. If the lease expires, any subsequent write attempt is rejected.
3. **Heartbeat Requirement**: Workers publish periodic heartbeats (`worker.heartbeat`). If a worker goes silent for longer than the timeout window (default: 30s), the Slayer evicts the lease and reclaims the task.
4. **Capability Scoping**: Workers only possess the narrow capability grants required for their specific floor role.

```
┌────────────────────────────────────────────────────────┐
│                   Overseer Task Queue                  │
└───────────────────────────┬────────────────────────────┘
                            │ Acquire Lease (Fencing Token N)
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Floor Worker Specialist                │
│  ├── Sandboxed Scratch Directory: scratch/tasks/{id}   │
│  ├── Periodic Heartbeat: Every 5000ms                  │
│  ├── Capability Boundary: Granted Capabilities Only    │
│  └── Executes Specialized Skill or Render Kernel       │
└───────────────────────────┬────────────────────────────┘
                            │ Emit Output + Fencing Token N
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Floor Boundary Guardian                │
│     (Validates Lease & Token -> Promotes Artifact)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Worker Isolation** | Process-level isolation with scratch directory sandboxing | Secure lightweight microVMs (Firecracker / gVisor) with network namespace isolation |
| **Lease & Fencing** | Monotonically increasing fencing tokens in lease manager | Distributed lease management with Raft-backed linearizable fencing |
| **Worker Scaling** | Local dynamic worker concurrency limits | Elastic auto-scaling on Kubernetes / Nomad reacting to queue depth |
| **Heartbeat Watchdog** | In-memory heartbeat tracker checked during Slayer sweeps | Gossip-based distributed failure detector (SWIM protocol) |

---

## 3. Worker Safety Invariants

- **No Global Mutations**: Workers have zero direct access to modify user accounts, billing balances, or cluster configuration.
- **Strict Fencing**: Any callback or artifact submission presenting a stale or mismatched fencing token is instantly discarded.
- **Ephemeral Cleanup**: Scratch files generated during execution must be unlinked or garbage collected upon task completion.


## 4. Canonical Permission Boundary

Worker capability boundaries are defined by `.okf/security/worker-permissions.md`. Workers do not receive ambient authority; capability grants, resource scope, leases, fencing, and Guardian policy must all be satisfied before side effects.