# F07 Pre-Training Check — Complete Floor Audit

Date: 2026-09-27
Base: main at e0c70b8a33d9c753af81b53b3b66b20808f86a1e
Target: Floor 07 QA Gate & Social Compliance / Verification

## 1. Current purpose

F07 is the final verification and release boundary after F06 rendering. It answers a different question from F05 and F06:

- F05: what should the final timeline mean?
- F06: can the timeline be rendered into physical media?
- F07: is the produced artifact physically real, traceable, policy-compliant, sufficiently original, and authorized for an external release side effect?

The current live path is F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07. The old FastAPI compliance gate under archive/floor07_compliance_2026-08-23 is not the live F07 implementation.

## 2. How F07 was made

F07 evolved from an older compliance gate into the FactoryOS control-plane verification boundary. The live implementation is split across:

- F07ReleaseGuardian: final coordinator and decision boundary.
- VerificationEngine: physical media probing.
- F07PhysicalArtifactVerifier: new independent physical/CAS truth boundary.
- YouTubePolicyGuardian: G00-G14 policy evaluation.
- YouTubePolicyStore and PolicyActivationPipeline: policy data and freshness.
- OriginalityGate, VariationPolicyEngine, CreativeFatigueAnalyzer: creative/repetition evidence.
- ArtifactLineageGraph and EvidenceInvalidationTracker: remediation lineage.
- VerificationReceipt: signed immutable release evidence.
- F07CryptoSigner and F07TrustedKeyStore: cryptographic identity.
- DurableAuthorizationStore: durable authorization state.
- PublicationAuthorizationService: release capability issuance and JIT revalidation.
- PublisherQueue and YouTube provider: downstream side-effect execution.

The architecture was built to preserve authority separation: F07 can verify and release-authorize, but it does not become the rendering engine, timeline compiler, or cognitive authority.

## 3. Start condition

F07 should start only when the F06 handoff contains:

1. committed render identity;
2. artifact CAS reference;
3. SHA-256 identity;
4. physical byte length;
5. independent ffprobe/decode evidence;
6. provider admission/execution evidence;
7. F05 TimelineIR/render-input lineage sufficient to explain what was rendered.

New hardening rule: production F07 does not promote caller-supplied measurements to physical truth. It resolves an immutable CAS object, independently hashes bytes, independently probes media, and checks digest stability around the probe.

## 4. Features and actions

### Physical and integrity verification

- Resolve artifact from CAS.
- Validate cas://<sha256> identity against declared digest.
- Re-hash physical bytes.
- Independently run VerificationEngine.probeMediaFile.
- Re-hash after probing to detect replacement during verification.
- Compare physical byte length with the CAS record.
- Reject missing, empty, placeholder, corrupted, or non-decodable media.

### Creative verification

- Content variation against recent channel genomes.
- Originality/rights audit.
- Creative fatigue analysis.
- Structured remediation cases when a finding is repairable.

### Policy verification

- G00 policy freshness.
- G01 channel readiness/YPP state.
- G02 community guidelines.
- G03 inauthentic/repetitive content.
- G04 reused content.
- G05 commercial/copyright rights.
- G06 advertiser suitability.
- G07 realistic AI/synthetic disclosure.
- G08 spam/deception.
- G09 fake engagement.
- G10 metadata integrity.
- G11 kids/family.
- G12 Shorts format and Content ID timing rule.
- G13 channel repetition.
- G14 evidence reconciliation.

### Release evidence

- Signed VerificationReceipt.
- Physical and CAS evidence references.
- Policy snapshot/version/hash/effective interval.
- Remediation and invalidation information.
- Durable ReleaseAuthorization only after receipt verification.
- JIT authorization revalidation immediately before the external publishing side effect.
- Durable ACTIVE -> CONSUMED/INVALIDATED state transitions.
- Idempotent publisher queue and resumable upload reconciliation downstream.

## 5. Permissions

Declared F07 floor capabilities:

- CAP_QA_INSPECT
- CAP_EVAL_EXEC

Denied capabilities:

- CAP_FS_WRITE
- CAP_DELIVERY_PUBLISH
- CAP_RENDER_DISPATCH
- provider credential selection
- F05 semantic mutation
- F06 render mutation
- Ascalon self-authorization

The actual external publication side effect belongs to PublisherQueue/YouTube provider, and that path requires a cryptographically bound ReleaseAuthorization.

## 6. End condition

F07 ends only with a durably evidenced terminal decision:

- READY / release-authorization eligible;
- REPAIR_REQUIRED;
- BLOCKED;
- NOT_YET_ELIGIBLE;
- POLICY_STALE;
- EXTERNAL_REVIEW.

A policy pass, creative pass, or provider-declared render success alone is not sufficient.

## 7. Important current-state findings

### Fixed in this hardening wave

