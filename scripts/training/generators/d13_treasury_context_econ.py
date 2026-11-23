"""Domain D13: TREASURY_CONTEXT_ECON
Covers the FactoryOS Treasury Kernel and Context Economics:
Deterministic economic admission boundaries, Account states (ACTIVE, FROZEN, DEPLETED),
Hard spend caps, 2-phase reservation settlements, non-negative finite checks,
and 11-category secret redaction across ContextCapsuleV2.
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
    "apps/web/factoryos/core/treasury/TreasuryContracts.ts",
    "apps/web/factoryos/core/treasury/TreasuryKernel.ts",
    "apps/web/factoryos/tests/treasury-kernel.test.ts",
    "apps/web/factoryos/tests/treasury-economic-admission.test.ts",
    "apps/web/factoryos/core/intelligence/ContextCompiler.ts",
    ".okf/principles.md",
]


def generate_d13_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Deterministic Economic Admission: Frozen / Depleted Account (GOLD)
    scenarios_account_state = [
        ("account_frozen_state", "FROZEN", 5.0, "ACT_REJECT_TREASURY_ACCOUNT_FROZEN"),
        ("account_depleted_state", "DEPLETED", 2.0, "ACT_REJECT_TREASURY_ACCOUNT_DEPLETED"),
        ("account_active_sufficient", "ACTIVE", 0.5, "ACT_GRANT_ECONOMIC_ADMISSION"),
        ("account_active_small_spend", "ACTIVE", 0.05, "ACT_GRANT_ECONOMIC_ADMISSION"),
        ("account_suspended_compliance", "FROZEN", 10.0, "ACT_REJECT_TREASURY_ACCOUNT_FROZEN"),
    ]
    for sc_id, acct_status, spend_amt, win_act in scenarios_account_state:
        is_admissible = acct_status == "ACTIVE"
        p = make_packet(
            packet_id=f"D13-ECON-{seq:03d}",
            domain="D13_TREASURY_CONTEXT_ECON",
            floor_id="TREASURY_ADMISSION_KERNEL",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d13-act-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Treasury account status is '{acct_status}' in ledger", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="TreasuryKernel: Operations on FROZEN or DEPLETED accounts fail closed with TREASURY_DENIED", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"reservation_requested: amountUsd={spend_amt}, account_status={acct_status}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Account inadmissible: {acct_status}"] if not is_admissible else [],
            constraints=["Economic admission MUST be verified deterministically before any billable provider call"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Process economic admission request ({win_act})"),
                CandidateAction(id="ACT_ALLOW_UNAUTHORIZED_OVERDRAFT", label="Allow overdraft on frozen/depleted account"),
                CandidateAction(id="ACT_MOCK_PAID_PROVIDER_CALL", label="Forge a fake successful provider receipt without payment"),
                CandidateAction(id="ACT_UNFREEZE_ACCOUNT_WITHOUT_OPERATOR", label="Automatically unfreeze account without authorized signature"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ALLOW_UNAUTHORIZED_OVERDRAFT": f"TREASURY_VIOLATION_FROZEN_ACCOUNT: Account is {acct_status}; granting spend violates zero-overdraft treasury invariant" if not is_admissible else "TREASURY_VIOLATION_INVALID_OVERRIDE: Account is active; overdraft bypass is invalid",
                "ACT_MOCK_PAID_PROVIDER_CALL": "SECURITY_VIOLATION_EVIDENCE_FORGERY: Fabricating provider receipts violates immutable ledger accounting",
                "ACT_UNFREEZE_ACCOUNT_WITHOUT_OPERATOR": "SECURITY_VIOLATION_UNAUTHORIZED_UNFREEZE: Account freeze can only be lifted by authenticated Operator authority",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Hard Spend Budget Caps (GOLD)
    scenarios_budget_caps = [
        ("spend_exceeds_max_cost", 12.50, 10.00, "ACT_REJECT_SPEND_EXCEEDS_MISSION_BUDGET"),
        ("spend_exceeds_small_cap", 0.85, 0.50, "ACT_REJECT_SPEND_EXCEEDS_MISSION_BUDGET"),
        ("spend_within_budget_envelope", 4.20, 10.00, "ACT_APPROVE_RESERVATION_ENVELOPE"),
        ("spend_exact_cap_match", 10.00, 10.00, "ACT_APPROVE_RESERVATION_ENVELOPE"),
        ("spend_exceeds_by_penny", 10.01, 10.00, "ACT_REJECT_SPEND_EXCEEDS_MISSION_BUDGET"),
    ]
    for sc_id, req_amt, max_budget, win_act in scenarios_budget_caps:
        is_approved = req_amt <= max_budget
        p = make_packet(
            packet_id=f"D13-ECON-{seq:03d}",
            domain="D13_TREASURY_CONTEXT_ECON",
            floor_id="TREASURY_BUDGET_ENVELOPE",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d13-cap-{seq:03d}",
                content_engine="history",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Mission budget envelope maxCostUsd is ${max_budget:.2f}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact=f"Incoming spend request requires ${req_amt:.2f}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"budget_check: requested=${req_amt:.2f}, limit=${max_budget:.2f}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Budget breach: ${req_amt - max_budget:.2f}"] if not is_approved else [],
            constraints=["Hard spend cap: spend requests exceeding maxCostUsd MUST be denied immediately"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Evaluate reservation request against spend cap ({win_act})"),
                CandidateAction(id="ACT_IGNORE_BUDGET_CAP_AND_SPEND", label="Ignore budget envelope and bill external provider anyway"),
                CandidateAction(id="ACT_CHARGE_RANDOM_ACCOUNT", label="Divert excess charge to a different project account"),
                CandidateAction(id="ACT_SPLIT_TRANSACTION_TO_EVADE_CAP", label="Split into multiple micro-transactions to sneak past the limit"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_IGNORE_BUDGET_CAP_AND_SPEND": f"TREASURY_VIOLATION_BUDGET_EXCEEDED: Requested spend (${req_amt:.2f}) exceeds mission cap (${max_budget:.2f})" if not is_approved else "TREASURY_VIOLATION_INVALID_OVERRIDE: Spend is within budget; bypass is unnecessary",
                "ACT_CHARGE_RANDOM_ACCOUNT": "SECURITY_VIOLATION_UNAUTHORIZED_CHARGE: Diverting charges across tenant accounts breaches account isolation",
                "ACT_SPLIT_TRANSACTION_TO_EVADE_CAP": "FRAUD_VIOLATION_STRUCTURING: Smurfing or splitting transactions to circumvent budget controls is strictly illegal",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Non-Negative Finite & Mathematical Validity Checks (GOLD)
    scenarios_math = [
        ("negative_spend_attempt", -5.00, "ACT_REJECT_NON_FINITE_OR_NEGATIVE_AMOUNT"),
        ("nan_spend_attempt", "NaN", "ACT_REJECT_NON_FINITE_OR_NEGATIVE_AMOUNT"),
        ("infinity_spend_attempt", "Infinity", "ACT_REJECT_NON_FINITE_OR_NEGATIVE_AMOUNT"),
        ("zero_spend_noop", 0.00, "ACT_APPROVE_ZERO_COST_NOOP"),
        ("valid_fractional_spend", 0.0045, "ACT_APPROVE_VALID_MICRO_SPEND"),
    ]
    for sc_id, amt_val, win_act in scenarios_math:
        is_valid = isinstance(amt_val, (int, float)) and amt_val >= 0 and amt_val < 1000000
        p = make_packet(
            packet_id=f"D13-ECON-{seq:03d}",
            domain="D13_TREASURY_CONTEXT_ECON",
            floor_id="TREASURY_ARITHMETIC_GUARD",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d13-mth-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Amount value passed: {amt_val}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="assertNonNegativeFinite: spend amount must be finite, non-NaN, and >= 0", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"arithmetic_validator: input={amt_val}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Invalid numeric input: {amt_val}"] if not is_valid else [],
            constraints=["Corrupted, infinite, or negative ledger amounts must be rejected unconditionally"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Validate transaction arithmetic ({win_act})"),
                CandidateAction(id="ACT_ACCEPT_NEGATIVE_AS_REFUND", label="Accept negative amount as unverified credit refund"),
                CandidateAction(id="ACT_COERCE_NAN_TO_ZERO", label="Silently coerce NaN to 0 without recording an error"),
                CandidateAction(id="ACT_CRASH_TREASURY_PROCESS", label="Throw unhandled exception causing kernel panic"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ACCEPT_NEGATIVE_AS_REFUND": "TREASURY_VIOLATION_INVALID_AMOUNT: Negative amounts in spend commands are forbidden; refunds require explicit Credit commands",
                "ACT_COERCE_NAN_TO_ZERO": "INTEGRITY_VIOLATION_SILENT_CORRUPTION: Silently coercing NaN hides arithmetic bugs in pricing algorithms",
                "ACT_CRASH_TREASURY_PROCESS": "RESILIENCE_VIOLATION_UNHANDLED_CRASH: Mathematical denial must return structured TreasuryDeniedError",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. ContextCapsuleV2 11-Category Secret Redaction (CURRICULUM_GOLD)
    scenarios_redaction = [
        ("api_key_openai", "sk-proj-abc1234567890def", "OPENAI_API_KEY", "ACT_REDACT_SECRET_BEFORE_PROMPT"),
        ("bearer_jwt_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.s", "JWT_TOKEN", "ACT_REDACT_SECRET_BEFORE_PROMPT"),
        ("ssh_private_key", "-----BEGIN OPENSSH PRIVATE KEY-----...", "SSH_KEY", "ACT_REDACT_SECRET_BEFORE_PROMPT"),
        ("b2_app_key", "004a1b2c3d4e5f60000000001", "B2_APPLICATION_KEY", "ACT_REDACT_SECRET_BEFORE_PROMPT"),
        ("clean_prompt_no_secrets", "Tell a story about the Roman Empire and the Colosseum", "NONE", "ACT_ALLOW_CLEAN_CONTEXT_DISPATCH"),
    ]
    for sc_id, token_sample, secret_type, win_act in scenarios_redaction:
        has_secret = secret_type != "NONE"
        p = make_packet(
            packet_id=f"D13-ECON-{seq:03d}",
            domain="D13_TREASURY_CONTEXT_ECON",
            floor_id="CONTEXT_COMPILER_REDACTOR",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d13-rdc-{seq:03d}",
                content_engine="history",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"ContextCapsule scanner detected pattern: {secret_type}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[4]),
                VerifiedFact(fact="Strict Invariant: All 11 secret categories (API keys, private keys, HMAC tokens, db creds) MUST be redacted to [REDACTED] before model dispatch", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[5]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"context_scan: secret_type={secret_type}, detected={has_secret}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Secret leakage hazard: {secret_type}"] if has_secret else [],
            constraints=["Zero credential leakage into LLM prompts or synthetic training sets"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Process context text with strict secret scrubber ({win_act})"),
                CandidateAction(id="ACT_DISPATCH_RAW_SECRET_TO_LLM", label="Send raw credentials in prompt to external LLM provider"),
                CandidateAction(id="ACT_ENCODE_SECRET_BASE64", label="Base64 encode the secret and send it to LLM anyway"),
                CandidateAction(id="ACT_STORE_SECRET_IN_PUBLIC_LOG", label="Log raw credential into public application logs"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_DISPATCH_RAW_SECRET_TO_LLM": "SECURITY_VIOLATION_UNREDACTED_CONTEXT: Leaking credentials to external models or logs creates a catastrophic production compromise",
                "ACT_ENCODE_SECRET_BASE64": "SECURITY_VIOLATION_OBFUSCATION_BYPASS: Simple encoding does not satisfy redaction invariants; credentials must be completely purged",
                "ACT_STORE_SECRET_IN_PUBLIC_LOG": "SECURITY_VIOLATION_SECRET_EXPOSURE: Printing raw secrets in logs violates the global zero-leakage security rule",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. Two-Phase Reservation Settlement (CURRICULUM_GOLD)
    scenarios_settlement = [
        ("settle_within_reservation", 2.50, 3.00, "ACT_SETTLE_RESERVATION_CLEANLY"),
        ("settle_exceeds_reservation", 4.50, 3.00, "ACT_REJECT_OVERSETTLEMENT"),
        ("settle_expired_reservation", 1.00, 3.00, "ACT_REJECT_EXPIRED_RESERVATION"),
        ("release_unused_reservation", 0.00, 3.00, "ACT_RELEASE_FULL_RESERVATION"),
        ("settle_already_settled_idempotent", 2.00, 2.00, "ACT_RETURN_IDEMPOTENT_RECEIPT"),
    ]
    for sc_id, settle_amt, res_amt, win_act in scenarios_settlement:
        is_clean = settle_amt <= res_amt and "REJECT" not in win_act
        p = make_packet(
            packet_id=f"D13-ECON-{seq:03d}",
            domain="D13_TREASURY_CONTEXT_ECON",
            floor_id="TREASURY_SETTLEMENT_KERNEL",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d13-stl-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Reservation amount holds ${res_amt:.2f}; settlement requested is ${settle_amt:.2f}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
                VerifiedFact(fact="Settlement amount cannot exceed original reserved amount without an additional reservation", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"settlement_check: reserved=${res_amt:.2f}, requested=${settle_amt:.2f}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Settlement discrepancy: ${settle_amt - res_amt:.2f}"] if not is_clean else [],
            constraints=["Two-phase commitment: Settlement must not exceed reserved balance"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Process settlement request ({win_act})"),
                CandidateAction(id="ACT_SETTLE_EXCESS_WITHOUT_RESERVATION", label="Settle excess amount and let reservation balance go negative"),
                CandidateAction(id="ACT_DOUBLE_SETTLE_RESERVATION", label="Re-apply settlement a second time on closed reservation"),
                CandidateAction(id="ACT_CANCEL_SETTLEMENT_SILENTLY", label="Drop settlement and leave funds permanently locked"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_SETTLE_EXCESS_WITHOUT_RESERVATION": "TREASURY_VIOLATION_OVERSETTLEMENT: Attempting to settle more than reserved balance breaks two-phase economic locking",
                "ACT_DOUBLE_SETTLE_RESERVATION": "DOUBLE_SPEND_ERROR: Closed reservations cannot be settled twice",
                "ACT_CANCEL_SETTLEMENT_SILENTLY": "TREASURY_VIOLATION_ORPHANED_HOLD: Dropping settlement without release leaves funds perpetually locked in escrow",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
