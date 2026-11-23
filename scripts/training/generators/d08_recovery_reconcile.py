"""Domain D08: F06_RECOVERY_RECONCILE
Covers sideEffectStatus = "UNKNOWN" HTTP timeouts, expired leases, stale fencingEpoch,
RECONCILE_EXISTING + CAS SHA-256 check vs FAILOVER_WORKER vs BLIND_RETRY rejection (RFC 9110).
"""

from typing import List
from .base import (
    CandidateAction,
    MissionContext,
    TeacherSituationPacket,
    TelemetryObservation,
    VerifiedFact,
    make_packet,
)

EVIDENCE_REFS = [
    "apps/web/factoryos/core/compute/instabox/InstaBoxFleetRegistry.ts",
    "apps/web/factoryos/core/compute/cas/ContentAddressedStore.ts",
    "services/rendering-engine/worker_daemon.py",
    ".okf/principles.md",
]


def generate_d08_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. sideEffectStatus = "UNKNOWN" with CAS artifact check vs Blind Retry (10 packets)
    timeout_scenarios = [
        ("HTTP callback POST timed out after 15s; CAS lookup reveals target SHA-256 already exists on disk", "CAS_EXISTS", "ACT_RECONCILE_EXISTING_CAS"),
        ("HTTP callback POST timed out; CAS lookup confirms artifact does NOT exist on disk", "CAS_MISSING_LEASE_ACTIVE", "ACT_QUERY_WORKER_HEARTBEAT"),
        ("Worker node crashed during render; lease duration exceeded 15 minutes", "LEASE_EXPIRED_CRASH", "ACT_FAILOVER_NEW_WORKER_INCREMENT_EPOCH"),
        ("Worker completed upload but network severed before callback acknowledgement was sent", "CAS_EXISTS_STALE_ACK", "ACT_RECONCILE_EXISTING_CAS"),
        ("Control plane restarted during long render job; worker still holding valid lease fencing token", "CONTROL_PLANE_RESTART_RECONNECT", "ACT_RECONNECT_RUNNING_LEASE"),
        ("Worker reported failure with code FFMPEG_EXIT_1; partial 0-byte file in temporary workspace", "RENDER_FAILED_CLEANUP", "ACT_CLEANUP_WORKSPACE_RETRY"),
        ("Callback received with stale fencingEpoch (epoch 1, current lease epoch is 2)", "STALE_EPOCH_REJECT", "ACT_REJECT_STALE_FENCING_CALLBACK"),
        ("Artifact upload completed, SHA-256 checksum calculated on worker matches CAS digest exactly", "CHECKSUM_MATCH", "ACT_RECONCILE_EXISTING_CAS"),
        ("Worker reported completion, but uploaded file SHA-256 does NOT match declared manifest hash", "CORRUPT_UPLOAD_HASH_MISMATCH", "ACT_REJECT_CORRUPT_ARTIFACT_RETRY"),
        ("Multiple workers concurrently attempt to claim same job_id", "CONCURRENT_CLAIM_RACE", "ACT_FENCE_ATOMIC_SINGLE_CLAIM"),
    ]
    for desc, state_code, win_act in timeout_scenarios:
        p = make_packet(
            packet_id=f"sf_d08_{seq:03d}",
            domain="D08",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d08_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="COMPENSATABLE",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Recovery state inspection: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="InstaBoxFleetRegistry.ts:recoverOrReconcileLease",
                ),
                VerifiedFact(
                    fact="RFC 9110 & F06 Recovery Invariant: If a side-effect status is UNKNOWN following a network timeout, the system MUST inspect the CAS digest for idempotent reconciliation before attempting retry. Blind duplicate execution is strictly forbidden.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 6 (Deterministic Replayability & Monotonic Fencing)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Recovery situation telemetry: state_code={state_code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Network ambiguity: {desc}" if "timeout" in desc.lower() else ""],
            constraints=["Prevent split-brain duplicate rendering.", "Enforce monotonic fencing tokens."],
            candidate_actions=[
                CandidateAction(id="ACT_RECONCILE_EXISTING_CAS", label="Verify physical CAS artifact on disk, mark job COMPLETED idempotently, and skip re-render"),
                CandidateAction(id="ACT_QUERY_WORKER_HEARTBEAT", label="Ping active worker daemon to verify whether FFmpeg process is still running"),
                CandidateAction(id="ACT_FAILOVER_NEW_WORKER_INCREMENT_EPOCH", label="Revoke expired lease, increment fencing epoch, and re-assign job to a healthy worker"),
                CandidateAction(id="ACT_RECONNECT_RUNNING_LEASE", label="Acknowledge running worker's heartbeat and re-attach active lease in registry"),
                CandidateAction(id="ACT_CLEANUP_WORKSPACE_RETRY", label="Purge corrupt temporary files from worker workspace and trigger clean single retry"),
                CandidateAction(id="ACT_REJECT_STALE_FENCING_CALLBACK", label="Reject callback with StaleFencingTokenError to prevent zombie write collisions"),
                CandidateAction(id="ACT_REJECT_CORRUPT_ARTIFACT_RETRY", label="Quarantine corrupt file and re-render on alternate qualified worker"),
                CandidateAction(id="ACT_FENCE_ATOMIC_SINGLE_CLAIM", label="Enforce atomic compare-and-swap on job lease to permit only one winner"),
                CandidateAction(id="ACT_BLIND_RETRY_IMMEDIATE", label="Blindly fire duplicate render job to another worker without checking CAS or fencing token"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_BLIND_RETRY_IMMEDIATE": "DISTRIBUTED_SYSTEMS_VIOLATION_SPLIT_BRAIN: Blind retries without fencing cause duplicate rendering, wasted GPU cycles, and race condition overwrites.",
                **{a.id: f"RECOVERY_ACTION_MISMATCH: Action '{a.id}' contradicts state '{state_code}'." for a in [
                    CandidateAction(id="ACT_RECONCILE_EXISTING_CAS", label=""),
                    CandidateAction(id="ACT_QUERY_WORKER_HEARTBEAT", label=""),
                    CandidateAction(id="ACT_FAILOVER_NEW_WORKER_INCREMENT_EPOCH", label=""),
                    CandidateAction(id="ACT_RECONNECT_RUNNING_LEASE", label=""),
                    CandidateAction(id="ACT_CLEANUP_WORKSPACE_RETRY", label=""),
                    CandidateAction(id="ACT_REJECT_STALE_FENCING_CALLBACK", label=""),
                    CandidateAction(id="ACT_REJECT_CORRUPT_ARTIFACT_RETRY", label=""),
                    CandidateAction(id="ACT_FENCE_ATOMIC_SINGLE_CLAIM", label=""),
                ] if a.id != win_act and a.id != "ACT_BLIND_RETRY_IMMEDIATE"}
            },
            provenance_tier="GOLD" if seq <= 5 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Worker Heartbeat Degradation and Recovery Cycles (8 packets)
    heartbeat_tests = [
        ("Worker box3 missed heartbeats for 160 seconds (exceeds HEARTBEAT_DEGRADED_THRESHOLD_MS = 150s)", "DEGRADED", "ACT_MARK_NODE_DEGRADED"),
        ("Worker box4 missed heartbeats for 320 seconds (exceeds HEARTBEAT_BLOCKED_THRESHOLD_MS = 300s)", "BLOCKED", "ACT_MARK_NODE_BLOCKED_EVICT_JOBS"),
        ("Worker box3 was DEGRADED, but fresh heartbeat received with healthy metrics (< 10s old)", "RECOVERED", "ACT_RESTORE_NODE_HEALTHY"),
        ("Worker sends heartbeat with CPU usage 99.8% and memory available 40MB (< 2048MB min)", "RESOURCE_EXHAUSTION", "ACT_MARK_NODE_UNAVAILABLE_RESOURCE_EXHAUSTION"),
        ("Worker node sends heartbeat with DRAINING status during planned host maintenance", "ADMIN_DRAINING", "ACT_RESPECT_DRAINING_HALT_JOB_DISPATCH"),
        ("Worker sends heartbeat with invalid workerId not matching per-node credentials", "AUTH_MISMATCH", "ACT_REJECT_UNAUTHORIZED_HEARTBEAT"),
        ("Worker sends heartbeat after reboot with clean filesystem and 0 active jobs", "FRESH_STARTUP", "ACT_RESTORE_NODE_HEALTHY"),
        ("Worker reports continuous 50s idle heartbeats keeping node in healthy pool", "NORMAL_IDLE_HEARTBEAT", "ACT_RESTORE_NODE_HEALTHY"),
    ]
    for desc, hb_status, win_act in heartbeat_tests:
        p = make_packet(
            packet_id=f"sf_d08_{seq:03d}",
            domain="D08",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d08_{seq:03d}",
                content_engine="history",
                target_duration_sec=60,
                reversibility="COMPENSATABLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Heartbeat telemetry evaluation: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="InstaBoxFleetRegistry.ts:recordHeartbeat",
                ),
                VerifiedFact(
                    fact="InstaBox Fleet Health Rules: Nodes with missed heartbeats > 150s are DEGRADED; > 300s are BLOCKED. Active jobs on BLOCKED nodes must be evicted and recovered.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="InstaBoxFleetRegistry.ts:HEARTBEAT_DEGRADED_THRESHOLD_MS",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Fleet heartbeat telemetry state: {hb_status}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Worker health uncertainty: {desc}" if "missed" in desc else ""],
            constraints=["Maintain accurate pool eligibility.", "Protect active jobs from orphaned nodes."],
            candidate_actions=[
                CandidateAction(id="ACT_MARK_NODE_DEGRADED", label="Mark node status as DEGRADED and pause dispatch of new speculative jobs"),
                CandidateAction(id="ACT_MARK_NODE_BLOCKED_EVICT_JOBS", label="Mark node BLOCKED, evict all pending/active leases, and schedule failover"),
                CandidateAction(id="ACT_RESTORE_NODE_HEALTHY", label="Mark node HEALTHY, reset consecutive failures counter, and enable job dispatch"),
                CandidateAction(id="ACT_MARK_NODE_UNAVAILABLE_RESOURCE_EXHAUSTION", label="Mark node UNAVAILABLE due to disk/RAM starvation and trigger alert"),
                CandidateAction(id="ACT_RESPECT_DRAINING_HALT_JOB_DISPATCH", label="Set node isDraining=True and allow existing jobs to complete without dispatching new ones"),
                CandidateAction(id="ACT_REJECT_UNAUTHORIZED_HEARTBEAT", label="Reject heartbeat with 401 Unauthorized and increment failure counter"),
                CandidateAction(id="ACT_IGNORE_MISSED_HEARTBEATS", label="Ignore missed heartbeats and keep dispatching jobs to unresponsive worker"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_IGNORE_MISSED_HEARTBEATS": "RESILIENCE_VIOLATION_ZOMBIE_DISPATCH: Dispatching jobs to unresponsive nodes causes job queue stalls and silent timeouts.",
                **{a.id: f"HEARTBEAT_ACTION_MISMATCH: Action '{a.id}' contradicts heartbeat state '{hb_status}'." for a in [
                    CandidateAction(id="ACT_MARK_NODE_DEGRADED", label=""),
                    CandidateAction(id="ACT_MARK_NODE_BLOCKED_EVICT_JOBS", label=""),
                    CandidateAction(id="ACT_RESTORE_NODE_HEALTHY", label=""),
                    CandidateAction(id="ACT_MARK_NODE_UNAVAILABLE_RESOURCE_EXHAUSTION", label=""),
                    CandidateAction(id="ACT_RESPECT_DRAINING_HALT_JOB_DISPATCH", label=""),
                    CandidateAction(id="ACT_REJECT_UNAUTHORIZED_HEARTBEAT", label=""),
                ] if a.id != win_act and a.id != "ACT_IGNORE_MISSED_HEARTBEATS"}
            },
            provenance_tier="GOLD" if seq <= 14 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Finite Bounded Repair Cycles (Principle 7: Max 2 attempts) (8 packets)
    repair_tests = [
        (1, "FFmpeg crashed with exit code 1 due to font cache lock", "ACT_TRIGGER_BOUNDED_RETRY_PASS_1"),
        (2, "Second attempt failed due to invalid AAC audio codec parameters", "ACT_TRIGGER_BOUNDED_RETRY_PASS_2"),
        (3, "Third attempt failed with same codec error; repair budget (max=2) exhausted", "ACT_FAIL_CLOSED_ROLLBACK_BASELINE"),
        (1, "CAS artifact download timed out on transient socket reset", "ACT_TRIGGER_BOUNDED_RETRY_PASS_1"),
        (2, "CAS artifact download timed out again on secondary mirror", "ACT_TRIGGER_BOUNDED_RETRY_PASS_2"),
        (3, "Download failed 3 consecutive times; budget exhausted", "ACT_FAIL_CLOSED_ROLLBACK_BASELINE"),
        (1, "Worker disk space dropped below minimum threshold during render", "ACT_TRIGGER_BOUNDED_RETRY_PASS_1"),
        (3, "Worker node fails third time; budget exhausted", "ACT_FAIL_CLOSED_ROLLBACK_BASELINE"),
    ]
    for attempt, desc, win_act in repair_tests:
        p = make_packet(
            packet_id=f"sf_d08_{seq:03d}",
            domain="D08",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d08_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="COMPENSATABLE",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Repair attempt counter: attempt={attempt}. Defect: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref=".okf/principles.md:Principle 7 (Bounded Repair & Last-Known-Good Baseline)",
                ),
                VerifiedFact(
                    fact="F06 Bounded Repair Invariant: Automated healing attempts are strictly capped at 2. If repair attempts are exhausted, the pipeline must fail closed and roll back to the last-known-good baseline; infinite retry loops are forbidden.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 7",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Repair loop evaluation: attempt={attempt}, max_allowed=2", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Never exceed maximum repair budget (2 retries).", "Preserve last-known-good baseline."],
            candidate_actions=[
                CandidateAction(id="ACT_TRIGGER_BOUNDED_RETRY_PASS_1", label="Trigger repair attempt 1 with adjusted render parameters"),
                CandidateAction(id="ACT_TRIGGER_BOUNDED_RETRY_PASS_2", label="Trigger repair attempt 2 (final allowable attempt) on alternate node"),
                CandidateAction(id="ACT_FAIL_CLOSED_ROLLBACK_BASELINE", label="Budget exhausted (attempt >= 3); halt repair loop and roll back to last-known-good baseline"),
                CandidateAction(id="ACT_INFINITE_RETRY_LOOP", label="Keep retrying indefinitely (attempt 4, 5, 6...) consuming unbounded compute"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_INFINITE_RETRY_LOOP": "TREASURY_VIOLATION_INFINITE_RETRY: Infinite retry loops violate Principle 7 and cause unbounded budget burn.",
                **{a.id: f"REPAIR_BUDGET_MISMATCH: Action '{a.id}' contradicts attempt counter rules for attempt={attempt}." for a in [
                    CandidateAction(id="ACT_TRIGGER_BOUNDED_RETRY_PASS_1", label=""),
                    CandidateAction(id="ACT_TRIGGER_BOUNDED_RETRY_PASS_2", label=""),
                    CandidateAction(id="ACT_FAIL_CLOSED_ROLLBACK_BASELINE", label=""),
                ] if a.id != win_act and a.id != "ACT_INFINITE_RETRY_LOOP"}
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
