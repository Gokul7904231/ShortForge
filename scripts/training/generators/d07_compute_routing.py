"""Domain D07: F06_COMPUTE_ROUTING
Multi-dimensional arbitration across LOCAL (RTX 3050 4GB), KAGGLE (T4x2 32GB notebook-only),
RUNPOD, VAST, MODAL, DAYTONA, INSTAVM (session-bound artifact download before VM expiry),
INSTABOX (box1/box2), AMD MI300X, and HF ZeroGPU (RTX Pro 6000 notebook-only) based on VRAM,
duration, queue depth, quota headroom, and ProviderQualificationMatrix status.
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
    "apps/web/factoryos/core/compute/gateway/ComputeGateway.ts",
    "apps/web/factoryos/core/compute/pool/ComputePool.ts",
    "apps/web/factoryos/core/compute/contracts/ComputeContracts.ts",
    "apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts",
    "apps/web/factoryos/core/compute/sandboxes/InstaVMSandboxAdapter.ts",
    "apps/web/factoryos/core/compute/notebooks/NotebookContracts.ts",
    ".okf/principles.md",
]


def generate_d07_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Hardware VRAM & Hardware Acceleration Arbitration (10 packets)
    arbitration_tests = [
        ("Job requires 8GB VRAM for 1080p 60fps Blender 3D render; LOCAL has only 4GB VRAM (RTX 3050)", "KAGGLE_GPU", "ACT_ROUTE_KAGGLE_T4"),
        ("Standard 1080x1920 30s 2D FFmpeg overlay render; LOCAL RTX 3050 4GB is idle with NVENC", "LOCAL_GPU", "ACT_ROUTE_LOCAL_PROCESS"),
        ("CPU-only FFmpeg video concat and audio muxing; InstaBox worker box2 is HEALTHY and idle", "INSTABOX_CPU", "ACT_ROUTE_INSTABOX_WORKER"),
        ("Ultra-heavy AI neural upscaling (ComfyUI model) requiring 24GB+ VRAM; RunPod RTX 4090 available", "RUNPOD_HEAVY", "ACT_ROUTE_RUNPOD_GPU"),
        ("Interactive session requiring ephemeral Python runtime; Modal serverless container configured", "MODAL_SERVERLESS", "ACT_ROUTE_MODAL_SERVERLESS"),
        ("Kaggle monthly GPU quota is exhausted (0/30 hours remaining); failover to HuggingFace ZeroGPU", "KAGGLE_QUOTA_EXHAUSTED", "ACT_ROUTE_HF_ZEROGPU"),
        ("Job requires immediate low-latency render (< 10s queue wait); Kaggle batch startup takes ~90s", "LOW_LATENCY_PRIORITY", "ACT_ROUTE_LOCAL_PROCESS"),
        ("Vast.ai spot instance with unverified reliability score (0.42); qualified RunPod instance available", "VAST_SPOT_RISK", "ACT_ROUTE_RUNPOD_GPU"),
        ("InstaVM microVM session has 45 seconds remaining before scheduled expiration", "INSTAVM_EXPIRY_GUARD", "ACT_ENFORCE_INSTAVM_ARTIFACT_DOWNLOAD_BEFORE_EXPIRY"),
        ("Heavy open-source LLM reasoning pass requiring high FP16 throughput; AMD MI300X qualified", "AMD_MI300X", "ACT_ROUTE_AMD_MI300X"),
    ]
    for desc, scenario_code, win_act in arbitration_tests:
        p = make_packet(
            packet_id=f"sf_d07_{seq:03d}",
            domain="D07",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d07_{seq:03d}",
                content_engine="coding" if "Blender" in desc else "facts",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if "EXPIRY" in scenario_code or "HEAVY" in scenario_code else "MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Compute requirements and hardware telemetry: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="ComputeRouter.ts:selectOptimalProvider",
                ),
                VerifiedFact(
                    fact="Compute Routing Invariant: Select the utility-optimal provider matching VRAM, duration, and hardware requirements. Never assign a job to a provider lacking necessary VRAM or hardware acceleration.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 8 (Capability-First Abstraction & Compute Routing)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Provider router evaluation code: {scenario_code}", evidence_type="OBSERVED_PROVIDER"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Honor VRAM and hardware capability constraints.", "Enforce session expiry and quota boundaries."],
            candidate_actions=[
                CandidateAction(id="ACT_ROUTE_KAGGLE_T4", label="Route batch render job to Kaggle T4x2 (32GB VRAM, notebook worker)"),
                CandidateAction(id="ACT_ROUTE_LOCAL_PROCESS", label="Route job to Local RTX 3050 NVENC accelerated process (0 queue latency)"),
                CandidateAction(id="ACT_ROUTE_INSTABOX_WORKER", label="Dispatch CPU-bound FFmpeg job to bare-metal InstaBox worker box2"),
                CandidateAction(id="ACT_ROUTE_RUNPOD_GPU", label="Dispatch high-memory neural workload to qualified RunPod RTX 4090 instance"),
                CandidateAction(id="ACT_ROUTE_MODAL_SERVERLESS", label="Route ephemeral function to Modal serverless container with fast spin-up"),
                CandidateAction(id="ACT_ROUTE_HF_ZEROGPU", label="Failover to HuggingFace ZeroGPU (RTX Pro 6000) after Kaggle quota exhaustion"),
                CandidateAction(id="ACT_ENFORCE_INSTAVM_ARTIFACT_DOWNLOAD_BEFORE_EXPIRY", label="Enforce immediate CAS artifact download and lease release before InstaVM expiry"),
                CandidateAction(id="ACT_ROUTE_AMD_MI300X", label="Dispatch high-throughput FP16 workload to AMD MI300X cluster"),
                CandidateAction(id="ACT_FORCE_LOCAL_OOM", label="Force render on Local RTX 3050 4GB causing CUDA Out-of-Memory crash"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_FORCE_LOCAL_OOM": "HARDWARE_VIOLATION_OOM: Forcing 8GB+ render on 4GB GPU causes catastrophic CUDA Out-Of-Memory failure.",
                **{a.id: f"ROUTING_MISMATCH: Action '{a.id}' does not satisfy requirement profile '{scenario_code}'." for a in [
                    CandidateAction(id="ACT_ROUTE_KAGGLE_T4", label=""),
                    CandidateAction(id="ACT_ROUTE_LOCAL_PROCESS", label=""),
                    CandidateAction(id="ACT_ROUTE_INSTABOX_WORKER", label=""),
                    CandidateAction(id="ACT_ROUTE_RUNPOD_GPU", label=""),
                    CandidateAction(id="ACT_ROUTE_MODAL_SERVERLESS", label=""),
                    CandidateAction(id="ACT_ROUTE_HF_ZEROGPU", label=""),
                    CandidateAction(id="ACT_ENFORCE_INSTAVM_ARTIFACT_DOWNLOAD_BEFORE_EXPIRY", label=""),
                    CandidateAction(id="ACT_ROUTE_AMD_MI300X", label=""),
                ] if a.id != win_act and a.id != "ACT_FORCE_LOCAL_OOM"}
            },
            provenance_tier="GOLD" if seq <= 5 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Provider Qualification Matrix (QUALIFIED vs CONFIGURED-BUT-NOT-QUALIFIED) (8 packets)
    matrix_scenarios = [
        ("Provider 'RUNPOD' has API key in .env, but smoke test was never executed", "CONFIGURED_NOT_QUALIFIED", "ACT_REJECT_UNQUALIFIED_PROVIDER"),
        ("Provider 'INSTABOX' has verified box2 pilot acceptance test with 100% pass", "QUALIFIED", "ACT_ALLOW_QUALIFIED_DISPATCH"),
        ("Provider 'DAYTONA' API key is expired or returning 401 unauthorized", "AUTH_FAILED", "ACT_REJECT_AUTH_FAILED_PROVIDER"),
        ("Provider 'KAGGLE' completed golden mission verification with green exit code", "QUALIFIED", "ACT_ALLOW_QUALIFIED_DISPATCH"),
        ("Provider 'VAST' has credentials but provider daemon reports missing FFmpeg binary", "MISSING_BINARY_DEPENDENCY", "ACT_REJECT_INCOMPLETE_RUNTIME"),
        ("Provider 'MODAL' passed all qualification smoke gates with verified receipt", "QUALIFIED", "ACT_ALLOW_QUALIFIED_DISPATCH"),
        ("Provider 'HF_ZEROGPU' token is present, but ZeroGPU queue wait exceeds 300s", "QUEUE_SATURATED", "ACT_AVOID_SATURATED_PROVIDER"),
        ("Provider 'LOCAL' GPU drivers are healthy, CUDA 12.4 runtime verified", "QUALIFIED", "ACT_ALLOW_QUALIFIED_DISPATCH"),
    ]
    for desc, qual_status, win_act in matrix_scenarios:
        p = make_packet(
            packet_id=f"sf_d07_{seq:03d}",
            domain="D07",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d07_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if "REJECT" in win_act else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Provider Qualification Matrix check: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="ProviderQualificationMatrix.ts:checkQualification",
                ),
                VerifiedFact(
                    fact="F06 Security Rule: A provider with configured credentials may NOT receive production render jobs until passing the physical qualification test suite.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/compute/instabox-fleet-fabric.md:Qualification Gate",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Matrix status: {qual_status}", evidence_type="OBSERVED_PROVIDER"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Dispatch ONLY to QUALIFIED providers with verified physical smoke receipts."],
            candidate_actions=[
                CandidateAction(id="ACT_ALLOW_QUALIFIED_DISPATCH", label="Allow job dispatch to provider with confirmed QUALIFIED status in registry"),
                CandidateAction(id="ACT_REJECT_UNQUALIFIED_PROVIDER", label="Reject dispatch and trigger qualification probe before admitting provider to pool"),
                CandidateAction(id="ACT_REJECT_AUTH_FAILED_PROVIDER", label="Mark provider as UNAVAILABLE and alert operator for credential rotation"),
                CandidateAction(id="ACT_REJECT_INCOMPLETE_RUNTIME", label="Block provider due to missing binary dependencies and quarantine node"),
                CandidateAction(id="ACT_AVOID_SATURATED_PROVIDER", label="Deprioritize provider with saturated queue and route to faster alternative"),
                CandidateAction(id="ACT_DISPATCH_TO_UNQUALIFIED_BLIND", label="Blindly dispatch production job to unverified provider to save setup time"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_DISPATCH_TO_UNQUALIFIED_BLIND": "GOVERNANCE_VIOLATION_UNQUALIFIED_DISPATCH: Dispatching jobs to unverified providers risks silent execution failures and broken output artifacts.",
                **{a.id: f"QUALIFICATION_ACTION_MISMATCH: Action '{a.id}' contradicts matrix status '{qual_status}'." for a in [
                    CandidateAction(id="ACT_ALLOW_QUALIFIED_DISPATCH", label=""),
                    CandidateAction(id="ACT_REJECT_UNQUALIFIED_PROVIDER", label=""),
                    CandidateAction(id="ACT_REJECT_AUTH_FAILED_PROVIDER", label=""),
                    CandidateAction(id="ACT_REJECT_INCOMPLETE_RUNTIME", label=""),
                    CandidateAction(id="ACT_AVOID_SATURATED_PROVIDER", label=""),
                ] if a.id != win_act and a.id != "ACT_DISPATCH_TO_UNQUALIFIED_BLIND"}
            },
            provenance_tier="GOLD" if seq <= 14 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Quarantined Node Exclusions (box9 Invariant) (8 packets)
    for target_node in ["box9", "box2", "box3", "box9", "box7", "box9", "box10", "box13"]:
        is_box9 = target_node == "box9"
        win_act = "ACT_PERMANENTLY_EXCLUDE_BOX9" if is_box9 else "ACT_ADMIT_ELIGIBLE_INSTABOX_NODE"
        p = make_packet(
            packet_id=f"sf_d07_{seq:03d}",
            domain="D07",
            floor_id="F06",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d07_{seq:03d}",
                content_engine="history",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="CRITICAL" if is_box9 else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Node target candidate for compute scheduling: '{target_node}'.",
                    evidence_type="VERIFIED_FACT",
                    ref="InstaBoxContracts.ts:isAllowedInstaBoxWorkerNode",
                ),
                VerifiedFact(
                    fact="INSTABOX_EXCLUDED_NODES contains 'box9'. Node box9 is permanently quarantined and must NEVER receive jobs, tokens, or registration.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="InstaBoxContracts.ts:INSTABOX_EXCLUDED_NODES",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Node identity check: {target_node}, excluded={is_box9}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Strictly enforce box9 quarantine.", "Never admit excluded nodes into active compute fabric."],
            candidate_actions=[
                CandidateAction(id="ACT_PERMANENTLY_EXCLUDE_BOX9", label="Reject node box9 immediately with StrictNodeExclusionError; prevent registration and job claim"),
                CandidateAction(id="ACT_ADMIT_ELIGIBLE_INSTABOX_NODE", label=f"Admit eligible worker {target_node} to compute pool and issue lease fencing token"),
                CandidateAction(id="ACT_UNQUARANTINE_BOX9", label="Attempt to unquarantine box9 and dispatch jobs to test if it recovered"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_UNQUARANTINE_BOX9": "SECURITY_VIOLATION_QUARANTINE_BREACH: Unquarantining box9 violates strict repository invariants; node is permanently prohibited.",
                ("ACT_PERMANENTLY_EXCLUDE_BOX9" if not is_box9 else "ACT_ADMIT_ELIGIBLE_INSTABOX_NODE"): "NODE_ELIGIBILITY_MISCLASSIFICATION: Action contradicts node inclusion list.",
            },
            provenance_tier="GOLD" if seq <= 20 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