- Caller measurements are no longer authoritative in production F07.
- CAS identity is explicit and cryptographically tied to the physical object.
- Physical digest is rechecked after probing.
- Local development verification is retained for controlled diagnostics but is not publishable without CAS binding.
- A typed F07 pre-training admission contract now makes missing proof a machine-visible blocker.
- A dedicated pre-training CI lane now checks F07 changes and the new physical truth test.

### Existing strengths retained

- Durable authorization store already provides persistent capability state and atomic replay resistance.
- YouTube provider already performs JIT authorization revalidation.
- Production publishing fails closed without valid credentials and does not manufacture success identifiers.
- Artifact lineage blocks cycles and remediation invalidates downstream evidence.
- F07 already separates policy data from publisher execution.

### Residual hardening candidates

1. Move production signing to KMS/HSM-backed keys; keep local disk only for non-production development.
2. Harden F07TrustedKeyStore key rotation so an active key ID cannot be silently replaced.
3. Make policy snapshot activation explicitly signed/content-addressed in the same way as OPA signed bundles.
4. Persist EvidenceInvalidationTracker events, not only the lineage DAG.
5. Add a C2PA verification adapter with real manifest fixtures, then bind provenance to the receipt as complementary evidence.
6. Export a ShortForge verification attestation shaped around SLSA/in-toto provenance semantics.

These residual candidates are not new authorities and should be implemented behind explicit qualification gates.

## 8. What Ascalon should improve

Ascalon/SCL should improve F07 primarily in reasoning quality, not authority:

- select which evidence to request next;
- detect conflicts between declared and measured artifact facts;
- reason over F05 -> F06 -> F07 lineage;
- understand policy effective intervals and publication clocks;
- learn when to abstain because policy/evidence is stale or absent;
- classify a finding as repairable, blocking, or external-review-required;
- propose remediation while preserving evidence invalidation semantics;
- learn from both PASS and blocked/repair-required trajectories;
- learn truthful failure handling rather than optimizing for pass rate;
- use channel-history context to reason about repetition and inauthenticity;
- propose provenance/attestation enrichment without creating authority.

Ascalon must not certify physical truth, alter a signed receipt, issue ReleaseAuthorization, select credentials, bypass Guardian, or convert an unverified observation into a verified label.

## 9. What F07 gives the next stage

There is no eighth production floor currently registered in the FloorRegistry. F07 hands two things to the stage after verification:

### Runtime delivery

A valid signed VerificationReceipt can produce a durable ReleaseAuthorization, which is consumed by the PublisherQueue and verified again immediately before the YouTube side effect.

### Learning / Devourer

F07 produces the highest-value negative and positive evidence boundary for Ascalon:

- physically verified artifact facts;
- policy context and effective clock;
- decision outcome;
- evidence references;
- remediation/invalidation events;
- authorization lifecycle events;
- final release truth.

That becomes the teacher boundary for Ascalon's training/admission dataset. It should be evidence-tiered, provenance-bound, and replayable.

## 10. Pre-training admission checklist

The floor is training-admissible only when all are freshly evidenced:

- canonical F00-F07 topology;
- independent physical probe;
- CAS-bound artifact identity;
- policy interval coverage;
- fresh official policy sources;
- valid signed receipts;
- durable authorization;
- replay resistance;
- no synthetic production success;
- downstream evidence invalidation;
- focused F07 tests and repository CI.

Current declared state for this branch: CI_ADMISSION_PENDING. The code and documentation are on the hardening branch; promotion to main requires fresh CI evidence.

## 11. Research conclusions

C2PA 2.4 supports preserving verifiable provenance through creation and publication workflows. OPA signed bundles demonstrate that a candidate policy should not activate until signature and content verification succeed. SLSA 1.2 and in-toto provide mature provenance/attestation patterns. Current YouTube documentation makes channel-level originality, realistic AI disclosure, and time-aware Shorts rules material verification inputs.

ShortForge adopts the patterns only where they preserve the existing authority chain; no external project becomes an authority plane.

## 12. Verification outcome

The dedicated Floor 07 pre-training validation passed (GitHub Actions run 36305703180), including focused typecheck, physical-truth tests, the 28 F07 architectural invariants, receipt/remediation/policy-refresh suites, and machine-readable admission validation. F04/F05/F06 cross-floor validation also passed on the same branch. The strict repository TypeScript typecheck passed after completing the canonical template temporal contract fields (quantization, fpsRef, and quality).

The repository-wide Web Regression lane remains informational and currently reports 47 failed suites / 65 failed tests out of 1157 tests. The observed failures are concentrated in environment-dependent FFmpeg/ffprobe availability, MongoDB/provider/Agent-Reach availability, and unrelated legacy/evaluation suites; no F07 dedicated validation failure remains.

**F07 pre-training status: READY FOR ASCALON TRAINING, subject to the existing authority restrictions.** This is not a claim of live YouTube credential qualification or guaranteed third-party monetization.
