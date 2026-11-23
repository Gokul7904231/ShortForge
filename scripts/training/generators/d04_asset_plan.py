"""Domain D04: F03_ASSET_PLAN_IR
Covers F02 -> (F03 || F04) -> F05 topology enforcement, retrieval-first ordering
(Cache -> B2 -> Wikimedia/Openverse -> Vertex Imagen -> Deterministic Placeholder),
character continuity anchor locks, and incrementing asset_plan_version without mutating F02.
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
    "services/pipeline/floor03_asset_realization/app/domain/asset_plan_ir.py",
    "services/pipeline/floor03_asset_realization/app/domain/asset_models.py",
    "apps/web/lib/visual-assets/VisualPipeline.ts",
    "apps/web/lib/visual-assets/VisualPackBuilder.ts",
    "apps/web/factoryos/core/bridge/Floor03RuntimeAdapter.ts",
    ".okf/principles.md",
]


def generate_d04_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Retrieval-First Ordering Policy (10 packets)
    retrieval_tiers = [
        ("Exact prompt match found in local CAS storage with valid SHA-256", "CAS_LOCAL", "ACT_USE_LOCAL_CAS"),
        ("Local CAS missed, but exact asset hash exists in Backblaze B2 remote archive", "B2_REMOTE", "ACT_PULL_B2_ARCHIVE"),
        ("CAS and B2 missed, but query matches high-res Creative Commons image on Wikimedia Commons", "WIKIMEDIA_CC", "ACT_FETCH_WIKIMEDIA_COMMONS"),
        ("All free/cached tiers missed, paid Vertex Imagen quota available ($0.03/img)", "VERTEX_IMAGEN", "ACT_INVOKE_VERTEX_IMAGEN"),
        ("All free tiers missed, and Vertex Imagen quota is exhausted or disabled", "FALLBACK_PLACEHOLDER", "ACT_USE_DETERMINISTIC_PLACEHOLDER"),
        ("Asset in CAS has corrupted SHA-256 header (byte mismatch)", "CORRUPT_CAS_PULL_B2", "ACT_INVALIDATE_CAS_PULL_B2"),
        ("Wikimedia image has non-commercial license restricting monetized Shorts", "LICENSE_RESTRICTION", "ACT_REJECT_CC_NONCOMMERCIAL"),
        ("B2 remote network timeout; fast fallback to Openverse public domain", "B2_TIMEOUT_OPENVERSE", "ACT_FAILOVER_OPENVERSE"),
        ("Vertex Imagen generated an image with severe blurriness (sharpness score < 30)", "GENERATION_QUALITY_FAIL", "ACT_RETRY_IMAGEN_OR_FALLBACK"),
        ("Exact match found in Content Genome visual assets store", "CONTENT_GENOME_CACHE", "ACT_USE_LOCAL_CAS"),
    ]
    for scenario_desc, tier_code, winning_act in retrieval_tiers:
        p = make_packet(
            packet_id=f"sf_d04_{seq:03d}",
            domain="D04",
            floor_id="F03",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d04_{seq:03d}",
                content_engine="history" if "Wikimedia" in scenario_desc else "facts",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Visual asset resolution state: {scenario_desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="VisualPipeline.ts:resolveVisualAsset",
                ),
                VerifiedFact(
                    fact="F03 Retrieval-First Hierarchy: Local CAS -> B2 Object Store -> Wikimedia/Openverse -> Vertex AI Imagen -> Deterministic Geometric Canvas. Skipping earlier tiers is forbidden.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 8 (Capability-First Abstraction & Economics)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Tier evaluation signal: {tier_code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Follow strict retrieval-first cascade.", "Minimize metered cloud spend whenever cached or free assets exist."],
            candidate_actions=[
                CandidateAction(id="ACT_USE_LOCAL_CAS", label="Mount verified local CAS artifact directly (0 latency, $0 cost)"),
                CandidateAction(id="ACT_PULL_B2_ARCHIVE", label="Download artifact from Backblaze B2 and populate local CAS"),
                CandidateAction(id="ACT_FETCH_WIKIMEDIA_COMMONS", label="Download verified Creative Commons CC-BY/Public Domain asset from Wikimedia with attribution"),
                CandidateAction(id="ACT_INVOKE_VERTEX_IMAGEN", label="Dispatch image synthesis request to Vertex AI Imagen 3 under approved treasury budget"),
                CandidateAction(id="ACT_USE_DETERMINISTIC_PLACEHOLDER", label="Render deterministic styled typographic placeholder canvas with gradient backdrop"),
                CandidateAction(id="ACT_INVALIDATE_CAS_PULL_B2", label="Invalidate corrupted local CAS entry and re-fetch authentic copy from B2 archive"),
                CandidateAction(id="ACT_REJECT_CC_NONCOMMERCIAL", label="Reject non-commercial image to preserve YouTube monetization and fallback to Imagen"),
                CandidateAction(id="ACT_FAILOVER_OPENVERSE", label="Failover to Openverse public domain repository after B2 timeout"),
                CandidateAction(id="ACT_RETRY_IMAGEN_OR_FALLBACK", label="Reject blurry generated image and trigger single retry with adjusted prompt"),
                CandidateAction(id="ACT_BYPASS_TO_IMAGEN", label="Directly generate new image via Vertex Imagen, completely skipping cache inspection"),
            ],
            winning_action_id=winning_act,
            rejected_reasons={
                "ACT_BYPASS_TO_IMAGEN": "TREASURY_VIOLATION_CACHE_BYPASS: Generating new images when valid cached or open assets exist wastes metered cloud budget.",
                **{a.id: f"TIER_CASCADE_MISMATCH: Action '{a.id}' does not match the active evaluation condition '{tier_code}'." for a in [
                    CandidateAction(id="ACT_USE_LOCAL_CAS", label=""),
                    CandidateAction(id="ACT_PULL_B2_ARCHIVE", label=""),
                    CandidateAction(id="ACT_FETCH_WIKIMEDIA_COMMONS", label=""),
                    CandidateAction(id="ACT_INVOKE_VERTEX_IMAGEN", label=""),
                    CandidateAction(id="ACT_USE_DETERMINISTIC_PLACEHOLDER", label=""),
                    CandidateAction(id="ACT_INVALIDATE_CAS_PULL_B2", label=""),
                    CandidateAction(id="ACT_REJECT_CC_NONCOMMERCIAL", label=""),
                    CandidateAction(id="ACT_FAILOVER_OPENVERSE", label=""),
                    CandidateAction(id="ACT_RETRY_IMAGEN_OR_FALLBACK", label=""),
                ] if a.id != winning_act and a.id != "ACT_BYPASS_TO_IMAGEN"}
            },
            provenance_tier="GOLD" if seq <= 5 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Parallel Topology: F02 -> (F03 || F04) -> F05 (6 packets)
    topo_scenarios = [
        ("F03 Asset Realization receives valid ScriptIR from F02; F04 Voice synthesis is running concurrently", "ACT_EXECUTE_F03_PARALLEL"),
        ("F03 attempted to trigger F04 voice generation internally", "ACT_REJECT_CROSS_FLOOR_CALL"),
        ("F03 attempted to modify dialogue script inside ScriptIR while selecting scene images", "ACT_REJECT_UPSTREAM_MUTATION"),
        ("F03 and F04 completed execution; handing off to F05 Composition Timeline", "ACT_HANDOFF_TO_F05"),
        ("F03 executed before F02 completed (ScriptIR missing or unverified)", "ACT_HALT_AWAIT_F02"),
        ("F03 attempting to directly invoke F06 video render engine", "ACT_ENFORCE_TOPOLOGY_GATE"),
    ]
    for desc, win_act in topo_scenarios:
        p = make_packet(
            packet_id=f"sf_d04_{seq:03d}",
            domain="D04",
            floor_id="F03",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d04_{seq:03d}",
                content_engine="story",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if "REJECT" in win_act else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Pipeline state observation: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="FloorRegistry.ts:validateFloorTransition",
                ),
                VerifiedFact(
                    fact="Canonical Floor Topology: F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07. Floors F03 and F04 run in parallel, cannot call each other, and cannot bypass F05.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 3 (Single Authoritative Source of Truth - Topology)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Topology check for {win_act}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Strictly obey DAG floor dependencies.", "Never bypass intermediate composition stages."],
            candidate_actions=[
                CandidateAction(id="ACT_EXECUTE_F03_PARALLEL", label="Execute F03 asset realization concurrently with F04 using immutable F02 ScriptIR inputs"),
                CandidateAction(id="ACT_REJECT_CROSS_FLOOR_CALL", label="Block direct F03->F04 cross-floor call; delegate parallel coordination to Overseer/Runtime"),
                CandidateAction(id="ACT_REJECT_UPSTREAM_MUTATION", label="Reject in-place mutation of F02 ScriptIR from visual floor F03"),
                CandidateAction(id="ACT_HANDOFF_TO_F05", label="Package AssetPlanIR with durable handoff store and notify F05 Composition stage"),
                CandidateAction(id="ACT_HALT_AWAIT_F02", label="Halt F03 until upstream F02 ScriptIR is verified and signed"),
                CandidateAction(id="ACT_ENFORCE_TOPOLOGY_GATE", label="Block attempt to skip F05 Composition and route directly to F06 render workers"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                a.id: f"TOPOLOGY_VIOLATION: Action '{a.id}' contradicts the canonical floor transition rule for this state."
                for a in [
                    CandidateAction(id="ACT_EXECUTE_F03_PARALLEL", label=""),
                    CandidateAction(id="ACT_REJECT_CROSS_FLOOR_CALL", label=""),
                    CandidateAction(id="ACT_REJECT_UPSTREAM_MUTATION", label=""),
                    CandidateAction(id="ACT_HANDOFF_TO_F05", label=""),
                    CandidateAction(id="ACT_HALT_AWAIT_F02", label=""),
                    CandidateAction(id="ACT_ENFORCE_TOPOLOGY_GATE", label=""),
                ] if a.id != win_act
            },
            provenance_tier="GOLD" if seq <= 12 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Character Continuity & Anchor Locking across Scenes (8 packets)
    continuity_scenarios = [
        ("Character 'Detective Vance' appears in Scene 1; Scene 2 requires strict face continuity anchor", "STRICT", "ACT_LOCK_CHARACTER_IDENTITY_ANCHOR"),
        ("Scene 3 transitions to wide city landscape shot (no human character present)", "INDEPENDENT", "ACT_SET_INDEPENDENT_BROLL"),
        ("Scene 4 returns to 'Detective Vance' after an intermediate B-roll shot", "REANCHOR", "ACT_REANCHOR_PRIMARY_IDENTITY"),
        ("Scene 2 generated Detective Vance with different hair color and clothing style", "CONTINUITY_BREAK", "ACT_REGENERATE_WITH_REFERENCE_CONDITIONING"),
        ("Character identity reference embedding extracted and verified against anchor image", "EMBEDDING_PASS", "ACT_APPROVE_CONTINUITY_PASS"),
        ("Animated mascot in educational quiz changes design style between Question 1 and Question 2", "STYLE_DRIFT", "ACT_ENFORCE_GLOBAL_STYLE_PROMPT"),
        ("Scene 5 continuous camera pan following character walking down hallway", "CHAIN_FROM_PREVIOUS", "ACT_CHAIN_LAST_FRAME_CONDITIONING"),
        ("Multi-character scene: Scene 3 must maintain visual distinction between 2 protagonists", "MULTI_CHARACTER_ANCHOR", "ACT_APPLY_MULTI_IDENTITY_MASKS"),
    ]
    for desc, mode_code, win_act in continuity_scenarios:
        p = make_packet(
            packet_id=f"sf_d04_{seq:03d}",
            domain="D04",
            floor_id="F03",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d04_{seq:03d}",
                content_engine="story" if "Detective" in desc else "quiz",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Continuity analysis: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="asset_plan_ir.py:ContinuityMode",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Continuity mode signal: {mode_code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Visual drift anomaly: {mode_code}" if "DRIFT" in mode_code or "BREAK" in mode_code else ""],
            constraints=["Preserve visual continuity across scene boundaries.", "Ensure character identity anchors are invariant."],
            candidate_actions=[
                CandidateAction(id="ACT_LOCK_CHARACTER_IDENTITY_ANCHOR", label="Lock Scene 1 character seed and IP-Adapter reference embedding for Scene 2"),
                CandidateAction(id="ACT_SET_INDEPENDENT_BROLL", label="Mark scene as ContinuityMode.INDEPENDENT for general atmospheric B-roll"),
                CandidateAction(id="ACT_REANCHOR_PRIMARY_IDENTITY", label="Re-anchor character reference embedding from canonical character sheet"),
                CandidateAction(id="ACT_REGENERATE_WITH_REFERENCE_CONDITIONING", label="Reject drifting image and regenerate with reference_image conditioning"),
                CandidateAction(id="ACT_APPROVE_CONTINUITY_PASS", label="Approve character continuity as conforming to identity threshold (> 0.82 similarity)"),
                CandidateAction(id="ACT_ENFORCE_GLOBAL_STYLE_PROMPT", label="Inject shared negative prompt and style conditioning token across all scenes"),
                CandidateAction(id="ACT_CHAIN_LAST_FRAME_CONDITIONING", label="Condition image generator on the last frame of previous clip to guarantee seamless cut"),
                CandidateAction(id="ACT_APPLY_MULTI_IDENTITY_MASKS", label="Apply regional prompting masks to preserve distinct character features"),
                CandidateAction(id="ACT_DISREGARD_CHARACTER_IDENTITY", label="Allow characters to randomly transform between scenes without consistency check"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_DISREGARD_CHARACTER_IDENTITY": "QUALITY_VIOLATION_CHARACTER_JUMP: Inconsistent character faces destroy suspension of disbelief and violate production specs.",
                **{a.id: f"CONTINUITY_ACTION_MISMATCH: Action '{a.id}' does not resolve specific state '{mode_code}'." for a in [
                    CandidateAction(id="ACT_LOCK_CHARACTER_IDENTITY_ANCHOR", label=""),
                    CandidateAction(id="ACT_SET_INDEPENDENT_BROLL", label=""),
                    CandidateAction(id="ACT_REANCHOR_PRIMARY_IDENTITY", label=""),
                    CandidateAction(id="ACT_REGENERATE_WITH_REFERENCE_CONDITIONING", label=""),
                    CandidateAction(id="ACT_APPROVE_CONTINUITY_PASS", label=""),
                    CandidateAction(id="ACT_ENFORCE_GLOBAL_STYLE_PROMPT", label=""),
                    CandidateAction(id="ACT_CHAIN_LAST_FRAME_CONDITIONING", label=""),
                    CandidateAction(id="ACT_APPLY_MULTI_IDENTITY_MASKS", label=""),
                ] if a.id != win_act and a.id != "ACT_DISREGARD_CHARACTER_IDENTITY"}
            },
            provenance_tier="GOLD" if seq <= 18 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
