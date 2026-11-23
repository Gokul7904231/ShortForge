"""Domain D09: F07_RELEASE_GUARDIAN
Covers all 15 sequential gates (G00 to G14), rejecting stale fencing tokens,
rejecting /tmp/ paths lacking two-level CAS SHA-256 digests, forbidding synthetic/fallback
hashes, and requiring F07VerificationReceipt (Ed25519) + DurableAuthorization before YouTube publication.
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
    "apps/web/factoryos/core/verification/youtube/F07ReleaseGuardian.ts",
    "apps/web/factoryos/core/verification/youtube/gates/G00_G02_Gates.ts",
    "apps/web/factoryos/core/verification/youtube/gates/G12_G14_Gates.ts",
    "apps/web/factoryos/core/verification/youtube/crypto/F07CryptoSigner.ts",
    "apps/web/factoryos/core/verification/youtube/contracts/F07ReleaseContracts.ts",
    "apps/web/factoryos/core/verification/youtube/VerificationReceipt.ts",
    ".okf/principles.md",
]


def generate_d09_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Gates G00 to G14 Fail-Closed Evaluation (15 packets, 1 per gate)
    gate_scenarios = [
        ("G00_POLICY_FRESHNESS", "Policy snapshot retrieved 38 days ago (exceeds 30-day limit)", "POLICY_STALE", "ACT_BLOCK_G00_POLICY_STALE"),
        ("G01_CHANNEL_ELIGIBILITY", "Channel has active strike on copyright and YPP suspended", "BLOCKED", "ACT_BLOCK_G01_CHANNEL_STRIKE"),
        ("G02_COMMUNITY_SAFETY", "Script contains hate speech phrase flagged by safety classifier", "BLOCKED", "ACT_BLOCK_G02_SAFETY_VIOLATION"),
        ("G03_ADVERTISER_FRIENDLY", "Video discusses sensitive medical misinformation without context", "ADVERTISER_REVIEW", "ACT_RESTRICT_G03_ADVERTISER_REVIEW"),
        ("G04_COPYRIGHT_CONTENT_ID", "Background music matches Universal Music Content ID fingerprint", "BLOCK_PUBLICATION", "ACT_BLOCK_G04_COPYRIGHT_MATCH"),
        ("G05_REPETITIOUS_CONTENT", "Video text and scene structure is 92% identical to 3 recent uploads", "BLOCKED", "ACT_BLOCK_G05_REPETITIOUS_CONTENT"),
        ("G06_REUSED_CONTENT", "Video compiles external clip without transformative voice commentary", "BLOCKED", "ACT_BLOCK_G06_REUSED_CONTENT"),
        ("G07_MISLEADING_METADATA", "Thumbnail promises 'Aliens Found on Mars' while video discusses rocks", "BLOCKED", "ACT_BLOCK_G07_MISLEADING_METADATA"),
        ("G08_SYNTHETIC_DISCLOSURE", "Video contains AI generated photorealistic faces without disclosure tag", "DISCLOSURE_REQUIRED", "ACT_ENFORCE_G08_SYNTHETIC_DISCLOSURE"),
        ("G09_MADE_FOR_KIDS", "Animation style targets toddlers; selfDeclaredMadeForKids was false", "FLAG_MADE_FOR_KIDS", "ACT_ENFORCE_G09_KIDS_DESIGNATION"),
        ("G10_TECHNICAL_CONTAINER", "MP4 file is missing 'moov' atom at end of file (truncated video)", "CORRUPT_CONTAINER", "ACT_BLOCK_G10_CORRUPT_CONTAINER"),
        ("G11_AUDIO_LOUDNESS", "Integrated audio loudness is -6 LUFS (extreme loudness, exceeds -14 LUFS standard)", "AUDIO_LOUDNESS_BREACH", "ACT_NORMALIZE_G11_AUDIO_LOUDNESS"),
        ("G12_SHORTS_ELIGIBILITY", "Video aspect ratio is 16:9 horizontal (1920x1080) for YouTube Shorts", "INELIGIBLE_GEOMETRY", "ACT_BLOCK_G12_INELIGIBLE_ASPECT_RATIO"),
        ("G13_CREATIVE_FATIGUE", "Channel uploaded 8 quiz videos with identical visual theme this week", "FATIGUE_EXHAUSTED", "ACT_TRIGGER_G13_CREATIVE_VARIATION"),
        ("G14_EVIDENCE_RECONCILIATION", "Claim in Scene 2 has missing EvidenceRef pointer in evidence ledger", "UNGROUNDED_EVIDENCE", "ACT_BLOCK_G14_UNGROUNDED_EVIDENCE"),
    ]
    for gate_id, condition_desc, finding_code, win_act in gate_scenarios:
        p = make_packet(
            packet_id=f"sf_d09_{seq:03d}",
            domain="D09",
            floor_id="F07",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d09_{seq:03d}",
                content_engine="quiz",
                target_duration_sec=30,
                reversibility="IRREVERSIBLE",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Release Guardian gate {gate_id} audit finding: {condition_desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="F07ReleaseGuardian.ts:evaluateAllGates",
                ),
                VerifiedFact(
                    fact="F07 Release Invariant: Invariant 1 (CLAIM <= EVIDENCE) & Invariant 2 (NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION). Gates must fail closed on critical findings.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="F07ReleaseContracts.ts:ReleaseInvariants",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Gate evaluation finding: gate={gate_id}, status={finding_code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Gate violation: {condition_desc}"],
            constraints=["Never authorize upload when a blocking gate fails.", "F07 never optimizes for 'PASS'; F07 optimizes for truth."],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Enforce gate finding: {win_act} and withhold publication authorization"),
                CandidateAction(id="ACT_FORCE_PUBLISH_BYPASS_GATES", label="Bypass gate failure and execute live YouTube publication anyway to hit daily upload quota"),
                CandidateAction(id="ACT_MOCK_VERIFICATION_RECEIPT", label="Forge a fake Ed25519 cryptographic receipt signature to satisfy gate requirements"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_FORCE_PUBLISH_BYPASS_GATES": "SECURITY_VIOLATION_GATE_BYPASS: Publishing a video that failed an F07 release gate risks channel strikes and account suspension.",
                "ACT_MOCK_VERIFICATION_RECEIPT": "SECURITY_VIOLATION_CRYPTO_FORGERY: Generating fake cryptographic signatures violates core invariant boundaries.",
            },
            provenance_tier="GOLD" if seq <= 6 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Two-Level CAS Storage & /tmp/ Path Rejection (8 packets)
    storage_scenarios = [
        ("/data/workspace/ShortForge/apps/web/data/cas_storage/77/77cfc8f6b568ad4e73e6e5ba0e0e1f0f0c0693703c6ead6dd1cd5cdf53b4a78b.mp4", True, "ACT_APPROVE_TWO_LEVEL_CAS_PATH"),
        ("/tmp/render_job_123.mp4", False, "ACT_REJECT_TMP_PATH"),
        ("C:\\Windows\\Temp\\render_out.mp4", False, "ACT_REJECT_SYSTEM_TEMP_PATH"),
        ("/data/cas_storage/invalid_hash.mp4", False, "ACT_REJECT_FLAT_NON_DIGEST_PATH"),
        ("/data/cas_storage/ab/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890.mp4", True, "ACT_APPROVE_TWO_LEVEL_CAS_PATH"),
        ("/tmp/scratch/output.mp4", False, "ACT_REJECT_TMP_PATH"),
        ("/var/tmp/shortforge.mp4", False, "ACT_REJECT_TMP_PATH"),
        ("/data/cas_storage/cd/cdef567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef.mp4", True, "ACT_APPROVE_TWO_LEVEL_CAS_PATH"),
    ]
    for file_path, is_valid_cas, win_act in storage_scenarios:
        p = make_packet(
            packet_id=f"sf_d09_{seq:03d}",
            domain="D09",
            floor_id="F07",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d09_{seq:03d}",
                content_engine="facts",
                target_duration_sec=60,
                reversibility="IRREVERSIBLE",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Artifact storage path declared for YouTube release: '{file_path}'.",
                    evidence_type="VERIFIED_FACT",
                    ref="F07PhysicalArtifactVerifier.ts:verifyStoragePlacement",
                ),
                VerifiedFact(
                    fact="F07 CAS Storage Rule: Release artifacts must be stored in immutable two-level content-addressed storage (/cas_storage/xx/xxhash.mp4). Temporary directories (/tmp/, /var/tmp/) are strictly rejected.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 2 (Temporary & Generated Artifacts Hygiene)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"CAS path format check: is_valid_two_level={is_valid_cas}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Reject /tmp/ paths.", "Verify two-level directory sharding matching SHA-256 prefix."],
            candidate_actions=[
                CandidateAction(id="ACT_APPROVE_TWO_LEVEL_CAS_PATH", label="Approve verified two-level CAS path matching computed artifact SHA-256 digest"),
                CandidateAction(id="ACT_REJECT_TMP_PATH", label="Reject temporary path with TemporaryStorageLocationError; require staging into CAS"),
                CandidateAction(id="ACT_REJECT_SYSTEM_TEMP_PATH", label="Reject Windows/system temp path; require relocation to content-addressed storage"),
                CandidateAction(id="ACT_REJECT_FLAT_NON_DIGEST_PATH", label="Reject flat directory path lacking SHA-256 two-level directory sharding"),
                CandidateAction(id="ACT_PUBLISH_FROM_TMP_BLIND", label="Upload video directly from /tmp/ before it gets purged by cron cleaner"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_PUBLISH_FROM_TMP_BLIND": "STORAGE_VIOLATION_TMP_PUBLISH: Publishing from temporary scratch paths violates CAS immutability and risks uploading incomplete files.",
                **{
                    aid: f"STORAGE_ACTION_MISMATCH: Action '{aid}' contradicts storage path state '{file_path}'."
                    for aid in [
                        "ACT_APPROVE_TWO_LEVEL_CAS_PATH",
                        "ACT_REJECT_TMP_PATH",
                        "ACT_REJECT_SYSTEM_TEMP_PATH",
                        "ACT_REJECT_FLAT_NON_DIGEST_PATH",
                    ]
                    if aid != win_act
                },
            },
            provenance_tier="GOLD" if seq <= 19 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Cryptographic Authorization & Irreversible Upload Gate (7 packets)
    crypto_scenarios = [
        ("Valid Ed25519 signature on VerificationReceipt + valid CAS SHA-256 + all gates PASS", "READY_FOR_RELEASE", "ACT_ISSUE_RELEASE_AUTHORIZATION"),
        ("VerificationReceipt present, but Ed25519 signature fails verification against trusted public key", "SIGNATURE_INVALID", "ACT_REJECT_INVALID_SIGNATURE"),
        ("Release authorization attempted, but publication intent has expired (timestamp > 24 hours old)", "AUTH_EXPIRED", "ACT_REJECT_EXPIRED_INTENT"),
        ("Release authorization attempted, but targetChannelId does not match channel in authorization scope", "CHANNEL_MISMATCH", "ACT_REJECT_CHANNEL_MISMATCH"),
        ("ReleaseAuthorization status is already 'CONSUMED' (replay attack attempt)", "CONSUMED_REPLAY", "ACT_REJECT_REPLAY_ATTACK"),
        ("ReleaseAuthorization has valid signature and active status; authorizing irreversible upload", "VALID_ACTIVE_AUTH", "ACT_DISPATCH_AUTHORIZED_UPLOAD"),
        ("Attempted upload without any ReleaseAuthorization object present", "MISSING_AUTHORIZATION", "ACT_BLOCK_UNAUTHORIZED_UPLOAD"),
    ]
    for desc, code, win_act in crypto_scenarios:
        p = make_packet(
            packet_id=f"sf_d09_{seq:03d}",
            domain="D09",
            floor_id="F07",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d09_{seq:03d}",
                content_engine="history",
                target_duration_sec=60,
                reversibility="IRREVERSIBLE",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Cryptographic publication authorization evaluation: {desc}.",
                    evidence_type="VERIFIED_FACT",
                    ref="F07CryptoSigner.ts:verifyReleaseSignature",
                ),
                VerifiedFact(
                    fact="F07 Publication Invariant: NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION. Replay of consumed authorizations or invalid cryptographic signatures must fail closed.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="F07ReleaseContracts.ts:AuthorizedPublication",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Crypto gate status: {code}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Never upload without valid active Ed25519 ReleaseAuthorization.", "Prevent replay attacks."],
            candidate_actions=[
                CandidateAction(id="ACT_ISSUE_RELEASE_AUTHORIZATION", label="Issue active signed ReleaseAuthorization with Ed25519 signature, nonce, and 1-hour expiration"),
                CandidateAction(id="ACT_DISPATCH_AUTHORIZED_UPLOAD", label="Execute streaming upload to YouTube API authenticated by active ReleaseAuthorization"),
                CandidateAction(id="ACT_REJECT_INVALID_SIGNATURE", label="Reject publication with CryptographicVerificationFailedError and log tamper event"),
                CandidateAction(id="ACT_REJECT_EXPIRED_INTENT", label="Reject expired intent and require complete re-verification pass across all gates"),
                CandidateAction(id="ACT_REJECT_CHANNEL_MISMATCH", label="Reject publication due to channel scope mismatch to prevent cross-channel leakage"),
                CandidateAction(id="ACT_REJECT_REPLAY_ATTACK", label="Reject consumed authorization token with TokenAlreadyConsumedError"),
                CandidateAction(id="ACT_BLOCK_UNAUTHORIZED_UPLOAD", label="Block upload immediately: missing required ReleaseAuthorization object"),
                CandidateAction(id="ACT_UPLOAD_UNAUTHORIZED_DIRECT", label="Upload video directly using raw stored YouTube OAuth refresh token without F07 authorization"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_UPLOAD_UNAUTHORIZED_DIRECT": "SECURITY_VIOLATION_UNAUTHORIZED_PUBLISH: Bypassing F07 release authorization to upload directly destroys safety invariants.",
                **{a.id: f"AUTH_ACTION_MISMATCH: Action '{a.id}' contradicts state '{code}'." for a in [
                    CandidateAction(id="ACT_ISSUE_RELEASE_AUTHORIZATION", label=""),
                    CandidateAction(id="ACT_DISPATCH_AUTHORIZED_UPLOAD", label=""),
                    CandidateAction(id="ACT_REJECT_INVALID_SIGNATURE", label=""),
                    CandidateAction(id="ACT_REJECT_EXPIRED_INTENT", label=""),
                    CandidateAction(id="ACT_REJECT_CHANNEL_MISMATCH", label=""),
                    CandidateAction(id="ACT_REJECT_REPLAY_ATTACK", label=""),
                    CandidateAction(id="ACT_BLOCK_UNAUTHORIZED_UPLOAD", label=""),
                ] if a.id != win_act and a.id != "ACT_UPLOAD_UNAUTHORIZED_DIRECT"}
            },
            provenance_tier="GOLD" if seq <= 25 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
