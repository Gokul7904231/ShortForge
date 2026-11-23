"""Domain D11: STUDIO_REMAKER_EDIT
Covers the ShortForge Editor Command Engine:
Optimistic concurrency (expectedRevision), command envelopes (SPLIT_CLIP, TRIM_CLIP, MOVE_CLIP, RIPPLE_DELETE),
minimal DAG cache invalidation (changedClipIds isolates re-render to dirty clips),
locked track ripple constraints, and strict actor attribution.
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
    "apps/web/factoryos/core/editor/EditorContracts.ts",
    "apps/web/factoryos/core/editor/EditorCommandEngine.ts",
    "apps/web/factoryos/core/timeline/CompositionIR.ts",
    "apps/web/factoryos/core/timeline/TimelineTransforms.ts",
    "apps/web/factoryos/core/editor/DurableEditor.ts",
    ".okf/architecture.md",
]


def generate_d11_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Optimistic Concurrency & Revision Checks (GOLD)
    scenarios_revision = [
        ("stale_revision_4_vs_5", 4, 5, "ACT_REJECT_STALE_REVISION"),
        ("stale_revision_1_vs_3", 1, 3, "ACT_REJECT_STALE_REVISION"),
        ("future_revision_desync", 8, 5, "ACT_REJECT_FUTURE_REVISION_DESYNC"),
        ("matching_revision_apply", 5, 5, "ACT_APPLY_COMMAND_AT_REVISION"),
        ("matching_revision_batch", 12, 12, "ACT_APPLY_COMMAND_AT_REVISION"),
    ]
    for sc_id, exp_rev, curr_rev, win_act in scenarios_revision:
        is_stale = exp_rev != curr_rev
        p = make_packet(
            packet_id=f"D11-EDIT-{seq:03d}",
            domain="D11_STUDIO_REMAKER_EDIT",
            floor_id="STUDIO_EDITOR_ENGINE",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d11-rev-{seq:03d}",
                content_engine="quiz",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Current document revision in memory is {curr_rev}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact=f"Incoming EditorCommandEnvelope declares expectedRevision={exp_rev}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"command: TRIM_CLIP, expectedRevision: {exp_rev}, activeRevision: {curr_rev}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Revision delta: {exp_rev - curr_rev}"] if is_stale else [],
            constraints=["Optimistic concurrency: command MUST be rejected if expectedRevision != currentRevision"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Execute deterministic concurrency check ({win_act})"),
                CandidateAction(id="ACT_FORCE_OVERWRITE_MUTATION", label="Force apply mutation ignoring expectedRevision"),
                CandidateAction(id="ACT_SILENTLY_DROP_COMMAND", label="Silently drop command without returning EditorReceipt"),
                CandidateAction(id="ACT_REWIND_DOCUMENT_STATE", label="Rewind active document back to expectedRevision"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_FORCE_OVERWRITE_MUTATION": "INVARIANT_VIOLATION_STALE_REVISION: Applying edits on stale revision causes lost updates and corrupts collaborative timeline state" if is_stale else "INVARIANT_VIOLATION_INVALID_OVERRIDE: Revision matches; bypass flag is redundant and dangerous",
                "ACT_SILENTLY_DROP_COMMAND": "PROTOCOL_VIOLATION_MISSING_RECEIPT: Editor contracts require an explicit EditorReceipt with accepted=false and error code",
                "ACT_REWIND_DOCUMENT_STATE": "INTEGRITY_VIOLATION_STATE_ROLLBACK: Destructive rewind of committed edits destroys intervening user actions",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Minimal DAG Cache Re-render Invalidation (GOLD)
    scenarios_dag_cache = [
        ("audio_trim_clip_2", "clip-audio-02", "Scene 2 Audio", "ACT_INVALIDATE_ONLY_CHANGED_CLIP_DAG"),
        ("subtitle_text_reword", "clip-sub-04", "Scene 4 Caption", "ACT_INVALIDATE_ONLY_CHANGED_CLIP_DAG"),
        ("color_filter_clip_1", "clip-fx-01", "Scene 1 Visual Effect", "ACT_INVALIDATE_ONLY_CHANGED_CLIP_DAG"),
        ("transition_wipe_clip_3", "clip-trans-03", "Scene 3 Transition", "ACT_INVALIDATE_ONLY_CHANGED_CLIP_DAG"),
        ("background_gradient_tweak", "canvas-bg-01", "Canvas Background", "ACT_INVALIDATE_GLOBAL_CANVAS_ONLY"),
    ]
    for sc_id, clip_id, clip_name, win_act in scenarios_dag_cache:
        p = make_packet(
            packet_id=f"D11-EDIT-{seq:03d}",
            domain="D11_STUDIO_REMAKER_EDIT",
            floor_id="STUDIO_DAG_REMAKER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d11-dag-{seq:03d}",
                content_engine="history",
                risk_level="LOW",
            ),
            verified_facts=[
                VerifiedFact(fact=f"changedClipIds() detects mutation isolated strictly to clip '{clip_id}' ({clip_name})", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="All other 8 clips retain identical canonicalized hash representations", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[2]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"edit_target: {clip_id}, unaffected_clips_count: 8", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[],
            constraints=["Minimal invalidation rule: Intact clips must reuse verified CAS render hashes"],
            candidate_actions=[
                CandidateAction(id=win_act, label="Surgically re-render only the affected node while preserving all cached scene assets"),
                CandidateAction(id="ACT_PURGE_ALL_CACHE_FULL_REBUILD", label="Purge entire project render cache and re-render all scenes from scratch"),
                CandidateAction(id="ACT_SKIP_RERENDER_DIRTY_CLIP", label="Skip re-rendering dirty clip and publish obsolete cached media"),
                CandidateAction(id="ACT_DELETE_CAS_BUCKET", label="Flush Backblaze B2 CAS bucket completely"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_PURGE_ALL_CACHE_FULL_REBUILD": "INTEGRITY_VIOLATION_CACHE_INVALIDATION_OVERREACH: Invalidation of intact clips wastes GPU render minutes and violates Remaker DAG cache conservation laws",
                "ACT_SKIP_RERENDER_DIRTY_CLIP": "QUALITY_VIOLATION_STALE_ARTIFACT: Publishing obsolete cached video when clip was modified causes visual desync",
                "ACT_DELETE_CAS_BUCKET": "SECURITY_VIOLATION_UNAUTHORIZED_PURGE: Deleting CAS storage violates production data retention invariants",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Ripple Scope Constraints & Locked Tracks (GOLD)
    scenarios_ripple = [
        ("ripple_with_captions_sync", True, "ACT_RIPPLE_DELETE_ALL_SYNCED_TRACKS"),
        ("ripple_ignoring_captions_breach", False, "ACT_REJECT_UNSYNCED_RIPPLE_DESYNC"),
        ("ripple_across_locked_voiceover", False, "ACT_REJECT_LOCKED_TRACK_MUTATION"),
        ("ripple_bounded_within_scope", True, "ACT_EXECUTE_BOUNDED_RIPPLE"),
        ("ripple_audio_track_isolated", True, "ACT_EXECUTE_ISOLATED_TRACK_RIPPLE"),
    ]
    for sc_id, include_captions, win_act in scenarios_ripple:
        is_safe = include_captions and "REJECT" not in win_act
        p = make_packet(
            packet_id=f"D11-EDIT-{seq:03d}",
            domain="D11_STUDIO_REMAKER_EDIT",
            floor_id="STUDIO_TIMELINE_TRANSFORMS",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d11-rip-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Timeline contains locked voiceover track and synchronous subtitle track (includeCaptions={include_captions})", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact="RippleScope specifies whether time deletion shifts downstream items on linked tracks", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[3]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"command: RIPPLE_DELETE, start: 12.0s, end: 15.0s, includeCaptions: {include_captions}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Desync risk on linked tracks: {not include_captions}"] if not is_safe else [],
            constraints=["Ripple operations that decouple audio/subtitle sync must be rejected fail-closed"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Execute verified ripple operation ({win_act})"),
                CandidateAction(id="ACT_FORCE_DESYNC_RIPPLE", label="Ripple delete video track only, leaving subtitles and audio misaligned"),
                CandidateAction(id="ACT_OVERWRITE_WITH_SILENCE", label="Replace deleted section with blank silence without shifting timeline"),
                CandidateAction(id="ACT_DELETE_ALL_TRACKS", label="Wipe all tracks across the entire timeline"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_FORCE_DESYNC_RIPPLE": "INTEGRITY_VIOLATION_DESYNC: Deleting video time without shifting linked subtitle/audio tracks causes permanent audio/caption desync",
                "ACT_OVERWRITE_WITH_SILENCE": "NARRATIVE_VIOLATION_PACING_GAP: Inserting 3.0s dead air creates catastrophic audience retention drop",
                "ACT_DELETE_ALL_TRACKS": "INTEGRITY_VIOLATION_CORRUPTED_PIPELINE: Blanket track deletion destroys project timeline",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Strict Actor Attribution & Digest Verification (CURRICULUM_GOLD)
    scenarios_actors = [
        ("human_editor_valid", "HUMAN", "user_auth_789", "sig_valid", "ACT_ACCEPT_AUTHENTICATED_COMMAND"),
        ("agent_editor_valid", "AGENT", "agent_ascalon_4b", "sig_valid", "ACT_ACCEPT_AUTHENTICATED_COMMAND"),
        ("system_editor_valid", "SYSTEM", "cron_watchdog", "sig_valid", "ACT_ACCEPT_AUTHENTICATED_COMMAND"),
        ("anonymous_editor_breach", "ANONYMOUS", "", "sig_missing", "ACT_REJECT_UNATTRIBUTED_ACTOR"),
        ("spoofed_command_digest", "AGENT", "agent_malicious", "digest_mismatch", "ACT_REJECT_TAMPERED_ENVELOPE"),
    ]
    for sc_id, actor_kind, actor_id, digest_status, win_act in scenarios_actors:
        is_valid = digest_status == "sig_valid" and actor_kind in ["HUMAN", "AGENT", "SYSTEM"]
        p = make_packet(
            packet_id=f"D11-EDIT-{seq:03d}",
            domain="D11_STUDIO_REMAKER_EDIT",
            floor_id="STUDIO_ENVELOPE_VALIDATOR",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d11-act-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"EditorActor kind='{actor_kind}', id='{actor_id}'", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact=f"Command envelope digest status: {digest_status}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"actor_envelope: {actor_kind}:{actor_id}, digest_status: {digest_status}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Envelope integrity failure: {digest_status}"] if not is_valid else [],
            constraints=["Every editor command MUST be signed and attributed to a verified Actor"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Process command envelope ({win_act})"),
                CandidateAction(id="ACT_ACCEPT_UNAUTHENTICATED", label="Accept command without validating actor authentication"),
                CandidateAction(id="ACT_REGENERATE_FAKE_SIGNATURE", label="Forge internal signature to bypass digest check"),
                CandidateAction(id="ACT_CRASH_EDITOR_SESSION", label="Crash WebSocket session with unhandled exception"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ACCEPT_UNAUTHENTICATED": "SECURITY_VIOLATION_UNATTRIBUTED_MUTATION: Accepting unverified or tampered editor envelopes creates an arbitrary code/timeline injection vulnerability",
                "ACT_REGENERATE_FAKE_SIGNATURE": "SECURITY_VIOLATION_EVIDENCE_FORGERY: Fabricating signatures violates non-repudiation and cryptographic integrity",
                "ACT_CRASH_EDITOR_SESSION": "RESILIENCE_VIOLATION_UNHANDLED_CRASH: Staged command failures must return structured EditorReceipt, not crash the editor process",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. Boundary Clip Bounds & Negative Durations (CURRICULUM_GOLD)
    scenarios_clip_bounds = [
        ("negative_duration_trim", -500, "ACT_REJECT_NEGATIVE_DURATION"),
        ("zero_duration_trim", 0, "ACT_REJECT_ZERO_DURATION"),
        ("clip_past_timeline_ceiling", 72000, "ACT_REJECT_EXCESSIVE_DURATION"),
        ("valid_trim_3_sec", 360000, "ACT_APPLY_VALID_TRIM"),
        ("valid_split_midpoint", 180000, "ACT_APPLY_VALID_SPLIT"),
    ]
    for sc_id, dur_ticks, win_act in scenarios_clip_bounds:
        is_error = dur_ticks <= 0 or dur_ticks > 60000000  # 120,000 ticks/sec
        p = make_packet(
            packet_id=f"D11-EDIT-{seq:03d}",
            domain="D11_STUDIO_REMAKER_EDIT",
            floor_id="STUDIO_TIMELINE_VALIDATOR",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d11-bnd-{seq:03d}",
                content_engine="quiz",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Target duration or split time in ticks: {dur_ticks}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[2]),
                VerifiedFact(fact="Timebase is 120,000 ticks/second; duration must be strictly positive finite integer", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[2]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"command_parameter_ticks: {dur_ticks}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Boundary violation: duration={dur_ticks}"] if is_error else [],
            constraints=["Clips with non-positive or corrupted durations must be rejected"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Validate clip timing boundaries ({win_act})"),
                CandidateAction(id="ACT_ACCEPT_CORRUPTED_CLIP", label="Accept clip with negative/zero duration into timeline"),
                CandidateAction(id="ACT_CLAMP_TO_ZERO", label="Silently clamp negative clip duration to 0 and render black frames"),
                CandidateAction(id="ACT_REVERSE_TIMELINE_FLOW", label="Invert timeline arrow of time"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ACCEPT_CORRUPTED_CLIP": "TIMING_VIOLATION_SUBFRAME_DRIFT: Non-positive clip duration corrupts timeline playback engine and causes renderer crash",
                "ACT_CLAMP_TO_ZERO": "QUALITY_VIOLATION_CORRUPTED_PIPELINE: Zero duration clips produce black-frame glitches and desynchronize audio-video muxer",
                "ACT_REVERSE_TIMELINE_FLOW": "PHYSICAL_VIOLATION_CAUSALITY: Inverting timeline flow is not an authorized time transformation",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
