# aria2/aria2 — Ascalon Artifact Acquisition Research Mapping

> Retrieval date: 2026-09-27
> Revision reviewed: release 1.37.0 / current repository main metadata
> Adoption mode: ISOLATED PROVIDER / PATTERN EXTRACTION
> Authority: external transfer utility only; CAS and F07 remain ShortForge truth.

## 1. Source identity

- Upstream: https://github.com/aria2/aria2
- Manual: https://aria2.github.io/manual/en/html/
- Latest official release currently listed upstream: 1.37.0.
- License reported upstream: GPL-2.0.

## 2. Useful capabilities verified

aria2 supports HTTP(S), FTP, SFTP, BitTorrent and Metalink, multi-source/concurrent downloads, resume, piece/hash integrity, and JSON-RPC/WebSocket control. The official manual provides `--check-integrity`, `--continue`, chunk checksum validation, and RPC secret/TLS controls.

## 3. ShortForge/Ascalon mapping

| Capability | ShortForge treatment | Status |
|---|---|---|
| Segmented / concurrent download | Accelerate large model and dataset shard acquisition | ADOPTED AS OPTIONAL TOOL |
| Resume | Recover large interrupted checkpoint/data downloads | ADOPTED |
| Checksum-aware acquisition | Supply expected SHA-256 when available | ADOPTED |
| RPC control | Not exposed publicly; local/secured use only | SECURITY BOUNDARY |
| Multi-source | Use only from explicit HTTPS allowlists | SECURITY BOUNDARY |
| Final artifact truth | Recompute SHA-256 and byte length independently | REQUIRED |
| CAS promotion | Only after independent verification | REQUIRED |

## 4. Correct role in Ascalon

aria2 is a transfer accelerator, not a model registry, not a dataset authority, and not a verification authority.

~~~
approved source URLs
      |
      v
aria2 acquisition helper
      |
      v
staging file
      |
      v
independent SHA-256 + byte-length verification
      |
      v
Content-Addressed Store / manifest
      |
      v
Ascalon training or inference consumer
~~~

## 5. Security rules

- HTTPS only for the ShortForge helper.
- Explicit source-origin allowlist; no arbitrary user-supplied fetch target.
- No credential-bearing source URLs.
- Never expose unauthenticated aria2 RPC to the network.
- Prefer RPC secret authorization and TLS whenever RPC is necessary.
- The downloader completion state is never accepted as proof of artifact correctness.
- A verified transfer is still not a training-eligible trajectory; provenance and dataset governance are separate gates.

## 6. Implementation delivered in ShortForge

- `training/ascalon/transfer/Aria2ArtifactFetcher.ts` builds an argument-safe aria2 invocation, enforces HTTPS/origin allowlists, resumes with integrity checking, and independently verifies SHA-256/size.
- `apps/web/factoryos/tests/ascalon/aria2-artifact-fetcher.test.ts` verifies URL policy, checksum flags, safe argument construction and post-download verification.
- `docs/ascalon/artifact-acquisition.md` defines the model/dataset supply-chain boundary.

## 7. Explicit non-adoption

No aria2 code or GPL library is linked into the FactoryOS runtime. The helper treats aria2c as an external executable. F06 render artifact transfer remains governed by the provider adapter -> physical verification -> CAS -> F07 chain.

## 8. Limitations

The current upstream release is old relative to the current date, and there are open user-reported issues around build/platform/TLS behavior. ShortForge must qualify the installed aria2 build on each supported environment before using it for critical acquisition paths.