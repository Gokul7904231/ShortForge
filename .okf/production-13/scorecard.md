# Production-13 Scorecard

**Authority:** Subordinate to `.okf/charter.md` (`sovereignRolesCreated = false`)  
**Source:** [`.okf/production-13/layer-registry.json`](./layer-registry.json)

| Layer | Name | Owner Roles / Subsystems | Status | Primary Evidence |
|---|---|---|---|---|
| L01 | Frontend Foundations | `guardian`, `auditor` | `PARTIAL` | `13-layer-production-truth.md#L01` |
| L02 | APIs & Backend Logic | `guardian`, `auditor` | `PASS` | `commit.py`, `callback/route.ts`, `p1-live-e2e-quiz-commit.test.ts` |
| L03 | Database & Storage | `guardian`, `cas` | `PASS` | `ContentAddressedStore.ts`, `instabox-verification-gates.test.ts` |
| L04 | Auth & Permissions | `guardian`, `bda` | `PASS` | `AuthorityRegistryRuntime.ts`, `instabox-callback-fencing.test.ts` |
| L05 | Hosting & Deployment | `overseer`, `guardian` | `PARTIAL` | `13-layer-production-truth.md#L05` |
| L06 | Cloud & Compute | `treasurer`, `computerouter` | `PASS` | `assemble.py`, `lattice.py`, `dispatch/route.ts` |
| L07 | CI/CD & Version Control | `auditor`, `devourer` | `PASS` | `ci.yml`, `.husky/pre-commit`, `rule-to-test-matrix.md` |
| L08 | Security & RLS | `guardian`, `bda` | `PASS` | `create_short.py`, `RenderArtifactVerifier.ts`, `instabox-security-matrix.test.ts` |
| L09 | Rate Limiting & Quotas | `treasurer` | `PARTIAL` | `treasurer-operating-contract.md` |
| L10 | Caching & CDN | `cas` | `PASS` | `create_short.py`, `toolchain_manifest.json` |
| L11 | Load Balancing & Scaling | `computerouter`, `slayer`, `healer` | `PARTIAL` | `InstaBoxFleetRegistry.ts` (1,000-job soak pending P5) |
| L12 | Error Tracking & Logs | `comms`, `auditor` | `PARTIAL` | `VerificationEngine.ts` |
| L13 | Availability & Recovery | `slayer`, `healer`, `remaker`, `f07` | `PASS` | `RenderArtifactVerifier.ts`, `test_p3_1_hotfix.py`, `p2-render-gates.test.ts` |
