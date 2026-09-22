# ShortForge / FactoryOS — Publication Authorization Audit

## 1. Unforgeable ReleaseAuthorization Capability

`ReleaseAuthorization` is a cryptographically signed capability issued by the `F07_RELEASE_GUARDIAN` authority upon successful verification receipt evaluation.

```typescript
export interface ReleaseAuthorization {
  readonly authorizationId: string;
  readonly issuedAt: string;
  readonly issuer: "F07_RELEASE_GUARDIAN";
  readonly authorizationVersion: number;
  readonly nonce: string;
  readonly receiptId: string;
  readonly receiptDigestSha256: string;
  readonly receiptSignature: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly artifactCasRef: string;
  readonly targetChannelId: string;
  readonly targetPlatform: "youtube";
  readonly publicationIntentId: string;
  readonly publicationIntentHash: string;
  readonly canonicalPayloadHash: string;
  readonly scope: ReleaseAuthorizationScope;
  readonly policySnapshotIds: readonly string[];
  readonly evidenceVersion: string;
  readonly status: AuthorizationStatus; // "ACTIVE" | "CONSUMED" | "INVALIDATED"
  readonly expiresAt: string;
  readonly signature: string; // Ed25519 digital signature
  readonly signerKeyId: string;
}
```

Evidence: Proven in `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #16).

---

## 2. Complete Canonical Payload Hash Binding

The authorization capability binds strictly to the complete sanitized publication payload:
- `title`
- `description`
- `tags` (sorted deterministically)
- `privacyStatus`
- `publishAt`
- `channelId`
- `containsSyntheticMedia`
- `selfDeclaredMadeForKids`

Any post-authorization tampering or variation of these parameters (e.g. altering title, adding spam tags, switching privacy from unlisted to public) invalidates the `canonicalPayloadHash` and causes immediate publication rejection with `PAYLOAD_MISMATCH`.

Evidence: Proven in `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #17).

---

## 3. Durable Atomic State Transitions & Replay Protection

1. **Issuance**: Placed in `ACTIVE` state with 1-hour TTL.
2. **Consumption**: Transitioned to `CONSUMED` upon publication execution. Replay attempts fail immediately with `NOT_ACTIVE` or `JIT_REVALIDATION_FAILED`.
3. **Invalidation**: Can be transitioned to `INVALIDATED` if upstream evidence is revoked.

Evidence: Proven in `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #18).

---

## 4. Resumable Upload Session Reconciliation

When a large video upload initiates a YouTube resumable upload session, the `uploadSessionUri` is registered in the capability store upon initial consumption. If a network blip occurs during chunk streaming, subsequent upload retry attempts provide the registered `uploadSessionUri`, allowing legitimate chunk upload continuation without failing JIT revalidation. Any attempt to use a mismatched or newly forged session URI is rejected.

Evidence: Proven in `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #21).

---

## 5. Just-In-Time (JIT) Authorization Revalidation

Immediately before the first remote publication side effect (e.g., calling YouTube Googleapis to initiate an upload session), the `YouTubeProvider` invokes `PublicationAuthorizationService.revalidateImmediatelyBeforePublish`. This verifies:
- Platform matches `"youtube"`
- Expiration timestamp has not elapsed
- Canonical payload hash matches current payload
- Ed25519 digital signature is valid
- State is `ACTIVE` (or valid registered resumable session)

Evidence: Proven in `apps/web/publishing/providers/youtube.ts` and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #19).

---

## 6. Zero Fake Production Success (Truthful Boundary)

The production `YouTubeProvider` has had all legacy mock/simulated fallback code removed. In the absence of real YouTube OAuth2 client credentials (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`), the provider fails closed and returns:
```typescript
{
  success: false,
  error: "YouTube production credentials (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN) not configured.",
  code: "AUTH_NOT_CONFIGURED"
}
```
Dry-run testing is strictly isolated to `DryRunYouTubeProvider`.

Evidence: Proven in `apps/web/publishing/providers/youtube.ts` and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #20).
