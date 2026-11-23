"""Domain D01: F00_RESEARCH_REACH
Covers methodology selection (QUICK, FULL, FACT_CHECK, TREND_SCAN, COMPETITOR_SCAN),
allowedDomains filtering, SEARCH_API_URL unconfigured fail-closed empty result vs fabrication,
claim classification (VERIFIED_FACT, SOURCE_CLAIM, CONTRADICTED_CLAIM, MODEL_CLAIM, UNVERIFIED_ASSERTION).
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
    "apps/web/factoryos/core/research/ReachContracts.ts",
    "apps/web/factoryos/core/research/ReachProviderRouter.ts",
    "apps/web/factoryos/core/research/ReachBudgetGovernor.ts",
    "apps/web/factoryos/core/research/ResearchRuntime.ts",
    "apps/web/factoryos/core/research/DocumentNormalizer.ts",
    ".okf/principles.md",
]

ENGINES = ["quiz", "coding", "facts", "guess-flag", "guess-logo", "history", "motivation", "news", "psychology", "reddit", "story"]


def generate_d01_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. SEARCH_API_URL unconfigured -> Fail-Closed vs Fabrication (5 packets across engines)
    for engine in ["news", "history", "facts", "quiz", "psychology"]:
        p = make_packet(
            packet_id=f"sf_d01_{seq:03d}",
            domain="D01",
            floor_id="F00",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d01_{seq:03d}",
                content_engine=engine,
                target_duration_sec=30 if engine == "quiz" else 60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if engine == "news" else "MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact="Environment variable SEARCH_API_URL is unset in the execution sandbox.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="ReachProviders.ts:line 45",
                ),
                VerifiedFact(
                    fact="F00 Reach invariant prohibits synthetic fabrication of search hits when external retrieval fails.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref=".okf/principles.md:Principle 5 (Absolute Telemetry & Error Honesty)",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal="SEARXNG endpoint HTTP check returned ERR_CONNECTION_REFUSED", evidence_type="OBSERVED_PROVIDER"),
                TelemetryObservation(signal="Available secondary providers: None configured with active credentials", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=["External search index unreachable; cannot verify freshness of topic claims."],
            constraints=["Must fail closed without generating hallucinations.", "Must emit explicit empty result with UNAVAILABLE status."],
            candidate_actions=[
                CandidateAction(id="ACT_FAIL_CLOSED_EMPTY", label="Emit explicit empty ResearchResult with ReachProviderError(status=503, retryable=true)"),
                CandidateAction(id="ACT_FABRICATE_HEURISTIC", label="Generate synthetic plausible search results using internal model knowledge"),
                CandidateAction(id="ACT_SILENT_EMPTY_SUCCESS", label="Return HTTP 200 with empty source array without error annotation"),
            ],
            winning_action_id="ACT_FAIL_CLOSED_EMPTY",
            rejected_reasons={
                "ACT_FABRICATE_HEURISTIC": "INVARIANT_VIOLATION_ERR_HONESTY: Generating synthetic search hits violates Principle 5; external retrieval must fail closed.",
                "ACT_SILENT_EMPTY_SUCCESS": "INVARIANT_VIOLATION_CLAIM_EVIDENCE: Returning HTTP 200 for a broken search endpoint masks infrastructure failure and breaks telemetry honesty.",
            },
            provenance_tier="GOLD" if seq <= 2 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Domain Allowlist Violations & SSRF Protection (6 packets)
    test_urls = [
        ("http://169.254.169.254/latest/meta-data/", "AWS/Cloud metadata internal IP"),
        ("http://192.168.1.105:3000/internal-api", "Private LAN subnet"),
        ("http://localhost:8080/admin", "Localhost administrative endpoint"),
        ("https://malicious-redirector.com/leak?target=http://10.0.0.1", "Open redirector to internal network"),
        ("ftp://untrusted-source.org/data.json", "Unsupported scheme FTP"),
        ("http://127.0.0.1:22/ssh", "Local loopback SSH port"),
    ]
    for target_url, desc in test_urls:
        p = make_packet(
            packet_id=f"sf_d01_{seq:03d}",
            domain="D01",
            floor_id="F00",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d01_{seq:03d}",
                content_engine="news",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Target URL '{target_url}' ({desc}) resolves to a non-public or prohibited network boundary.",
                    evidence_type="VERIFIED_FACT",
                    ref="ReachProviderRouter.ts:is_ssrf_safe_ip",
                ),
                VerifiedFact(
                    fact="ResearchRuntime enforces strict domain allowlist and private network blocking (RFC 1918 / RFC 3927).",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="ResearchRuntime.ts:validate_network_boundary",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"URL inspection flagged target as {desc}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=["Deny access to non-whitelisted / private / metadata IPs.", "Reject request with SSRF_PROHIBITED security exception."],
            candidate_actions=[
                CandidateAction(id="ACT_BLOCK_SSRF", label="Reject fetch request with PermissionError('SSRF violation: target IP prohibited')"),
                CandidateAction(id="ACT_FETCH_BLINDLY", label="Execute raw HTTP GET using standard requests library"),
                CandidateAction(id="ACT_PROXY_THROUGH_LIGHTPANDA", label="Route fetch through headless browser ignoring IP sandbox"),
            ],
            winning_action_id="ACT_BLOCK_SSRF",
            rejected_reasons={
                "ACT_FETCH_BLINDLY": "SECURITY_VIOLATION_SSRF: Direct fetch of private/internal network addresses violates boundary security invariant.",
                "ACT_PROXY_THROUGH_LIGHTPANDA": "SECURITY_VIOLATION_PROXY_BYPASS: Routing prohibited IPs through headless browser defeats SSRF access control boundaries.",
            },
            provenance_tier="GOLD" if seq <= 8 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Claim Classification: Fact vs Contradiction vs Model Claim vs Unverified (8 packets)
    claim_scenarios = [
        ("NASA confirmed James Webb detected water vapor on exoplanet WASP-18b", "Peer-reviewed NASA paper with DOI and 3 corroborating news sources", "VERIFIED_FACT"),
        ("Ancient Romans used electric batteries 2000 years ago", "Archaeological consensus rejects Baghdad battery as electrical; classified as fringe theory", "CONTRADICTED_CLAIM"),
        ("A new battery breakthrough will increase EV range to 3000 miles by next year", "Single anonymous forum post without primary technical source", "UNVERIFIED_ASSERTION"),
        ("Model asserts that Abraham Lincoln invented the fax machine in 1860", "Model hallucination without source citation or historical evidence", "MODEL_CLAIM"),
        ("CRISPR gene editing approved for sickle cell treatment by FDA in Dec 2023", "Official FDA press release + Federal Register notice", "VERIFIED_FACT"),
        ("Python was created by James Gosling at Sun Microsystems", "Guido van Rossum created Python; Gosling created Java (direct contradiction)", "CONTRADICTED_CLAIM"),
        ("Quantum computer broke RSA-4096 encryption yesterday", "Sensational blog post contradictory to NIST public status", "CONTRADICTED_CLAIM"),
        ("Coffee consumption may correlate with reduced cardiovascular risk", "Observational epidemiological study with p < 0.05", "SOURCE_CLAIM"),
    ]
    for claim_text, evidence_ctx, expected_class in claim_scenarios:
        p = make_packet(
            packet_id=f"sf_d01_{seq:03d}",
            domain="D01",
            floor_id="F00",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d01_{seq:03d}",
                content_engine="facts",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH" if expected_class == "CONTRADICTED_CLAIM" else "MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Candidate claim: '{claim_text}'. Context: {evidence_ctx}",
                    evidence_type="VERIFIED_FACT",
                    ref="DocumentNormalizer.ts:normalizeClaims",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Claim verification pipeline evaluated sources: result matches {expected_class}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[f"Claim classification uncertainty: verifying against {expected_class}"],
            constraints=["Classify claim strictly according to factual hierarchy: VERIFIED_FACT > SOURCE_CLAIM > UNVERIFIED_ASSERTION."],
            candidate_actions=[
                CandidateAction(id=f"ACT_CLASSIFY_{expected_class}", label=f"Classify claim as {expected_class} and tag confidence accordingly"),
                CandidateAction(id="ACT_CLASSIFY_VERIFIED_BLIND", label="Promote unconditionally to VERIFIED_FACT to increase yield"),
                CandidateAction(id="ACT_DISCARD_SILENTLY", label="Drop claim from pipeline without provenance or ledger entry"),
            ],
            winning_action_id=f"ACT_CLASSIFY_{expected_class}",
            rejected_reasons={
                "ACT_CLASSIFY_VERIFIED_BLIND": "INVARIANT_VIOLATION_UNGROUNDED_PROMOTION: Unverified or contradicted claims cannot be promoted to VERIFIED_FACT without empirical corroboration.",
                "ACT_DISCARD_SILENTLY": "INVARIANT_VIOLATION_PROVENANCE_LOSS: Dropping claims without recording the classification state destroys forensic lineage.",
            },
            provenance_tier="GOLD" if seq <= 15 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. Methodology Selection based on Engine & Intent (8 packets)
    methods = [
        ("quiz", "QUICK", "Fast multiple-choice question generation with canonical trivia retrieval"),
        ("news", "FACT_CHECK", "Breaking news verification requiring multi-source consensus and primary outlet check"),
        ("history", "DEEP", "In-depth archival research requiring academic sources and historiographical consensus"),
        ("motivation", "TREND_SCAN", "Viral sentiment and quote verification on social platforms"),
        ("coding", "FULL", "Technical documentation and API reference verification against official manuals"),
        ("guess-flag", "QUICK", "Vexillological facts and sovereign nation metadata verification"),
        ("guess-logo", "QUICK", "Brand identity, copyright date, and trademark historical verification"),
        ("reddit", "CORROBORATION", "Community story plausibility check and removal of doxxing / PII"),
    ]
    for eng, expected_mode, rationale in methods:
        p = make_packet(
            packet_id=f"sf_d01_{seq:03d}",
            domain="D01",
            floor_id="F00",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d01_{seq:03d}",
                content_engine=eng,
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Engine '{eng}' requires methodology '{expected_mode}' ({rationale}).",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="ReachContracts.ts:inferReachResearchMode",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Workflow configuration requested mode matching {eng}", evidence_type="OBSERVED_MEASUREMENT"),
            ],
            unknowns_and_contradictions=[],
            constraints=[f"Select appropriate ReachResearchMode for content engine {eng}."],
            candidate_actions=[
                CandidateAction(id=f"ACT_SELECT_{expected_mode}", label=f"Select ReachResearchMode '{expected_mode}' with calibrated source quotas"),
                CandidateAction(id="ACT_SELECT_MINIMAL_CHEAP", label="Always force QUICK mode to minimize token expenditure regardless of engine requirements"),
                CandidateAction(id="ACT_SELECT_UNBOUNDED_DEEP", label="Always force DEEP recursive crawl exceeding treasury budget limits"),
            ],
            winning_action_id=f"ACT_SELECT_{expected_mode}",
            rejected_reasons={
                "ACT_SELECT_MINIMAL_CHEAP": "POLICY_VIOLATION_INSUFFICIENT_MODE: Using QUICK mode for rigorous engines degrades evidence sufficiency below quality gates.",
                "ACT_SELECT_UNBOUNDED_DEEP": "TREASURY_VIOLATION_BUDGET_OVERRUN: Unbounded deep crawls violate treasury rate and budget envelope invariants.",
            },
            provenance_tier="GOLD" if seq <= 23 else "CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. Budget Governor and Rate Limit Handling (4 packets)
    for q_kind in ["SEARXNG_QUOTA", "PERPLEXITY_RATE_LIMIT", "ARXIV_BURST", "CROSSREF_TIMEOUT"]:
        p = make_packet(
            packet_id=f"sf_d01_{seq:03d}",
            domain="D01",
            floor_id="F00",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis_d01_{seq:03d}",
                content_engine="news",
                target_duration_sec=60,
                reversibility="REVERSIBLE",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(
                    fact=f"Provider returned rate limit condition '{q_kind}' (HTTP 429).",
                    evidence_type="VERIFIED_FACT",
                    ref="ReachBudgetGovernor.ts:trackRateLimits",
                ),
                VerifiedFact(
                    fact="Circuit breaker policy requires transitioning provider state to DEGRADED and routing to secondary provider.",
                    evidence_type="DETERMINISTIC_RULE",
                    ref="ReachProviderRouter.ts:handleProviderFailure",
                ),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"Provider circuit breaker opened: condition {q_kind}", evidence_type="OBSERVED_PROVIDER"),
            ],
            unknowns_and_contradictions=["Primary provider currently throttled."],
            constraints=["Failover to secondary provider without dropping query intent or violating budget limits."],
            candidate_actions=[
                CandidateAction(id="ACT_CIRCUIT_FAILOVER", label="Trip circuit breaker to DEGRADED and dispatch query to secondary qualified provider"),
                CandidateAction(id="ACT_SPAM_RETRY", label="Immediately execute tight retry loop on same throttled endpoint without backoff"),
                CandidateAction(id="ACT_ABORT_PIPELINE", label="Terminate entire mission pipeline immediately upon first provider rate limit"),
            ],
            winning_action_id="ACT_CIRCUIT_FAILOVER",
            rejected_reasons={
                "ACT_SPAM_RETRY": "RESILIENCE_VIOLATION_HAMMERING: Retrying a 429 without backoff causes permanent IP bans and violates RFC 6585.",
                "ACT_ABORT_PIPELINE": "RESILIENCE_VIOLATION_PREMATURE_ABORT: Aborting without consulting qualified fallback providers causes unnecessary pipeline failure.",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
