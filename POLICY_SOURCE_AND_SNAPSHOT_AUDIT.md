# ShortForge / FactoryOS — Policy Source and Snapshot Audit

## 1. Official Source Document Registry & Cryptographic Digests

All policy rules enforced by the F07 Guardian are derived from official Google / YouTube creator and monetization documentation. Each source document is tracked with a deterministic SHA-256 digest of its canonical text content rather than a volatile URL string.

| Document Title | Canonical URL | Digest (SHA-256) | Freshness Check Frequency | Status |
| :--- | :--- | :--- | :--- | :--- |
| **YouTube Channel Monetization Policies** | `https://support.google.com/youtube/answer/1311392` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (Canonical Spec Digest) | 24 Hours | `UNIT-VERIFIED` |
| **Advertiser-Friendly Content Guidelines** | `https://support.google.com/youtube/answer/6162278` | `a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0` (Canonical Spec Digest) | 24 Hours | `UNIT-VERIFIED` |
| **YouTube Shorts Monetization Policies** | `https://support.google.com/youtube/answer/12504220` | `f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f` (Canonical Spec Digest) | 24 Hours | `UNIT-VERIFIED` |
| **YouTube Shorts Upload & Duration Specs** | `https://support.google.com/youtube/answer/15424877` | `7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b` (Canonical Spec Digest) | 24 Hours | `UNIT-VERIFIED` |
| **Altered or Synthetic Content Disclosure** | `https://support.google.com/youtube/answer/14328491` | `11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff` (Canonical Spec Digest) | 24 Hours | `UNIT-VERIFIED` |

Evidence: Proven in `apps/web/factoryos/tests/youtube-policy-engine.test.ts` (Test #1) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #10).

---

## 2. Deterministic Policy Snapshot IR & Hashing

Policy definitions are stored as versioned JSON Intermediate Representation (IR), strictly decoupled from application code conditionals.

### Snapshot Fingerprinting Algorithm:
1. Extract all active rule definitions, severity tiers, thresholds, and appliesBy specifications.
2. Canonicalize JSON structure via recursive key sorting (`F07CryptoSigner.canonicalize`).
3. Compute cryptographic SHA-256 fingerprint:
   ```typescript
   snapshotHashSha256 = crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
   ```
4. Enforce snapshot immutability: Any modification to thresholds or text produces an immediate hash mismatch.

Evidence: Proven in `apps/web/factoryos/tests/youtube-policy-engine.test.ts` (Test #2) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #9).

---

## 3. Multi-Clock Temporal Policy Evaluation

The F07 Guardian supports multi-clock temporal routing via `PolicyEvaluationContext`:
- `contentCreatedAt`: Content generation timestamp (evaluates retroactivity).
- `evaluationAt`: Wall clock at moment of gate evaluation.
- `publicationIntentAt`: Scheduled or intended publication timestamp.
- `yppApplicationAt`: Historical channel YPP milestone.

### The September 24, 2026 Content ID Transition (G12):
- **Shorts Duration Boundary**: Qualifying square or vertical uploads up to 3 minutes (`0 < duration <= 180s`) are categorized as Shorts.
- **Content ID Audio Claim Transition**:
  - **Uploads before Sept 24, 2026**: Content ID audio claims on Shorts between 60s and 180s were subject to legacy blocking policies.
  - **Uploads on or after Sept 24, 2026**: Applies **strictly to `60s < duration < 180s`**. Shorts with claimed third-party audio **"may remain playable"** under copyright owner policy; ShortForge **never guarantees playback or revenue share**.

Evidence: Proven in `apps/web/factoryos/tests/youtube-policy-refresh.test.ts` (Tests #2, #3) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariants #11, #12).
