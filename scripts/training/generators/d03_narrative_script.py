"""Domain D03: F02_NARRATIVE_SCRIPT
Covers ScriptIR causal dependency repair, 130-160 words/60s pacing boundary violations,
strict_rejection handling, evidence-to-scene claim grounding, and localized scene regeneration
without mutating F00/F01.
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
    "services/pipeline/floor02_scripting/app/domain/script_ir.py",
    "services/pipeline/floor02_scripting/app/domain/script_models.py",
    "apps/web/factoryos/core/adapters/Floor02RuntimeAdapter.ts",
    ".okf/principles.md",
]


def generate_d03_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Pacing Contract: 130-160 words per 60 seconds (Pacing boundary violations) (8 packets)
    pacing_tests = [
        (220, 60, "Severe pacing overflow: 220 words in 60s exceeds upper limit of 160 words (3.67 words/sec)"),
        (90, 60, "Pacing underflow: 90 words in 60s is below lower limit of 130 words (1.5 words/sec), causes dead air"),
        (145, 60, "Optimal pacing: 145 words in 60s (2.42 words/sec) is within 130-160 bounds"),
        (80, 30, "Optimal 30s pacing: 80 words in 30s (160 words/60s normalized pace) is within bounds"),
        (120, 30, "Severe 30s pacing overflow: 120 words in 30s corresponds to 240 words/60s (4.0 words/sec)"),
        (40, 30, "Pacing underflow for 30s: 40 words corresponds to 80 words/60s, leaves excessive empty air"),
        (155, 60, "High-tempo optimal: 155 words in 60s (within 130-160 bounds)"),
        (132, 60, "Deliberate narrative pace: 132 words in 60s (within 130-160 bounds)"),
    ]
    for word_count, target_sec, desc in pacing_tests:
        wpm = (word_count / target_sec) * 60
        is_valid = 130 <= wpm <= 160
        winning_id = "ACT_APPROVE_PACING" if is_valid else ("ACT_CONDENSE_SCRIPT" if wpm > 160 else "ACT_EXPAND_SCRIPT")

        p = make_packet(
            packet_id=f"sf_d03_{seq:03d}",
            domain="D03",
            floor_id="F02",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d03_{seq:03d}",
                content_engine="history" if target_sec == 60 else "quiz",
                target_duration_sec=target_sec,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM" if not is_valid else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Script text contains {word_count} words for a {target_sec}s target duration (normalized {wpm:.1f} words/60s).",
                    evidence_type="VERIFIED_FACT",
                    ref="Floor02RuntimeAdapter.ts:validateScriptPacing",
                ),
                VerifiedFact(
                    fact="F02 Pacing contract requires 130 to 160 words per 60 seconds (2.16 - 2.67 words/sec) to ensure intelligible narration without audio clipping or dead air.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="services/pipeline/floor02_scripting/app/domain/script_ir.py:PacingContract",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Pacing metric: {wpm:.1f} WPM, bounds=[130, 160], status={'VALID' if is_valid else 'VIOLATION'}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Enforce strict pacing boundaries [130, 160] WPM.", "Refuse ungrounded script expansion or over-compression."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_PACING", label="Approve script pacing as compliant with the 130-160 words/60s standard"),
                CandidateAction(id="ACT_CONDENSE_SCRIPT", label="Trigger targeted scene condensation to prune non-essential adjectives and trim word count to 145 words"),
                CandidateAction(id="ACT_EXPAND_SCRIPT", label="Expand exposition with additional contextual evidence to raise pacing into the 130-160 range"),
                CandidateAction(id="ACT_SPEEDUP_AUDIO_BLIND", label="Rely on audio stretch (> 1.25x) downstream in F04 to fit bloated script into timeline"),
            ],
            winning_action_id=winning_id,
            rejected_reasons={
                "ACT_SPEEDUP_AUDIO_BLIND": "TIMING_VIOLATION_AUDIO_DISTORTION: Relying on downstream voice stretching > 1.05x causes chipmunk pitch distortion and violates F04 limits.",
                ("ACT_APPROVE_PACING" if not is_valid else "ACT_CONDENSE_SCRIPT"): "PACING_ERROR_MISCLASSIFICATION: Action does not match evaluated script pacing status.",
                ("ACT_EXPAND_SCRIPT" if wpm >= 130 else "ACT_CONDENSE_SCRIPT"): "PACING_ERROR_WRONG_DIRECTION: Expansion requested on an already overflowing or valid script.",
            },
            provenance_tier="GOLD" if seq <= 3 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Causal Dependency Graph Repair in ScriptIR (8 packets)
    causal_scenarios = [
        ("Scene 3 refers to event E2 before event E2 occurs in Scene 4", "Cycle/Reverse Temporal Dependency in NarrativeBeat", "ACT_REORDER_CAUSAL_BEATS"),
        ("Scene 5 introduces character 'Dr. Aris' speaking as if known, but introduction beat was deleted", "Dangling Character Reference in NarrativeState", "ACT_RESTORE_INTRO_BEAT"),
        ("Scene 2 introduces discovery of lost tomb, Scene 3 explains discovery details, correctly linked", "Valid Causal Sequence", "ACT_APPROVE_CAUSAL_GRAPH"),
        ("Scene 4 reveals murder mystery solution, but evidence beat in Scene 2 was omitted", "Unresolved Narrative Promise in ViewerState", "ACT_INJECT_EVIDENCE_BEAT"),
        ("Scene 1 hook promises 'secret of the pyramids', final Scene 6 ends without payoff", "Open Narrative Loop Violation in ViewerState", "ACT_REPAIR_PAYOFF_BEAT"),
        ("Scene 3 causal event references non-existent event_id 'evt_999'", "Broken Foreign Key in CausalEvent", "ACT_RELINK_EXISTING_CAUSAL_EVENT"),
        ("Scene 2 state_after contradicts Scene 3 state_before regarding object possession", "Inconsistent NarrativeState across boundary", "ACT_RECONCILE_STATE_TRANSITION"),
        ("Valid 4-beat quiz progression: Hook -> Question -> Countdown -> Answer Reveal", "Compliant Quiz Beat Structure", "ACT_APPROVE_CAUSAL_GRAPH"),
    ]
    for desc, failure_type, winning_act in causal_scenarios:
        p = make_packet(
            packet_id=f"sf_d03_{seq:03d}",
            domain="D03",
            floor_id="F02",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d03_{seq:03d}",
                content_engine="story" if "mystery" in desc or "pyramids" in desc else "history",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"ScriptIR causal validator analyzed narrative graph: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="script_ir.py:NarrativeBeat.validate_causal_graph",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Causal graph status: {failure_type}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Causal consistency issue: {failure_type}" if "Valid" not in failure_type else ""],
            constraints=["Preserve strict chronological and causal monotonicity.", "Ensure every narrative beat has verifiable preconditions."],
            candidate_actions=[
                CandidateAction(id="ACT_REORDER_CAUSAL_BEATS", label="Re-order narrative beats so cause events strictly precede effect events in the DAG"),
                CandidateAction(id="ACT_RESTORE_INTRO_BEAT", label="Inject prerequisite character establishment beat into scene sequence"),
                CandidateAction(id="ACT_APPROVE_CAUSAL_GRAPH", label="Approve ScriptIR causal graph as logically sound and monotonic"),
                CandidateAction(id="ACT_INJECT_EVIDENCE_BEAT", label="Insert necessary evidentiary clue beat into exposition to ground the climax"),
                CandidateAction(id="ACT_REPAIR_PAYOFF_BEAT", label="Close open narrative loop by adding resolving payoff beat in final scene"),
                CandidateAction(id="ACT_RELINK_EXISTING_CAUSAL_EVENT", label="Repair dangling causal foreign key by referencing valid upstream event"),
                CandidateAction(id="ACT_RECONCILE_STATE_TRANSITION", label="Reconcile world_facts and state_before to align with preceding scene outcome"),
                CandidateAction(id="ACT_IGNORE_CAUSAL_BREAK", label="Ignore causal incoherence and proceed to render video with disordered narrative"),
            ],
            winning_action_id=winning_act,
            rejected_reasons={
                "ACT_IGNORE_CAUSAL_BREAK": "NARRATIVE_VIOLATION_INCOHERENCE: Proceeding with broken causal graph produces nonsensical video that fails audience retention.",
                **{a.id: f"CAUSAL_REPAIR_MISMATCH: Action '{a.id}' does not resolve specific defect '{failure_type}'." for a in [
                    CandidateAction(id="ACT_REORDER_CAUSAL_BEATS", label=""),
                    CandidateAction(id="ACT_RESTORE_INTRO_BEAT", label=""),
                    CandidateAction(id="ACT_APPROVE_CAUSAL_GRAPH", label=""),
                    CandidateAction(id="ACT_INJECT_EVIDENCE_BEAT", label=""),
                    CandidateAction(id="ACT_REPAIR_PAYOFF_BEAT", label=""),
                    CandidateAction(id="ACT_RELINK_EXISTING_CAUSAL_EVENT", label=""),
                    CandidateAction(id="ACT_RECONCILE_STATE_TRANSITION", label=""),
                ] if a.id != winning_act and a.id != "ACT_IGNORE_CAUSAL_BREAK"}
            },
            provenance_tier="GOLD" if seq <= 11 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Evidence-to-Scene Claim Grounding (8 packets)
    grounding_scenarios = [
        ("Scene 2 asserts 'The James Webb Space Telescope weighs 6,500 kg', evidence_refs=['ref_nasa_jwst_specs']", True, "ACT_APPROVE_CLAIM_GROUNDING"),
        ("Scene 4 asserts 'Albert Einstein failed high school math', evidence_refs=[]", False, "ACT_REJECT_UNGROUNDED_CLAIM"),
        ("Scene 1 asserts 'Honey never spoils due to low moisture and high acidity', evidence_refs=['ref_smithsonian_honey']", True, "ACT_APPROVE_CLAIM_GROUNDING"),
        ("Scene 3 asserts 'Humans use only 10 percent of their brain', evidence_refs=['ref_debunked_myth_neuroscience']", False, "ACT_REPLACE_DEBUNKED_CLAIM"),
        ("Scene 5 asserts 'Water boils at 100C at sea level', evidence_refs=['ref_physics_handbook']", True, "ACT_APPROVE_CLAIM_GROUNDING"),
        ("Scene 2 asserts 'Drinking hot water cures viral infections', evidence_refs=[]", False, "ACT_REJECT_UNGROUNDED_CLAIM"),
        ("Scene 3 asserts 'Mount Everest grows 4 millimeters every year', evidence_refs=['ref_geology_survey_2023']", True, "ACT_APPROVE_CLAIM_GROUNDING"),
        ("Scene 1 asserts 'Coffee was discovered by dancing goats in Ethiopia', evidence_refs=['ref_kaldi_legend_folklore']", True, "ACT_APPROVE_CLAIM_GROUNDING"),
    ]
    for assertion, is_grounded, win_act in grounding_scenarios:
        p = make_packet(
            packet_id=f"sf_d03_{seq:03d}",
            domain="D03",
            floor_id="F02",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d03_{seq:03d}",
                content_engine="facts",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if not is_grounded else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Scene specification assertion: '{assertion}'. Grounding check: is_grounded={is_grounded}.",
                    evidence_type="VERIFIED_FACT",
                    ref="script_ir.py:ClaimRef.verify_evidence_refs",
                ),
                VerifiedFact(
                    fact="F02 Claim Grounding invariant: Every factual assertion in a scene must bind directly to an upstream F00 evidence_ref.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 4 (Claim <= Evidence)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"EvidenceRef presence: {'VALID' if is_grounded else 'MISSING_OR_CONTRADICTED'}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Assertion lack of evidence: {assertion}" if not is_grounded else ""],
            constraints=["Every factual claim must have verified evidence refs.", "Reject debunked myths or ungrounded assertions."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_CLAIM_GROUNDING", label="Approve scene claim as verified and properly grounded with upstream EvidenceRefs"),
                CandidateAction(id="ACT_REJECT_UNGROUNDED_CLAIM", label="Reject ungrounded scene assertion and require evidence attachment or replacement"),
                CandidateAction(id="ACT_REPLACE_DEBUNKED_CLAIM", label="Replace debunked myth with scientific consensus statement grounded in evidence"),
                CandidateAction(id="ACT_INVENT_FAKE_SOURCE", label="Generate fake DOI string to make the ungrounded claim appear verified"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_INVENT_FAKE_SOURCE": "SECURITY_VIOLATION_EVIDENCE_FORGERY: Inventing synthetic source identifiers violates core governance principles.",
                ("ACT_APPROVE_CLAIM_GROUNDING" if not is_grounded else "ACT_REJECT_UNGROUNDED_CLAIM"): "EVIDENCE_GATE_MISCLASSIFICATION: Decision does not reflect empirical grounding state.",
                ("ACT_REPLACE_DEBUNKED_CLAIM" if win_act != "ACT_REPLACE_DEBUNKED_CLAIM" else "ACT_REJECT_UNGROUNDED_CLAIM"): "GROUNDING_ACTION_MISMATCH: Proposed action does not match claim status.",
            },
            provenance_tier="GOLD" if seq <= 19 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Localized Scene Regeneration without Mutating F00/F01 (6 packets)
    for scene_num in [2, 3, 4, 1, 5, 6]:
        p = make_packet(
            packet_id=f"sf_d03_{seq:03d}",
            domain="D03",
            floor_id="F02",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d03_{seq:03d}",
                content_engine="history",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Quality audit flagged dialogue wording in Scene {scene_num} as clumsy; Scenes 1..{scene_num-1} and {scene_num+1}..6 are verified and approved.",
                    evidence_type="VERIFIED_FACT",
                    ref="Floor02RuntimeAdapter.ts:regenerateLocalizedScene",
                ),
                VerifiedFact(
                    fact="F02 Surgical Regeneration rule: Mutate ONLY the target Scene {scene_num}; upstream strategy F01 and other scenes remain immutable.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 7 (Bounded Repair & Last-Known-Good Baseline)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Target scene for localized repair: Scene_{scene_num}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=[f"Regenerate only Scene {scene_num}.", "Do not invalidate cached audio or visuals for untouched scenes."],
            candidate_actions=[
                CandidateAction(id="ACT_LOCALIZED_SCENE_REPAIR", label=f"Regenerate only Scene {scene_num} dialogue while locking all other scene specifications and F01 strategy"),
                CandidateAction(id="ACT_FULL_PIPELINE_RESTART", label="Wipe entire F00, F01, and F02 pipeline and re-run complete video generation from scratch"),
                CandidateAction(id="ACT_MUTATE_UPSTREAM_STRATEGY", label="Alter upstream F01 strategy topic to force complete re-scripting"),
            ],
            winning_action_id="ACT_LOCALIZED_SCENE_REPAIR",
            rejected_reasons={
                "ACT_FULL_PIPELINE_RESTART": "TREASURY_VIOLATION_RUNAWAY_RECOMPUTE: Full pipeline restart for a single scene wording fix wastes compute and breaks incremental cache.",
                "ACT_MUTATE_UPSTREAM_STRATEGY": "INVARIANT_VIOLATION_RETROACTIVE_MUTATION: Downstream narrative floors cannot mutate locked upstream strategy contracts.",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
