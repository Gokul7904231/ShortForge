"""Domain D05: F04_VOICE_TIMING
Covers EXACT vs BOUNDED timing drift (actualDurationMs vs requestedDurationMs),
maxResynthesisPasses exhaustion, maxStretchRatio (<= 1.05), and WAV/FFprobe
physical duration verification vs magic-byte spoofing rejection.
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
    "apps/web/factoryos/core/voice/VoiceFabric.ts",
    "apps/web/factoryos/core/voice/GeminiTTSProvider.ts",
    "apps/web/factoryos/core/voice/NarrationCrafter.ts",
    "apps/web/factoryos/core/timeline/TimelineIR.ts",
    ".okf/principles.md",
]


def generate_d05_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Audio Timing Drift & Stretch Ratio (<= 1.05) (10 packets)
    drift_tests = [
        (5000, 5100, 1.02, 1, "Minor timing drift (2%), well within maxStretchRatio 1.05"),
        (5000, 5240, 1.048, 1, "Boundary timing drift (4.8%), within maxStretchRatio 1.05"),
        (5000, 5600, 1.12, 1, "Excessive timing drift (12%): stretch ratio 1.12 exceeds 1.05 limit, first attempt"),
        (5000, 6200, 1.24, 2, "Severe timing drift (24%): resynthesis pass 2 exhausted"),
        (3000, 2900, 0.967, 1, "Minor negative drift (-3.3%), within compression limit (0.95 - 1.05)"),
        (3000, 2600, 0.867, 1, "Excessive negative drift (-13.3%), compression ratio 0.867 exceeds 0.95 limit"),
        (10000, 10050, 1.005, 1, "Negligible drift (0.5%), acceptable without DSP transformation"),
        (4000, 4800, 1.20, 1, "Substantial drift (20%), requires re-synthesis with adjusted speaking rate"),
        (5000, 5800, 1.16, 2, "Pass 2 exhausted with 16% drift, requires script text truncation"),
        (6000, 6000, 1.00, 1, "Perfect timing match: 0ms drift"),
    ]
    for req_ms, act_ms, ratio, pass_num, desc in drift_tests:
        can_stretch = 0.95 <= ratio <= 1.05
        is_pass_exhausted = pass_num >= 2 and not can_stretch

        if can_stretch:
            win_id = "ACT_APPLY_TEMPO_STRETCH"
        elif is_pass_exhausted:
            win_id = "ACT_TRUNCATE_SCRIPT_TEXT"
        else:
            win_id = "ACT_RESYNTHESIZE_VOICE"

        p = make_packet(
            packet_id=f"sf_d05_{seq:03d}",
            domain="D05",
            floor_id="F04",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d05_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Audio duration measurement: requested={req_ms}ms, actual={act_ms}ms, stretch_ratio={ratio:.3f}, pass={pass_num}. ({desc})",
                    evidence_type="VERIFIED_FACT",
                    ref="VoiceFabric.ts:verifyAudioTimingBounds",
                ),
                VerifiedFact(
                    fact="F04 Voice Timing Invariant: maxStretchRatio is strictly <= 1.05 (and >= 0.95). Maximum resynthesis passes = 2. Beyond limits, script text must be truncated.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 4 (Claim <= Evidence - Audio Timing)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Timing evaluation: ratio={ratio:.3f}, maxStretch=1.05, pass={pass_num}/2", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Preserve audio naturalness without chipmunk/slowed pitch distortion.", "Enforce bounded resynthesis budget."],
            candidate_actions=[
                CandidateAction(id="ACT_APPLY_TEMPO_STRETCH", label="Apply micro-tempo adjustment via FFmpeg atempo filter (within 0.95-1.05 limit)"),
                CandidateAction(id="ACT_RESYNTHESIZE_VOICE", label="Trigger second resynthesis pass with adjusted VoiceProfile.speed parameter"),
                CandidateAction(id="ACT_TRUNCATE_SCRIPT_TEXT", label="Resynthesis passes exhausted; return repair request to F02 to truncate script words"),
                CandidateAction(id="ACT_FORCE_OVERSTRETCH", label="Force FFmpeg atempo 1.25x stretch causing severe audio distortion and pitch artifacts"),
            ],
            winning_action_id=win_id,
            rejected_reasons={
                "ACT_FORCE_OVERSTRETCH": "QUALITY_VIOLATION_AUDIO_DISTORTION: Audio time-stretching beyond 5% causes perceptible vocal unnaturalness and violates F04 limits.",
                **{a.id: f"TIMING_ACTION_MISMATCH: Action '{a.id}' violates state rules for ratio={ratio:.3f}, pass={pass_num}." for a in [
                    CandidateAction(id="ACT_APPLY_TEMPO_STRETCH", label=""),
                    CandidateAction(id="ACT_RESYNTHESIZE_VOICE", label=""),
                    CandidateAction(id="ACT_TRUNCATE_SCRIPT_TEXT", label=""),
                ] if a.id != win_id}
            },
            provenance_tier="GOLD" if seq <= 4 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Physical Audio Validation: FFprobe vs Spoofed Magic-Bytes (8 packets)
    probe_tests = [
        ("File has valid 'RIFF....WAVE' header and ffprobe confirms 44100Hz 16-bit PCM audio", True, 44100, "ACT_ACCEPT_VERIFIED_AUDIO"),
        ("File has 'RIFF' header bytes but payload terminates abruptly after 256 bytes", False, 0, "ACT_REJECT_TRUNCATED_WAV"),
        ("File is zero-byte empty file named 'narration.wav'", False, 0, "ACT_REJECT_ZERO_BYTE_AUDIO"),
        ("File contains MP3 ID3 header but was saved with .wav extension (container mismatch)", False, 44100, "ACT_RE_ENCODE_CONTAINER"),
        ("Physical ffprobe analysis reveals severe audio clipping (> 0 dBFS peak across 20% of samples)", False, 48000, "ACT_REJECT_CLIPPED_AUDIO"),
        ("Physical ffprobe confirms 48000Hz stereo AAC audio with valid duration matching header", True, 48000, "ACT_ACCEPT_VERIFIED_AUDIO"),
        ("Audio file has valid PCM samples but total silent volume (RMS level < -80 dBFS)", False, 44100, "ACT_REJECT_SILENT_AUDIO"),
        ("Provider reported duration 5.0s, but physical ffprobe measures actual duration 1.8s", False, 44100, "ACT_REJECT_DURATION_DISCREPANCY"),
    ]
    for desc, is_valid, sample_rate, win_act in probe_tests:
        p = make_packet(
            packet_id=f"sf_d05_{seq:03d}",
            domain="D05",
            floor_id="F04",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d05_{seq:03d}",
                content_engine="facts",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if not is_valid else "LOW",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Forensic audio inspection: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="VoiceFabric.ts:inspectAudioContainer",
                ),
                VerifiedFact(
                    fact="F04 Physical Verification Invariant: Never trust reported provider metadata. Physical ffprobe examination of actual container bytes is mandatory.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 4 (Forensic Grounding - Physical ffprobe)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Audio probe result: is_valid={is_valid}, sample_rate={sample_rate}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Audio integrity issue: {desc}" if not is_valid else ""],
            constraints=["Enforce physical audio byte verification.", "Reject corrupt, truncated, or spoofed audio files."],
            candidate_actions=[
                CandidateAction(id="ACT_ACCEPT_VERIFIED_AUDIO", label="Accept audio artifact with forensic receipt containing sample rate, sample count, and SHA-256"),
                CandidateAction(id="ACT_REJECT_TRUNCATED_WAV", label="Reject truncated WAV file and trigger immediate provider failover"),
                CandidateAction(id="ACT_REJECT_ZERO_BYTE_AUDIO", label="Reject 0-byte file with FatalVoiceFabricError and log provider crash"),
                CandidateAction(id="ACT_RE_ENCODE_CONTAINER", label="Re-encode audio into canonical WAV PCM container to resolve format mismatch"),
                CandidateAction(id="ACT_REJECT_CLIPPED_AUDIO", label="Reject distorted audio exceeding 0 dBFS limit and adjust gain parameters (-3dB)"),
                CandidateAction(id="ACT_REJECT_SILENT_AUDIO", label="Reject silent audio track (dead air) and re-synthesize with fallback TTS engine"),
                CandidateAction(id="ACT_REJECT_DURATION_DISCREPANCY", label="Reject audio with metadata mismatch and enforce physical ffprobe measured duration"),
                CandidateAction(id="ACT_TRUST_PROVIDER_METADATA_BLIND", label="Accept audio without physical ffprobe validation to save CPU cycles"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_TRUST_PROVIDER_METADATA_BLIND": "INVARIANT_VIOLATION_BLIND_TRUST: Accepting audio metadata without physical ffprobe verification violates Principle 4.",
                **{a.id: f"PROBE_ACTION_MISMATCH: Action '{a.id}' does not match probe condition." for a in [
                    CandidateAction(id="ACT_ACCEPT_VERIFIED_AUDIO", label=""),
                    CandidateAction(id="ACT_REJECT_TRUNCATED_WAV", label=""),
                    CandidateAction(id="ACT_REJECT_ZERO_BYTE_AUDIO", label=""),
                    CandidateAction(id="ACT_RE_ENCODE_CONTAINER", label=""),
                    CandidateAction(id="ACT_REJECT_CLIPPED_AUDIO", label=""),
                    CandidateAction(id="ACT_REJECT_SILENT_AUDIO", label=""),
                    CandidateAction(id="ACT_REJECT_DURATION_DISCREPANCY", label=""),
                ] if a.id != win_act and a.id != "ACT_TRUST_PROVIDER_METADATA_BLIND"}
            },
            provenance_tier="GOLD" if seq <= 14 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Multi-Engine Voice Fallback Cascade (8 packets)
    tts_cascades = [
        ("GeminiTTSProvider primary returned 429 quota exhaustion; EdgeTTS fallback is healthy", "ACT_FALLOVER_TO_EDGE_TTS"),
        ("GeminiTTSProvider authentication failed with invalid API key; fallback to local System TTS", "ACT_FALLOVER_TO_SYSTEM_TTS"),
        ("ElevenLabs primary timed out (> 15s latency); fast switch to GeminiTTS", "ACT_FALLOVER_TO_GEMINI_TTS"),
        ("All external cloud TTS providers unavailable (network offline); local offline Piper/eSpeak available", "ACT_USE_LOCAL_OFFLINE_TTS"),
        ("EdgeTTS returned degraded audio with artifact glitches; failover to GeminiTTS", "ACT_FAILOVER_DEGRADED_AUDIO"),
        ("GeminiTTS successful: generated 16-bit 24kHz audio with 120ms latency", "ACT_RECORD_PRIMARY_SUCCESS"),
        ("Custom voice profile requires specific voice clone not supported by EdgeTTS", "ACT_REQUIRE_CAPABLE_VOICE_CLONE_PROVIDER"),
        ("VoiceFabric budget exhausted for the mission; fallback to pre-rendered silent audio with caption focus", "ACT_APPLY_EMERGENCY_SILENT_FALLBACK"),
    ]
    for desc, win_act in tts_cascades:
        p = make_packet(
            packet_id=f"sf_d05_{seq:03d}",
            domain="D05",
            floor_id="F04",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d05_{seq:03d}",
                content_engine="motivation",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"TTS engine routing condition: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="VoiceFabric.ts:resolveEngineFallback",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Voice engine router event: {win_act}", evidence_type="OBSERVED_PROVIDER"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Preserve voice delivery contracts.", "Never mask fallback tier as PRIMARY in telemetry."],
            candidate_actions=[
                CandidateAction(id="ACT_FALLOVER_TO_EDGE_TTS", label="Switch to EdgeTTS and tag output artifact qualityClass as FALLBACK"),
                CandidateAction(id="ACT_FALLOVER_TO_SYSTEM_TTS", label="Switch to local System TTS and tag qualityClass as DEGRADED_FALLBACK"),
                CandidateAction(id="ACT_FALLOVER_TO_GEMINI_TTS", label="Failover to GeminiTTS provider and record ElevenLabs latency breach"),
                CandidateAction(id="ACT_USE_LOCAL_OFFLINE_TTS", label="Route voice synthesis to local offline Piper neural engine"),
                CandidateAction(id="ACT_FAILOVER_DEGRADED_AUDIO", label="Reject degraded audio stream and re-route to secondary high-fidelity engine"),
                CandidateAction(id="ACT_RECORD_PRIMARY_SUCCESS", label="Accept audio as PRIMARY qualityClass with verified cryptographic provenance"),
                CandidateAction(id="ACT_REQUIRE_CAPABLE_VOICE_CLONE_PROVIDER", label="Route specifically to provider supporting voice clone embedding"),
                CandidateAction(id="ACT_APPLY_EMERGENCY_SILENT_FALLBACK", label="Apply deterministic silent baseline audio with amplified kinetic captions"),
                CandidateAction(id="ACT_DISGUISE_FALLBACK_AS_PRIMARY", label="Tag EdgeTTS fallback audio as PRIMARY in telemetry to hide degradation"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_DISGUISE_FALLBACK_AS_PRIMARY": "INVARIANT_VIOLATION_ERR_HONESTY: Falsifying qualityClass in telemetry violates Principle 5 (Absolute Telemetry Honesty).",
                **{a.id: f"ROUTING_ACTION_MISMATCH: Action '{a.id}' does not match TTS condition." for a in [
                    CandidateAction(id="ACT_FALLOVER_TO_EDGE_TTS", label=""),
                    CandidateAction(id="ACT_FALLOVER_TO_SYSTEM_TTS", label=""),
                    CandidateAction(id="ACT_FALLOVER_TO_GEMINI_TTS", label=""),
                    CandidateAction(id="ACT_USE_LOCAL_OFFLINE_TTS", label=""),
                    CandidateAction(id="ACT_FAILOVER_DEGRADED_AUDIO", label=""),
                    CandidateAction(id="ACT_RECORD_PRIMARY_SUCCESS", label=""),
                    CandidateAction(id="ACT_REQUIRE_CAPABLE_VOICE_CLONE_PROVIDER", label=""),
                    CandidateAction(id="ACT_APPLY_EMERGENCY_SILENT_FALLBACK", label=""),
                ] if a.id != win_act and a.id != "ACT_DISGUISE_FALLBACK_AS_PRIMARY"}
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
