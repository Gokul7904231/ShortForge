# ShortForge Immutable Run Evidence Bundles & Artifact Attestation Specification

**Document Version:** `2026.1-p0`  
**Status:** IMPLEMENTED & VERIFIED  
**Component:** `apps/web/factoryos/core/evidence/RunBundleBuilder.ts`  
**Test Suite:** `apps/web/factoryos/tests/run-bundle-attestation.test.ts` (PASS)

---

## 1. Executive Summary

Previous release iterations mixed disparate video renders into a single `artifacts/production-demo/` directory, causing provenance confusion and preventing independent auditing of separate runs.

Wave 6 enforces the **Immutable Run Evidence Bundle Architecture**:
1. **Isolated Run Directory:** Every execution receives a dedicated directory: `artifacts/production-acceptance/<run-id>/`. Run artifacts for 60s and 180s videos are strictly isolated.
2. **Canonical Manifest Structure:** Each bundle contains five deterministic JSON documents plus a cryptographic seal.
3. **GitHub Artifact Attestation:** Integrates with GitHub `actions/attest-build-provenance` using in-toto / SLSA v0.2 provenance predicates.
4. **Cryptographic Bundle Seal (`bundle-digest.sha256`):** Computes a SHA-256 seal across all manifest documents.

---

## 2. Directory Hierarchy & File Invariants

```
artifacts/production-acceptance/<run-id>/
├── manifest.json              # Run parameters, target/physical duration, git commit, hardware info, MP4 hash
├── f07-report.json            # Authoritative F07 verification report, hard gate evaluations, physical measurements
├── provenance.json           # Factual claims ledger, sources, word counts, narrative arc
├── telemetry.json            # OpenTelemetry W3C trace context, spans, floor latencies
├── attestation.json          # in-toto SLSA provenance predicate for actions/attest
└── bundle-digest.sha256      # SHA-256 digest sealing all manifest documents
```

---

## 3. GitHub Actions `actions/attest` Workflow Integration

Each production acceptance job emits an attestation statement consumable by GitHub Actions:

```yaml
- name: Attest Production Video Artifact
  uses: actions/attest-build-provenance@v1
  with:
    subject-path: 'artifacts/production-acceptance/${{ matrix.run_id }}/*.mp4'
```

The resulting `attestation.json` conforms to `https://in-toto.io/Statement/v0.1` and `https://slsa.dev/provenance/v0.2`, establishing cryptographic chain of custody directly linking GitHub commit SHAs to the physical MP4 binary.

---

## 4. Automated Verification Evidence

Ran `npx vitest run factoryos/tests/run-bundle-attestation.test.ts`:

```
 ✓ Wave 6 — Immutable Run Evidence Bundles & Artifact Attestation (1 test)
   ✓ builds isolated run bundles for 60s and 180s without mixing artifacts (39ms)

Test Files  1 passed (1)
Tests       1 passed (1)
```

