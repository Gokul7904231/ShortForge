"""Domain D06: F05_COMPOSITION_TIMELINE
Covers 120,000 ticks/sec integer timebase alignment, rational framerate checks,
RippleScope ripple vs lock-track propagation, and F03/F04 lineage mismatch rejection.
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
    "apps/web/factoryos/core/timeline/CompositionIR.ts",
    "apps/web/factoryos/core/timeline/TimelineIR.ts",
    "apps/web/factoryos/core/timeline/TimelineTransforms.ts",
    ".okf/principles.md",
]


def generate_d06_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. 120,000 ticks/sec Integer Timebase & Frame Boundary Alignment (8 packets)
    timebase_scenarios = [
        (30.0, 1000, 120000, True, "1000ms at 30fps aligns to exactly 120,000 ticks (30 frames)"),
        (24.0, 500, 60000, True, "500ms at 24fps aligns to exactly 60,000 ticks (12 frames)"),
        (29.97, 1001, 120120, True, "1001ms at 29.97fps aligns cleanly with 30000/1001 rational timebase"),
        (30.0, 33, 3960, False, "33ms at 30fps is not frame-aligned (33.333ms required, leaves remainder)"),
        (60.0, 16, 1920, False, "16ms at 60fps is not frame-aligned (16.666ms required)"),
        (23.976, 2002, 240240, True, "2002ms at 23.976fps aligns with 24000/1001 rational framerate"),
        (25.0, 40, 4800, True, "40ms at 25fps aligns to exactly 1 frame (4,800 ticks)"),
        (30.0, 100, 12000, False, "100ms at 30fps is 3.0 frames + 0.1 frame fractional offset"),
    ]
    for fps, duration_ms, expected_ticks, is_aligned, desc in timebase_scenarios:
        win_act = "ACT_APPROVE_TIMEBASE_ALIGNMENT" if is_aligned else "ACT_SNAP_TO_NEAREST_FRAME"
        p = make_packet(
            packet_id=f"sf_d06_{seq:03d}",
            domain="D06",
            floor_id="F05",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d06_{seq:03d}",
                content_engine="facts",
                target_duration_sec=30,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM" if not is_aligned else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Timeline node timebase check: fps={fps}, duration={duration_ms}ms, calculated_ticks={expected_ticks}. ({desc})",
                    evidence_type="VERIFIED_FACT",
                    ref="CompositionIR.ts:validateMediaTimeAlignment",
                ),
                VerifiedFact(
                    fact="F05 Integer Timebase Invariant: MEDIA_TIMEBASE = 120,000 ticks/sec. All clip start/duration values must snap to exact frame boundaries without floating point rounding error.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="CompositionIR.ts:MEDIA_TIMEBASE",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Frame alignment status: is_aligned={is_aligned}, remainder={0 if is_aligned else expected_ticks % 4000}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Fractional frame drift: {desc}" if not is_aligned else ""],
            constraints=["Ensure zero sub-frame jitter across tracks.", "All timestamps must be integers divisible by frame tick quantum."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_TIMEBASE_ALIGNMENT", label="Approve timeline clip duration as perfectly frame-aligned in 120,000 ticks/sec timebase"),
                CandidateAction(id="ACT_SNAP_TO_NEAREST_FRAME", label="Snap fractional timestamp to the nearest integer frame boundary tick"),
                CandidateAction(id="ACT_ALLOW_FLOATING_POINT_DRIFT", label="Permit floating point millisecond offsets causing progressive audio-video desync"),
                CandidateAction(id="ACT_ROUND_ROUGHLY_TO_SECOND", label="Coarsely round timestamp to the nearest whole second discarding precision"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ALLOW_FLOATING_POINT_DRIFT": "TIMING_VIOLATION_SUBFRAME_DRIFT: Permitting unaligned floating point times accumulates jitter and breaks audio-video lip sync.",
                "ACT_ROUND_ROUGHLY_TO_SECOND": "RESOLUTION_LOSS_COARSE_ROUNDING: Rounding to full seconds truncates micro-edits and destroys rhythm.",
                ("ACT_APPROVE_TIMEBASE_ALIGNMENT" if not is_aligned else "ACT_SNAP_TO_NEAREST_FRAME"): "ALIGNMENT_STATE_MISMATCH: Decision does not reflect mathematical frame alignment status.",
            },
            provenance_tier="GOLD" if seq <= 3 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Rational Framerate Enforcement (6 packets)
    fps_tests = [
        (30, True, 30, 1, "Integer 30 fps"),
        (60, True, 60, 1, "Integer 60 fps"),
        (24, True, 24, 1, "Integer 24 cinema fps"),
        (29.97, True, 30000, 1001, "NTSC drop-frame 29.97 fps"),
        (23.976, True, 24000, 1001, "NTSC cinema 23.976 fps"),
        (27.4, False, 0, 0, "Non-standard 27.4 fps variable framerate"),
    ]
    for fps_val, valid, num, den, desc in fps_tests:
        win_act = "ACT_APPROVE_RATIONAL_FRAMERATE" if valid else "ACT_REJECT_INVALID_FRAMERATE"
        p = make_packet(
            packet_id=f"sf_d06_{seq:03d}",
            domain="D06",
            floor_id="F05",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d06_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if not valid else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Canvas framerate declaration: fps={fps_val} ({desc}).",
                    evidence_type="VERIFIED_FACT",
                    ref="TimelineIR.ts:frameRateFromFps",
                ),
                VerifiedFact(
                    fact="F05 Framerate Invariant: Canvas framerate must be a standard rational number (24/1, 25/1, 30/1, 60/1, 24000/1001, 30000/1001, 60000/1001). Arbitrary variable framerates are rejected.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="TimelineIR.ts:frameRateFromFps",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Rational framerate check: valid={valid}, ratio={num}/{den}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Enforce standard broadcast/web rational framerates."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_RATIONAL_FRAMERATE", label=f"Approve rational framerate {num}/{den} for CompositionIR canvas"),
                CandidateAction(id="ACT_REJECT_INVALID_FRAMERATE", label=f"Reject non-standard framerate {fps_val} fps and enforce fallback to standard 30/1 fps"),
                CandidateAction(id="ACT_ACCEPT_VARIABLE_FRAMERATE", label="Accept variable framerate without validation risking stuttering playback in player"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ACCEPT_VARIABLE_FRAMERATE": "CONTAINER_VIOLATION_VFR: Variable framerates cause audio drift and rendering desync in FFmpeg pipeline.",
                ("ACT_APPROVE_RATIONAL_FRAMERATE" if not valid else "ACT_REJECT_INVALID_FRAMERATE"): "FRAMERATE_CLASSIFICATION_MISMATCH: Decision does not match rational validity.",
            },
            provenance_tier="GOLD" if seq <= 11 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. RippleScope: Ripple Delete vs Locked-Track Propagation (6 packets)
    ripple_scenarios = [
        ("User deletes 2.0s silent pause from narration track; RippleScope.ALL_TRACKS active", "RIPPLE_ALL", "ACT_RIPPLE_ALL_TRACKS"),
        ("User trims background music intro; RippleScope.TRACK_ONLY active", "RIPPLE_TRACK_ONLY", "ACT_RIPPLE_CURRENT_TRACK_ONLY"),
        ("User edits text in subtitle track; audio and video must remain strictly locked", "LOCKED_TRACKS", "ACT_LOCK_AUDIO_VIDEO_TRACKS"),
        ("Ripple delete requested on video track with linked audio track (split AV clip)", "RIPPLE_LINKED_AV", "ACT_RIPPLE_LINKED_AUDIO_AND_VIDEO"),
        ("Ripple delete attempted on locked background watermarked video track", "LOCKED_TRACK_ERROR", "ACT_REJECT_DELETE_ON_LOCKED_TRACK"),
        ("Ripple delete causes adjacent title card to overlap with next chapter marker", "COLLISION_DETECTED", "ACT_CLAMP_RIPPLE_AT_CHAPTER_BOUNDARY"),
    ]
    for desc, scope_code, win_act in ripple_scenarios:
        p = make_packet(
            packet_id=f"sf_d06_{seq:03d}",
            domain="D06",
            floor_id="F05",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d06_{seq:03d}",
                content_engine="story",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Timeline edit transform request: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="TimelineTransforms.ts:executeRippleDelete",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Ripple transform scope: {scope_code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Respect track locking and RippleScope boundaries.", "Prevent unintended clip collisions."],
            candidate_actions=[
                CandidateAction(id="ACT_RIPPLE_ALL_TRACKS", label="Shift all subsequent clips on all unlocked tracks by -2000ms to preserve global sync"),
                CandidateAction(id="ACT_RIPPLE_CURRENT_TRACK_ONLY", label="Shift only clips on current track, leaving other parallel tracks unchanged"),
                CandidateAction(id="ACT_LOCK_AUDIO_VIDEO_TRACKS", label="Isolate edit to subtitle track and preserve exact audio/video timeline coordinates"),
                CandidateAction(id="ACT_RIPPLE_LINKED_AUDIO_AND_VIDEO", label="Shift linked audio and video clips in unison while preserving background music track"),
                CandidateAction(id="ACT_REJECT_DELETE_ON_LOCKED_TRACK", label="Reject edit attempt on locked track with LockedTrackError"),
                CandidateAction(id="ACT_CLAMP_RIPPLE_AT_CHAPTER_BOUNDARY", label="Clamp ripple shift to prevent overwriting pinned chapter marker"),
                CandidateAction(id="ACT_BLIND_DELETE_LEAVE_GAP", label="Delete clip and leave empty black gap without shifting subsequent clips"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_BLIND_DELETE_LEAVE_GAP": "EDITING_ERROR_BLACK_GAP: Leaving unmanaged black gap in short-form video drops retention and violates ripple intent.",
                **{a.id: f"RIPPLE_SCOPE_MISMATCH: Action '{a.id}' contradicts declared scope '{scope_code}'." for a in [
                    CandidateAction(id="ACT_RIPPLE_ALL_TRACKS", label=""),
                    CandidateAction(id="ACT_RIPPLE_CURRENT_TRACK_ONLY", label=""),
                    CandidateAction(id="ACT_LOCK_AUDIO_VIDEO_TRACKS", label=""),
                    CandidateAction(id="ACT_RIPPLE_LINKED_AUDIO_AND_VIDEO", label=""),
                    CandidateAction(id="ACT_REJECT_DELETE_ON_LOCKED_TRACK", label=""),
                    CandidateAction(id="ACT_CLAMP_RIPPLE_AT_CHAPTER_BOUNDARY", label=""),
                ] if a.id != win_act and a.id != "ACT_BLIND_DELETE_LEAVE_GAP"}
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. F03/F04 Lineage Mismatch Rejection (6 packets)
    lineage_scenarios = [
        ("F05 received VisualTracks from F03 revision 2, but AudioTracks from F04 revision 1 (stale voice)", False, "ACT_REJECT_LINEAGE_MISMATCH"),
        ("F05 received VisualTracks from F03 revision 3 and AudioTracks from F04 revision 3 (both bound to F02 rev 3)", True, "ACT_APPROVE_COMPOSITION_LINEAGE"),
        ("VisualTrack references asset SHA-256 missing from ContentAddressedStore", False, "ACT_REJECT_MISSING_CAS_ASSET"),
        ("AudioTrack references voice SHA-256 verified in CAS with matching ffprobe duration", True, "ACT_APPROVE_COMPOSITION_LINEAGE"),
        ("VisualTrack duration is 30s, but AudioTrack narration duration is 38s (8s audio overhang)", False, "ACT_REJECT_DURATION_OVERHANG"),
        ("Subtitle cues match audio word timestamps within 5ms precision", True, "ACT_APPROVE_COMPOSITION_LINEAGE"),
    ]
    for desc, is_aligned, win_act in lineage_scenarios:
        p = make_packet(
            packet_id=f"sf_d06_{seq:03d}",
            domain="D06",
            floor_id="F05",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d06_{seq:03d}",
                content_engine="history",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if not is_aligned else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Composition assembly inspection: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="CompositionIR.ts:validateCompositionLineage",
                ),
                VerifiedFact(
                    fact="F05 Lineage Invariant: Composition must assemble only identical script revision assets from F03 and F04. Stale or desynchronized revisions must be rejected.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 3 (Single Authoritative Source of Truth - Lineage)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Lineage verification: is_aligned={is_aligned}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Assembly defect: {desc}" if not is_aligned else ""],
            constraints=["Assemble only synchronized, revision-locked visual and audio tracks."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_COMPOSITION_LINEAGE", label="Approve composition assembly as fully synchronized with matching revision digests"),
                CandidateAction(id="ACT_REJECT_LINEAGE_MISMATCH", label="Reject composition with LineageMismatchError and request F04 voice re-sync to current F03 revision"),
                CandidateAction(id="ACT_REJECT_MISSING_CAS_ASSET", label="Reject composition due to missing CAS visual asset and trigger re-hydration"),
                CandidateAction(id="ACT_REJECT_DURATION_OVERHANG", label="Reject composition due to audio overhang and request timeline trim"),
                CandidateAction(id="ACT_PROCEED_DESYNC_BLIND", label="Render video with mismatched visual and audio revisions hoping viewer does not notice"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_PROCEED_DESYNC_BLIND": "INTEGRITY_VIOLATION_DESYNC: Rendering mismatched revisions produces broken audio-visual desync and fails quality gates.",
                **{a.id: f"LINEAGE_ACTION_MISMATCH: Action '{a.id}' contradicts lineage evaluation." for a in [
                    CandidateAction(id="ACT_APPROVE_COMPOSITION_LINEAGE", label=""),
                    CandidateAction(id="ACT_REJECT_LINEAGE_MISMATCH", label=""),
                    CandidateAction(id="ACT_REJECT_MISSING_CAS_ASSET", label=""),
                    CandidateAction(id="ACT_REJECT_DURATION_OVERHANG", label=""),
                ] if a.id != win_act and a.id != "ACT_PROCEED_DESYNC_BLIND"}
            },
            provenance_tier="GOLD" if seq <= 22 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
