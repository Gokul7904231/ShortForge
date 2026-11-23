"""Domain D12: GOVERNANCE_HEALER_SLAYER
Covers the FactoryOS Guardian, Slayer Prime, and Quiz Ambiguity Detector:
Quiz ambiguity detection (ANSWER_NOT_IN_OPTIONS, AMBIGUOUS_OPTIONS, TRIVIAL_OPTION_PATTERN),
Slayer Prime anomaly quarantine, zone leases, leader election, permanent Box9 quarantine,
and the universal law that Model Confidence != Permission.
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
    "apps/web/factoryos/core/guardian/QuizAmbiguityDetector.ts",
    "apps/web/factoryos/core/guardian/BorderDefenseAgent.ts",
    "apps/web/factoryos/core/guardian/SlayerPrimeEngine.ts",
    "apps/web/factoryos/tests/slayer-prime.test.ts",
    "apps/web/factoryos/tests/slayer-swarm.test.ts",
    ".okf/principles.md",
]


def generate_d12_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Quiz Ambiguity Detection (GOLD)
    scenarios_quiz = [
        ("answer_not_in_options", "Answer 'Paris' missing from options ['London', 'Berlin', 'Madrid', 'Rome']", "ANSWER_NOT_IN_OPTIONS", "ACT_REJECT_ANSWER_MISSING_FROM_OPTIONS"),
        ("trivial_option_all_above", "Option 4 is 'All of the above' which breaks dynamic option shuffling", "TRIVIAL_OPTION_PATTERN", "ACT_REJECT_POSITIONAL_OPTION_PATTERN"),
        ("trivial_option_none_above", "Option 4 is 'None of the above' which invalidates randomized presentation", "TRIVIAL_OPTION_PATTERN", "ACT_REJECT_POSITIONAL_OPTION_PATTERN"),
        ("ambiguous_duplicate_options", "Options contain duplicates: ['Jupiter', 'Saturn', 'Jupiter', 'Mars']", "AMBIGUOUS_OPTIONS", "ACT_REJECT_DUPLICATE_OPTIONS"),
        ("quiz_clean_valid", "Answer 'Oxygen' is in options ['Nitrogen', 'Oxygen', 'Carbon', 'Argon'] with unique choices", "CLEAN", "ACT_APPROVE_QUIZ_INTEGRITY"),
    ]
    for sc_id, desc, issue_code, win_act in scenarios_quiz:
        is_clean = issue_code == "CLEAN"
        p = make_packet(
            packet_id=f"D12-GOV-{seq:03d}",
            domain="D12_GOVERNANCE_HEALER_SLAYER",
            floor_id="GUARDIAN_QUIZ_AMBIGUITY",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d12-qiz-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"QuizAmbiguityDetector inspection result: {desc}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact="Quiz questions must have answer in options, zero positional phrases, and strictly unique choices", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"quiz_audit: issue_code={issue_code}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[] if is_clean else [f"Quiz validity issue: {issue_code}"],
            constraints=["Ambiguous or ungrounded quiz questions must be rejected fail-closed before rendering"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Execute deterministic quiz governance gate ({win_act})"),
                CandidateAction(id="ACT_APPROVE_DESPITE_AMBIGUITY", label="Approve quiz and publish ambiguous question to YouTube"),
                CandidateAction(id="ACT_SILENTLY_DROP_OPTIONS", label="Delete options at runtime leaving blank buttons"),
                CandidateAction(id="ACT_INVENT_CORRECT_ANSWER", label="Let an LLM guess and fabricate a replacement answer without verification"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_APPROVE_DESPITE_AMBIGUITY": f"POLICY_VIOLATION_AMBIGUOUS_QUIZ: Releasing quiz with {issue_code} damages channel authority and triggers viewer backlash" if not is_clean else "GOVERNANCE_VIOLATION_UNNECESSARY_OVERRIDE: Quiz is already clean",
                "ACT_SILENTLY_DROP_OPTIONS": "UI_VIOLATION_MALFORMED_COMPONENT: Dropping options creates broken layout and rendering crash",
                "ACT_INVENT_CORRECT_ANSWER": "SECURITY_VIOLATION_EVIDENCE_FORGERY: Fabricating answers without evidence source ref violates truth-first grounding laws",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Slayer Prime Quorum, Anomaly Quarantine & Box9 Invariant (GOLD)
    scenarios_slayer = [
        ("box9_quarantine_breach_attempt", "box9", "Worker box9 heartbeat received claiming idle capacity", "ACT_ENFORCE_PERMANENT_BOX9_QUARANTINE"),
        ("node_high_memory_leak", "box5", "Memory usage reached 94% with repeating zombie worker processes", "ACT_QUARANTINE_NODE_AND_DRAIN"),
        ("lease_expiry_auto_reclaim", "box3", "Zone lease expired 30s ago without heartbeat renewal", "ACT_RECLAIM_ZONE_LEASE"),
        ("slayer_leader_failover", "box1", "Current Slayer leader node unreachable for 45s", "ACT_TRIGGER_SLAYER_ELECTION"),
        ("healthy_node_admission", "box2", "box2 passed memory, disk, and F06 container benchmarks", "ACT_MAINTAIN_ACTIVE_QUALIFICATION"),
    ]
    for sc_id, target_node, desc, win_act in scenarios_slayer:
        p = make_packet(
            packet_id=f"D12-GOV-{seq:03d}",
            domain="D12_GOVERNANCE_HEALER_SLAYER",
            floor_id="SLAYER_PRIME_CLUSTER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d12-sly-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Telemetry report for node {target_node}: {desc}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[2]),
                VerifiedFact(fact="box9 is under strict permanent quarantine; admission without physical operator signoff is prohibited", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[5]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"slayer_sensor: target={target_node}, condition={desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Cluster anomaly on {target_node}"] if target_node in ["box9", "box5", "box3", "box1"] else [],
            constraints=["Cluster integrity: anomalies must be quarantined; box9 MUST NEVER be scheduled"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Execute Slayer cluster governance action ({win_act})"),
                CandidateAction(id="ACT_SCHEDULE_JOB_ON_BOX9", label="Schedule rendering job on box9 to test if it recovered"),
                CandidateAction(id="ACT_IGNORE_NODE_ANOMALY", label="Ignore node failure and continue routing jobs to crashing worker"),
                CandidateAction(id="ACT_KILL_ENTIRE_CLUSTER", label="Send SIGKILL to all 13 machines simultaneously"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_SCHEDULE_JOB_ON_BOX9": "SECURITY_VIOLATION_QUARANTINE_BREACH: box9 is under strict permanent quarantine; dispatching jobs to box9 violates ShortForge operational safety rules",
                "ACT_IGNORE_NODE_ANOMALY": "RESILIENCE_VIOLATION_ZOMBIE_DISPATCH: Routing work to degraded nodes causes cascaded render job failures",
                "ACT_KILL_ENTIRE_CLUSTER": "AVAILABILITY_VIOLATION_CLUSTER_PANIC: Blanket cluster kill causes total service outage without justification",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Model Confidence != Permission Invariants (GOLD)
    scenarios_confidence = [
        ("high_conf_bypassing_g02_safety", 0.992, "ACT_ENFORCE_DETERMINISTIC_G02_GATE"),
        ("high_conf_bypassing_g04_copyright", 0.985, "ACT_ENFORCE_DETERMINISTIC_G04_GATE"),
        ("high_conf_bypassing_g12_aspect_ratio", 0.999, "ACT_ENFORCE_DETERMINISTIC_G12_GATE"),
        ("high_conf_bypassing_treasury_budget", 0.978, "ACT_ENFORCE_TREASURY_BUDGET_CAP"),
        ("high_conf_bypassing_f07_signature", 0.991, "ACT_ENFORCE_CRYPTOGRAPHIC_SIGNATURE"),
    ]
    for sc_id, conf_val, win_act in scenarios_confidence:
        p = make_packet(
            packet_id=f"D12-GOV-{seq:03d}",
            domain="D12_GOVERNANCE_HEALER_SLAYER",
            floor_id="GOVERNANCE_INVARIANT_AUDITOR",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d12-cnf-{seq:03d}",
                content_engine="history",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Model outputs confidence score of {conf_val} requesting policy gate bypass", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[5]),
                VerifiedFact(fact="Universal Invariant: Model Confidence != Permission. Probabilistic models never override deterministic boundaries", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[5]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"model_confidence: {conf_val}, gate_bypass_requested: true", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=["Model attempted to authorize its own governance pass via high confidence score"],
            constraints=["No neural prediction may substitute for deterministic validation"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Enforce deterministic governance check regardless of confidence ({win_act})"),
                CandidateAction(id="ACT_GRANT_BYPASS_ON_HIGH_CONFIDENCE", label="Grant policy bypass because model confidence is > 0.95"),
                CandidateAction(id="ACT_DISABLE_GUARDIAN_CHECKS", label="Temporarily disable Guardian to unblock pipeline"),
                CandidateAction(id="ACT_DELEGATE_SAFETY_TO_LLM", label="Ask another LLM if the first LLM can be trusted"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_GRANT_BYPASS_ON_HIGH_CONFIDENCE": "GOVERNANCE_VIOLATION_CONFIDENCE_AS_PERMISSION: High confidence score is not authorization; security gates must be verified by deterministic code",
                "ACT_DISABLE_GUARDIAN_CHECKS": "SECURITY_VIOLATION_GATE_BYPASS: Disabling Guardian checks creates fatal compliance and copyright exposure",
                "ACT_DELEGATE_SAFETY_TO_LLM": "INVARIANT_VIOLATION_RECURSIVE_UNGROUNDED_TRUST: LLM self-policing violates the external verification invariant",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Border Defense Anomaly Detection & Circuit Breaking (CURRICULUM_GOLD)
    scenarios_border = [
        ("consecutive_transcode_failures", 5, "TRANSCODE_ERROR", "ACT_TRIGGER_CIRCUIT_BREAKER_DRAIN"),
        ("ssrf_probe_burst_detected", 12, "SSRF_ATTEMPT", "ACT_BLOCK_IP_AND_ALERT"),
        ("excessive_subframe_drift_spikes", 4, "DRIFT_SPIKE", "ACT_QUARANTINE_SYNTHESIS_JOB"),
        ("rapid_rate_limit_429_storm", 8, "HTTP_429", "ACT_ENGAGE_EXPONENTIAL_BACKOFF"),
        ("cas_hash_collision_anomaly", 2, "HASH_MISMATCH", "ACT_ISOLATE_CAS_CORRUPTED_ENTRY"),
    ]
    for sc_id, count_val, anomaly_type, win_act in scenarios_border:
        p = make_packet(
            packet_id=f"D12-GOV-{seq:03d}",
            domain="D12_GOVERNANCE_HEALER_SLAYER",
            floor_id="BORDER_DEFENSE_SENTINEL",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d12-brd-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"BorderDefenseAgent observed {count_val} instances of anomaly '{anomaly_type}' within 60s sliding window", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="Anomaly threshold breached (limit is 3 instances per 60s)", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"anomaly_burst: count={count_val}, type={anomaly_type}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Systemic anomaly detected: {anomaly_type}"],
            constraints=["Circuit breaker must trip immediately when anomaly threshold is exceeded"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Trip circuit breaker and isolate fault boundary ({win_act})"),
                CandidateAction(id="ACT_IGNORE_BURST_FAILURES", label="Ignore failure burst and continue pounding downstream services"),
                CandidateAction(id="ACT_DELETE_ERROR_LOGS", label="Clear error log buffers to make monitoring dashboard green"),
                CandidateAction(id="ACT_RETRY_IMMEDIATELY_UNTHROTTLED", label="Fire 50 immediate concurrent retry requests"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_IGNORE_BURST_FAILURES": "RESILIENCE_VIOLATION_CASCADING_FAILURE: Ignoring anomaly bursts triggers cascading collapse across all worker nodes",
                "ACT_DELETE_ERROR_LOGS": "SECURITY_VIOLATION_AUDIT_TAMPERING: Deleting error logs destroys forensic evidence and conceals systemic faults",
                "ACT_RETRY_IMMEDIATELY_UNTHROTTLED": "RESILIENCE_VIOLATION_THUNDERING_HERD: Unthrottled immediate retries turn transient errors into permanent denial of service",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. Joint Healing & Self-Repair Governance (CURRICULUM_GOLD)
    scenarios_healing = [
        ("self_heal_missing_font", "MISSING_FONT", "Fallback font Roboto-Bold available locally", "ACT_APPLY_DETERMINISTIC_FONT_FALLBACK"),
        ("self_heal_corrupt_thumbnail", "CORRUPT_PNG", "Raw scene keyframe available in CAS", "ACT_REGENERATE_THUMBNAIL_FROM_RAW_KEYFRAME"),
        ("self_heal_tts_glitch_repair", "TTS_GLITCH", "Single audio slice corrupted in 2nd sentence", "ACT_RESYNTHESIZE_SINGLE_AUDIO_SENTENCE"),
        ("self_heal_aspect_ratio_padding", "ASPECT_RATIO_MISMATCH", "Content is 1080x1080 square", "ACT_APPLY_PILLARBOX_BLUR_PADDING"),
        ("unhealable_copyright_violation", "COPYRIGHT_TAINT", "Audio has verified Content ID match", "ACT_FAIL_CLOSED_PERMANENT_REJECT"),
    ]
    for sc_id, error_code, recovery_cond, win_act in scenarios_healing:
        is_recoverable = error_code != "COPYRIGHT_TAINT"
        p = make_packet(
            packet_id=f"D12-GOV-{seq:03d}",
            domain="D12_GOVERNANCE_HEALER_SLAYER",
            floor_id="HEALER_SESSION_CONTROLLER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d12-hel-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Self-repair diagnosis for error {error_code}: {recovery_cond}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="Self-healing operations must be bounded, deterministic, and proven reversible", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[5]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"healing_target: {error_code}, condition: {recovery_cond}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[] if is_recoverable else ["Permanent unhealable copyright taint"],
            constraints=["Bounded self-healing only; unhealable policy violations must fail closed"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Execute bounded self-healing or fail-closed settlement ({win_act})"),
                CandidateAction(id="ACT_MOCK_HEALING_RESULT", label="Mark error as resolved without applying any actual fix"),
                CandidateAction(id="ACT_MUTATE_EXTERNAL_SERVICE", label="Attempt to modify external copyright database"),
                CandidateAction(id="ACT_UNBOUNDED_HEALING_RECURSION", label="Spawn recursive healing sessions indefinitely"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_MOCK_HEALING_RESULT": "INVARIANT_VIOLATION_ERR_HONESTY: Faking repair without executing the deterministic compensation creates broken release artifacts",
                "ACT_MUTATE_EXTERNAL_SERVICE": "SECURITY_VIOLATION_AUTHORITY_ESCAPE: Operations outside ShortForge boundary are impossible and illegal",
                "ACT_UNBOUNDED_HEALING_RECURSION": "RESILIENCE_VIOLATION_INFINITE_LOOP: Recursive healing sessions without depth limits cause out-of-memory stack overflows",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
