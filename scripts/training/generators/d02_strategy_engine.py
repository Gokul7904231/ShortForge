"""Domain D02: F01_STRATEGY_ENGINE
Covers mapping user intent across all 11 content engines, ResearchGate rejection
when minimumSources or requireFactCheck fails, novelty/dedup rejection (cosine >= 0.85),
and schedule-derived autonomous topic execution without business quantity hallucination.
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
    "services/pipeline/floor01_strategy/floor01_strategy/app/core/research_gate.py",
    "services/pipeline/floor01_strategy/floor01_strategy/app/core/novelty.py",
    "services/pipeline/floor01_strategy/floor01_strategy/app/domain/handoff.py",
    "apps/web/content-engines/_runtime/workflow-runtime.ts",
    "apps/web/factoryos/core/bridge/Floor01RuntimeAdapter.ts",
    ".okf/principles.md",
]

ENGINES = ["quiz", "coding", "facts", "guess-flag", "guess-logo", "history", "motivation", "news", "psychology", "reddit", "story"]


def generate_d02_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. ResearchGate Rejection (Insufficient Sources or Claims) across engines (11 packets)
    for engine in ENGINES:
        p = make_packet(
            packet_id=f"sf_d02_{seq:03d}",
            domain="D02",
            floor_id="F01",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d02_{seq:03d}",
                content_engine=engine,
                target_duration_sec=30 if "quiz" in engine or "guess" in engine else 60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if engine in ["news", "history", "psychology"] else "MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"ResearchEvidenceGate evaluated upstream F00 passport for engine '{engine}': source_count=1 (min required=2), verified_claim_count=1 (min required=3).",
                    evidence_type="VERIFIED_FACT",
                    ref="research_gate.py:evaluate",
                ),
                VerifiedFact(
                    fact="ResearchGate settings enforce: require_verified_research=True for non-degraded strategy synthesis.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="services/pipeline/floor01_strategy/floor01_strategy/app/core/config.py",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal="ResearchGate score = 0.2800 (threshold = 0.6500) -> BLOCKED", evidence_type="OBSERVED_MEASUREMENT"),
                TelemetryObservation(signal="Blockers: ['Insufficient research source count.', 'Insufficient verified claim count.']", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=["Upstream F00 evidence is insufficient to ground video script."],
            constraints=["Must halt F01 strategy progression and request F00 research corroboration.", "Never fabricate unsupported narrative beats."],
            candidate_actions=[
                CandidateAction(id="ACT_REJECT_GATE_BLOCK", label="Reject F01 strategy synthesis with ResearchGateBlocker and request F00 evidence re-fetch"),
                CandidateAction(id="ACT_BYPASS_RESEARCH_GATE", label="Bypass ResearchGate check and proceed with ungrounded script generation to maintain cadence"),
                CandidateAction(id="ACT_FABRICATE_CLAIMS", label="Synthesize fake citation references to artificially satisfy the minimum_verified_claims threshold"),
            ],
            winning_action_id="ACT_REJECT_GATE_BLOCK",
            rejected_reasons={
                "ACT_BYPASS_RESEARCH_GATE": "INVARIANT_VIOLATION_GATE_BYPASS: F01 cannot proceed when ResearchEvidenceGate fails; violates Principle 4 (Claim <= Evidence).",
                "ACT_FABRICATE_CLAIMS": "SECURITY_VIOLATION_EVIDENCE_FORGERY: Generating fake citation references to bypass gate validation is strictly forbidden.",
            },
            provenance_tier="GOLD" if seq <= 3 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Novelty & Deduplication Rejection (Cosine Distance >= 0.85 / Fingerprint Collision) (8 packets)
    dup_scenarios = [
        ("quiz", "Top 5 Space Facts Quiz", "Top 5 Space Facts Quiz (rendered 2 days ago)", 0.94),
        ("facts", "Why Bananas Are Radioactive", "The Radiation in Bananas Explained", 0.91),
        ("coding", "Python List Comprehensions in 60s", "Master Python List Comprehensions", 0.89),
        ("history", "The Fall of Constantinople 1453", "Constantinople 1453 Siege Summary", 0.96),
        ("psychology", "The Dunning-Kruger Effect Explained", "Why Incompetent People Think They Are Amazing", 0.88),
        ("motivation", "Discipline Over Motivation Speech", "Why Discipline Beats Motivation Every Time", 0.93),
        ("news", "Tech Giant Announces Quantum Breakthrough", "Tech Giant Announces Quantum Breakthrough (exact duplicate title)", 0.99),
        ("reddit", "AITA for throwing away my roommates milk", "AITA for tossing roommates milk after expiration", 0.92),
    ]
    for eng, candidate_title, historical_title, sim_score in dup_scenarios:
        p = make_packet(
            packet_id=f"sf_d02_{seq:03d}",
            domain="D02",
            floor_id="F01",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d02_{seq:03d}",
                content_engine=eng,
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Candidate strategy '{candidate_title}' has semantic cosine similarity {sim_score:.2f} with historical video '{historical_title}'.",
                    evidence_type="VERIFIED_FACT",
                    ref="novelty.py:evaluate_novelty",
                ),
                VerifiedFact(
                    fact="F01 Novelty policy requires semantic similarity < 0.85 to historical channel uploads to prevent YouTube repetitious content flags.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 1 & YouTube Policy Guardian G05",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Novelty filter rejected candidate: similarity {sim_score:.2f} >= threshold 0.85", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Reject repetitive topic and select alternative non-overlapping topic angle."],
            candidate_actions=[
                CandidateAction(id="ACT_REJECT_NOVELTY_DUP", label="Reject topic candidate due to novelty collision (sim >= 0.85) and select alternative distinct topic"),
                CandidateAction(id="ACT_FORCE_PUBLISH_DUP", label="Force publish duplicate topic ignoring channel historical fatigue"),
                CandidateAction(id="ACT_MUTATE_TITLE_ONLY", label="Trivially reword title while keeping identical script body and scene structure"),
            ],
            winning_action_id="ACT_REJECT_NOVELTY_DUP",
            rejected_reasons={
                "ACT_FORCE_PUBLISH_DUP": "POLICY_VIOLATION_REPETITIOUS_CONTENT: Publishing semantically identical content violates YouTube repetitive content guidelines and risks demonetization.",
                "ACT_MUTATE_TITLE_ONLY": "SHALLOW_REPAIR_FORBIDDEN: Superficial title modification without altering underlying narrative content violates F07 creative fatigue invariant.",
            },
            provenance_tier="GOLD" if seq <= 14 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Schedule-Derived Capacity vs Evergreen/Breaking News Classification (6 packets)
    schedule_scenarios = [
        ("Daily schedule requests 5 breaking news shorts, but only 2 authenticated news events occurred in the past 24h", 2, 5, "news"),
        ("Schedule requests 3 coding shorts, but candidate pool has 3 qualified concepts", 3, 3, "coding"),
        ("Schedule requests 4 psychology shorts, candidate pool has only 1 verified research study", 1, 4, "psychology"),
        ("Schedule requests 2 history shorts, candidate pool has 2 peer-reviewed historical topics", 2, 2, "history"),
        ("Schedule requests 5 trivia quiz shorts, candidate pool has 2 non-duplicative quizzes", 2, 5, "quiz"),
        ("Schedule requests 3 reddit story shorts, candidate pool has 3 vetted stories", 3, 3, "reddit"),
    ]
    for desc, valid_count, requested_count, eng in schedule_scenarios:
        has_deficit = valid_count < requested_count
        winning_id = "ACT_REPORT_UNMET_CAPACITY" if has_deficit else "ACT_EXECUTE_MATCHING_SCHEDULE"
        p = make_packet(
            packet_id=f"sf_d02_{seq:03d}",
            domain="D02",
            floor_id="F01",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d02_{seq:03d}",
                content_engine=eng,
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=desc,
                    evidence_type="VERIFIED_FACT",
                    ref=".okf/principles.md:Principle 1 (Schedule-Derived Autonomous Execution)",
                ),
                VerifiedFact(
                    fact="If candidate pool has fewer valid opportunities than requested, system must report explicit unmet capacity; never fabricate synthetic trends or relabel evergreen topics.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 1 Invariant",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Schedule validation: valid={valid_count}, requested={requested_count}, deficit={max(0, requested_count - valid_count)}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Never invent trends to fill schedule gaps.", "Accurately reflect authentic candidate availability."],
            candidate_actions=[
                CandidateAction(id="ACT_REPORT_UNMET_CAPACITY", label=f"Produce exactly {valid_count} valid videos and emit an UnmetCapacityNotice({requested_count - valid_count} unfilled) with explicit reasons"),
                CandidateAction(id="ACT_EXECUTE_MATCHING_SCHEDULE", label=f"Proceed with scheduled production of {valid_count} verified videos"),
                CandidateAction(id="ACT_FABRICATE_EVERGREEN_AS_NEWS", label="Relabel random evergreen topics as breaking news to reach the requested quota"),
                CandidateAction(id="ACT_HALLUCINATE_TRENDS", label="Invent fictional news events to fill the remaining scheduled video slots"),
            ],
            winning_action_id=winning_id,
            rejected_reasons={
                "ACT_FABRICATE_EVERGREEN_AS_NEWS": "INVARIANT_VIOLATION_UNMET_CAPACITY: Relabeling evergreen content as breaking news violates Principle 1 Invariant.",
                "ACT_HALLUCINATE_TRENDS": "INVARIANT_VIOLATION_ERR_HONESTY: Hallucinating news items to meet quota violates telemetry and factual honesty.",
                ("ACT_REPORT_UNMET_CAPACITY" if not has_deficit else "ACT_EXECUTE_MATCHING_SCHEDULE"): "LOGIC_ERROR_SCHEDULE_MISMATCH: Capacity decision must strictly reflect whether a deficit exists.",
            },
            provenance_tier="GOLD" if seq <= 21 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Engine Intent Mapping & Configuration Contracts (5 packets)
    intent_tests = [
        ("User prompt asks for a python debugging tutorial with code highlights", "coding", "CodeSyntaxProfile"),
        ("User prompt asks for a 4-choice trivia game about European capitals", "quiz", "QuizQuestionTemplate"),
        ("User prompt asks for an inspirational speech on overcoming failure", "motivation", "EmotionalCadenceProfile"),
        ("User prompt asks for an unsolved mystery narrative from 19th century", "history", "ArchivalDocumentaryProfile"),
        ("User prompt asks for a personality quiz about cognitive biases", "psychology", "CognitiveBiasEvaluationProfile"),
    ]
    for prompt_desc, target_eng, profile_req in intent_tests:
        p = make_packet(
            packet_id=f"sf_d02_{seq:03d}",
            domain="D02",
            floor_id="F01",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d02_{seq:03d}",
                content_engine=target_eng,
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Prompt intent analysis maps '{prompt_desc}' to content engine '{target_eng}' with profile '{profile_req}'.",
                    evidence_type="VERIFIED_FACT",
                    ref="workflow-runtime.ts:resolveEngineProfile",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Engine router matched intent score: 0.98 for {target_eng}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=[f"Route intent to engine {target_eng} with valid profile {profile_req}."],
            candidate_actions=[
                CandidateAction(id=f"ACT_ROUTE_{target_eng.upper()}", label=f"Route to {target_eng} engine and instantiate {profile_req}"),
                CandidateAction(id="ACT_ROUTE_GENERIC_STORY", label="Fallback to generic story engine discarding specialized engine UI structures"),
                CandidateAction(id="ACT_REJECT_UNRECOGNIZED", label="Reject intent as unparseable despite high confidence match"),
            ],
            winning_action_id=f"ACT_ROUTE_{target_eng.upper()}",
            rejected_reasons={
                "ACT_ROUTE_GENERIC_STORY": "ENGINE_MISMATCH_DEGRADED_EXPERIENCE: Routing specialized format (quiz/code) to generic story loses critical UI components.",
                "ACT_REJECT_UNRECOGNIZED": "ROUTING_ERROR_FALSE_REJECTION: Rejecting a clearly classified intent degrades system reliability.",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
