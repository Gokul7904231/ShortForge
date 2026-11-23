"""Domain D10: AER_EPISTEMIC_LADDER
Covers the Ascalon Epistemic Runtime ladder: DETERMINISTIC -> MICRO (CLM 1.5B) -> PROBE -> DEEP (Ascalon 4B),
Epistemic Value of Information (VOI = ΔP * V - Cost), budget enforcement (maxDeepCalls=2, maxCostUnits=20),
and strict decoupling of model likelihood from epistemic certainty.
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
    "apps/web/factoryos/core/intelligence/epistemic/AEREngine.ts",
    "apps/web/factoryos/core/intelligence/epistemic/EpistemicBudgetController.ts",
    "apps/web/factoryos/core/intelligence/epistemic/ProbePlanner.ts",
    "apps/web/factoryos/tests/epistemic/aer.test.ts",
    ".okf/intelligence/aer.md",
    ".okf/intelligence/ascalon-model.md",
]


def generate_d10_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Deterministic / Confirmed State routing (GOLD)
    scenarios_deterministic = [
        ("artifact_sha_match", "Artifact SHA-256 matches verified ledger receipt", "sha256:d10e... verified on CAS", "ACT_ROUTE_DETERMINISTIC_BYPASS"),
        ("exact_policy_gate", "YouTube Shorts aspect ratio is 1080x1920 (9:16) verified by container parser", "aspect_ratio: 9:16", "ACT_ROUTE_DETERMINISTIC_PASS"),
        ("precomputed_cache_hit", "Audio waveform cache hit with matching content hash in Redis", "cache_hit: true", "ACT_ROUTE_DETERMINISTIC_CACHE_RETURN"),
        ("verified_author_signature", "Ed25519 signature on F07 receipt validated against verified authority pubkey", "sig_valid: true", "ACT_ROUTE_DETERMINISTIC_ALLOW"),
        ("deterministic_transcode_target", "Target codec is H.264 High Profile 1080x1920 30fps without ambiguity", "codec: h264", "ACT_ROUTE_DETERMINISTIC_TRANSCODE"),
    ]
    for sc_id, desc, fact_stmt, win_act in scenarios_deterministic:
        p = make_packet(
            packet_id=f"D10-AER-{seq:03d}",
            domain="D10_AER_EPISTEMIC_LADDER",
            floor_id="F01_TO_F07_ORCHESTRATION",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d10-det-{seq:03d}",
                content_engine="quiz",
                risk_level="LOW",
            ),
            verified_facts=[
                VerifiedFact(fact=fact_stmt, evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact="Epistemic state is CONFIRMED with zero unresolved contradictions", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[3]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"epistemic_mode_requested: {desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[],
            constraints=["Deterministic / confirmed state MUST bypass deep cognitive invocation entirely"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Route deterministically without invoking neural models ({win_act})"),
                CandidateAction(id="ACT_ROUTE_DEEP_ASCALON", label="Invoke Ascalon 4B Deep cognitive synthesizer"),
                CandidateAction(id="ACT_ROUTE_MICRO_CLM", label="Invoke CLM 1.5B fast classifier head"),
                CandidateAction(id="ACT_DISPATCH_PROBE", label="Dispatch targeted sensor probe"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ROUTE_DEEP_ASCALON": "INVARIANT_VIOLATION_CONFIRMED_ROUTED_TO_DEEP: Epistemic state is already CONFIRMED; invoking 4B deep cognition violates zero-waste compute law",
                "ACT_ROUTE_MICRO_CLM": "INVARIANT_VIOLATION_UNNECESSARY_MODEL_CALL: State is mathematically verified; neural classifier invocation is redundant and ungrounded",
                "ACT_DISPATCH_PROBE": "INVARIANT_VIOLATION_SUPERFLUOUS_PROBE: No hypotheses are pending falsification",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. VOI Routing: Low Value / Single Hypothesis -> MICRO (CLM 1.5B)
    scenarios_micro = [
        ("timing_minor_drift", "Audio timing discrepancy is 42ms (below 100ms threshold)", 0.005, "ACT_ROUTE_MICRO_DECISION"),
        ("font_pairing_heuristic", "Minor aesthetic subtitle weight selection with known design tokens", 0.008, "ACT_ROUTE_MICRO_DECISION"),
        ("pacing_speed_clamp", "Pacing speed adjustment between 145 and 150 WPM", 0.003, "ACT_ROUTE_MICRO_DECISION"),
        ("quiz_color_preset", "Background card gradient variant selection among 3 approved tokens", 0.002, "ACT_ROUTE_MICRO_DECISION"),
        ("thumbnail_crop_centering", "Slight 2% vertical offset for face landmark centering", 0.007, "ACT_ROUTE_MICRO_DECISION"),
    ]
    for sc_id, desc, voi_val, win_act in scenarios_micro:
        p = make_packet(
            packet_id=f"D10-AER-{seq:03d}",
            domain="D10_AER_EPISTEMIC_LADDER",
            floor_id="F02_OR_F05_COGNITION",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d10-micro-{seq:03d}",
                content_engine="quiz",
                risk_level="LOW",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Calibrated Ascalon VOI is {voi_val} (minimumNetValue threshold is 0.01)", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[3]),
                VerifiedFact(fact="Single hypothesis pending with low consequence score", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"context: {desc}, calculated_voi: {voi_val}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Minor uncertainty: {desc}"],
            constraints=["When VOI < minimumNetValue (0.01), escalation to Ascalon DEEP is strictly forbidden"],
            candidate_actions=[
                CandidateAction(id=win_act, label="Dispatch to CLM 1.5B micro-decision head under bounded latency"),
                CandidateAction(id="ACT_ESCALATE_DEEP_ASCALON", label="Escalate to Ascalon 4B Deep cognition"),
                CandidateAction(id="ACT_ABORT_PIPELINE", label="Fail-closed pipeline termination"),
                CandidateAction(id="ACT_DISPATCH_PROBES_BATCH", label="Spawn 5 parallel sensor probes"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ESCALATE_DEEP_ASCALON": "INVARIANT_VIOLATION_VOI_NEGATIVE: Ascalon VOI (0.00X) is below 0.01 minimum net value threshold; escalating wastes deep call budget",
                "ACT_ABORT_PIPELINE": "POLICY_VIOLATION_PREMATURE_ABORT: Minor bounded uncertainty can be safely resolved by CLM micro head",
                "ACT_DISPATCH_PROBES_BATCH": "BUDGET_EXCEEDED_PROBE_COUNT: Spawning batch probes for sub-threshold VOI violates epistemic budget allocation",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. High VOI / Complex Multi-Hypothesis -> Escalate to Ascalon DEEP (4B)
    scenarios_deep = [
        ("structural_narrative_repair", "Script pacing and claim grounding failed F02 check across 3 scenes", 0.35, "ACT_ESCALATE_ASCALON_DEEP"),
        ("asset_continuity_contradiction", "Character face vector distance is 0.72 across Scene 1 and Scene 4", 0.48, "ACT_ESCALATE_ASCALON_DEEP"),
        ("composition_layout_collision", "Multiple overlapping animated layers cause bounding box occlusion", 0.28, "ACT_ESCALATE_ASCALON_DEEP"),
        ("quiz_ambiguity_remedy", "Quiz options have semantic overlap requiring question restructuring", 0.42, "ACT_ESCALATE_ASCALON_DEEP"),
        ("cross_modal_desync", "Audio beat drops misaligned with caption keyframe animation by 800ms", 0.31, "ACT_ESCALATE_ASCALON_DEEP"),
    ]
    for sc_id, desc, voi_val, win_act in scenarios_deep:
        p = make_packet(
            packet_id=f"D10-AER-{seq:03d}",
            domain="D10_AER_EPISTEMIC_LADDER",
            floor_id="F02_F04_F06_SYNTHESIS",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d10-deep-{seq:03d}",
                content_engine="history",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Ascalon VOI is {voi_val} (exceeds 0.01 threshold significantly)", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[3]),
                VerifiedFact(fact="Deep call budget status: 0 of 2 calls consumed (budget available)", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"unresolved_conflict: {desc}, voi: {voi_val}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Multi-hypothesis structural conflict: {desc}"],
            constraints=["Deep call budget must not exceed 2 calls per mission", "Ascalon coarse-to-fine structure must be enforced"],
            candidate_actions=[
                CandidateAction(id=win_act, label="Escalate to Ascalon 4B Deep cognitive synthesizer via coarse-to-fine planning"),
                CandidateAction(id="ACT_FORCE_MICRO_HEURISTIC", label="Force CLM 1.5B micro heuristic decision"),
                CandidateAction(id="ACT_SKIP_SYNTHESIS", label="Skip scene synthesis and proceed with corrupted layout"),
                CandidateAction(id="ACT_SPAWN_UNBOUNDED_RETRIES", label="Loop 10 times attempting random mutations"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_FORCE_MICRO_HEURISTIC": "CAPABILITY_MISMATCH_ERROR: Complex multi-hypothesis structural contradiction exceeds CLM 1.5B decision capacity and risks catastrophic generation failure",
                "ACT_SKIP_SYNTHESIS": "QUALITY_VIOLATION_CORRUPTED_PIPELINE: Proceeding with corrupted layout violates Floor verification invariants",
                "ACT_SPAWN_UNBOUNDED_RETRIES": "BUDGET_EXCEEDED_MAX_RETRIES: Random retry loops violate deterministic budget bounds",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Epistemic Budget Exhaustion / Over-limit Enforcements (CURRICULUM_GOLD)
    scenarios_budget_exhaustion = [
        ("deep_calls_limit_reached", "Mission has already consumed 2 deep calls (maxDeepCalls=2)", "maxDeepCalls reached", "ACT_FALLBACK_DETERMINISTIC_SAFE_DEFAULT"),
        ("epistemic_timeout", "Epistemic exploration time reached 4950ms (maxEpistemicTimeMs=5000)", "epistemic budget time exhausted", "ACT_CLAMP_EPISTEMIC_WINDOW"),
        ("probe_count_ceiling", "Probe count reached 5 (maxProbeCount=5)", "maxProbeCount reached", "ACT_HALT_PROBING_DECIDE"),
        ("cost_units_ceiling", "Cost units consumed is 19.8 (maxCostUnits=20)", "cost units exhausted", "ACT_ENFORCE_HARD_COST_CEILING"),
        ("model_confidence_uncalibrated", "Model likelihood is 0.98 but evidence ledger has 0 verified citations", "model confidence ungrounded", "ACT_REJECT_UNGROUNDED_CONFIDENCE"),
    ]
    for sc_id, desc, signal_val, win_act in scenarios_budget_exhaustion:
        p = make_packet(
            packet_id=f"D10-AER-{seq:03d}",
            domain="D10_AER_EPISTEMIC_LADDER",
            floor_id="EPISTEMIC_BUDGET_CONTROLLER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d10-curr-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Epistemic budget constraint breached: {signal_val}", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="Confidence != Permission: Uncalibrated probabilistic score cannot override deterministic boundaries", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[5]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"telemetry: {desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Budget breach risk: {desc}"],
            constraints=["Hard stop on epistemic expansion when budget limits are breached"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Enforce fail-closed budget boundary ({win_act})"),
                CandidateAction(id="ACT_INVOKE_THIRD_DEEP_CALL", label="Invoke 3rd Ascalon deep call by overriding budget"),
                CandidateAction(id="ACT_TRUST_RAW_MODEL_PROBABILITY", label="Trust raw 0.98 model probability without ground evidence"),
                CandidateAction(id="ACT_IGNORE_EPISTEMIC_TIMEOUT", label="Extend timeout by 10 seconds asynchronously"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_INVOKE_THIRD_DEEP_CALL": "BUDGET_EXCEEDED_DEEP_CALLS: maxDeepCalls=2 is a hard invariant; 3rd call rejected unconditionally",
                "ACT_TRUST_RAW_MODEL_PROBABILITY": "GOVERNANCE_VIOLATION_CONFIDENCE_AS_PERMISSION: High model likelihood is decoupled from epistemic grounding and cannot bypass verification",
                "ACT_IGNORE_EPISTEMIC_TIMEOUT": "INVARIANT_VIOLATION_TIMEOUT_LEAK: Epistemic exploration window must terminate at 5000ms bound",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. Targeted Probing Decisions (CURRICULUM_GOLD)
    scenarios_probe = [
        ("probe_codec_support", "Unknown whether Box4 supports NVENC h264 or VAAPI", "ACT_DISPATCH_PROBE_HARDWARE"),
        ("probe_url_status", "Asset URL Reachability unconfirmed in Wikimedia cache", "ACT_DISPATCH_PROBE_HEAD_REQUEST"),
        ("probe_audio_duration", "Synthesized TTS WAV file byte length needs exact FFprobe duration", "ACT_DISPATCH_PROBE_FFPROBE"),
        ("probe_cache_key_freshness", "Composition track layer cache validity requires CAS hash query", "ACT_DISPATCH_PROBE_CAS_LOOKUP"),
        ("probe_subframe_alignment", "Keyframe position requires subframe rational clock computation", "ACT_DISPATCH_PROBE_TIMEBASE_CHECK"),
    ]
    for sc_id, desc, win_act in scenarios_probe:
        p = make_packet(
            packet_id=f"D10-AER-{seq:03d}",
            domain="D10_AER_EPISTEMIC_LADDER",
            floor_id="EPISTEMIC_PROBE_PLANNER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d10-probe-{seq:03d}",
                content_engine="quiz",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(fact="Pending hypothesis can be decisively falsified by single deterministic probe", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[2]),
                VerifiedFact(fact="Probe cost units: 0.2, maxProbeCount remaining: 3", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"hypothesis_pending: {desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Unverified physical state: {desc}"],
            constraints=["Probes must be non-destructive, read-only, and bounded to < 200ms execution"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Dispatch isolated targeted sensor probe ({win_act})"),
                CandidateAction(id="ACT_GUESS_PROBABILITY", label="Guess outcome probabilistically using LLM"),
                CandidateAction(id="ACT_LAUNCH_FULL_RENDER", label="Launch full GPU render without checking hardware support"),
                CandidateAction(id="ACT_MUTATE_SYSTEM_CONFIG", label="Modify host system configuration to force setting"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_GUESS_PROBABILITY": "INVARIANT_VIOLATION_ERR_HONESTY: Guessing verifiable physical state when a cheap sensor probe is available violates epistemic rigor",
                "ACT_LAUNCH_FULL_RENDER": "RESOURCE_RISK_ERROR: Blind rendering without hardware verification risks container OOM or driver crash",
                "ACT_MUTATE_SYSTEM_CONFIG": "SECURITY_VIOLATION_UNAUTHORIZED_MUTATION: Mutating host configuration breaches immutable runtime policy",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
