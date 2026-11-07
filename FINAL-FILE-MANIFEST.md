# ShortForge Production Pipeline Remediation: Final File Manifest

- **Document ID:** `FINAL-FILE-MANIFEST-20261031`
- **Branch:** `feat/shortforge-production-pipeline-repair-20261031`
- **Base Commit:** `cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af`
- **Generated:** 2026-10-31T22:26:00+05:30
- **Scope:** Complete inventory of modified, created, untracked, and qualification review artifacts.

---

## 1. Core Source & Remediation Files

| File Path | Status | SHA-256 Checksum | Size (Bytes) | Role & Architectural Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `apps/web/factoryos/core/voice/VoiceFabric.ts` | Modified | `5c085eed108db79b5658f847506c6bd3584d11e277c505b323f995086687a159` | 54,691 | Production narration integrity gate, physical audio energy probe, silence/music rejection. |
| `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` | Modified | `ec5d423a77fcc4fd6ad07127842fa95cff029af4fb5e07baab565c1c1caf428b` | 49,903 | Factual grounding schemas, anti-hallucination validation, provenance propagation, scene timeline lowering contract. |
| `packages/factoryos-render/src/factoryos_render/backends/image.py` | Modified | `5a32ce9e6f4ef54ca29dc85ea5b1772c8639c80c4c11ad3c9b430a09f919c64e` | 36,847 | Native frame compositor: distinct visual families, orb removal, caption pills, Unicode hardening, missing asset gate. |
| `apps/web/factoryos/tests/three-format-qualification.test.ts` | Created | `31591e6a06b1993f631dea59a4b85aedd75b63e9c34781fbe727173fbb5d9f92` | 33,455 | 22-test qualification suite verifying audio, factual, visual, evidence, and audit acceptance checks. |
| `apps/web/factoryos/tests/voice-provider-failure-matrix.test.ts` | Modified | `bbae6d4e662040a26301ff4339e6271ee4fb8299705b483a2c88808ab0e2a5ae` | 31,029 | Exhaustive 29-defect physical voice hardening regression suite. |
| `packages/factoryos-render/tests/test_feature_lowering.py` | Modified | `29717880995a944ab6c11dbe1d30aa04aa22a66ad0d56916a67768c6bde20416` | 3,426 | Feature lowering tests; Pillow 11.3 rounding tolerance adjustment. |
| `apps/web/app/(os)/factory/editor/page.tsx` | Modified | `c59b19519cb04d75693eb688cb4a7aa6dfe93440444bb4270a1d03d504de938c` | 9,712 | ShortForge Studio timeline UI; restored default export & CompositionIR import. |
| `apps/web/factoryos/core/compute/notebooks/ColabNotebookAdapter.ts` | Modified | `04aa13c24bdbd07c3d1faa835c76cb1bf1f0ea7efe3fb3c0a6d5e87901aad1e0` | 28,375 | Execution adapter for cloud notebook rendering; fixed TypeScript env mapping. |
| `apps/web/factoryos/core/render/LocalRenderAdapter.ts` | Modified | `b9bb12f92b30754d455c291aba8c0fc39c7b20a51b93ea8b5ff1f2592c5627b2` | 8,922 | Local process render adapter bridging TimelineIR to Python compositor. |
| `tools/generate_format_assets.py` | Created | `83b44326a9076720b0453567f935921ce7759ea6720c022cf1bccc956be4f086` | 30,516 | Offline deterministic asset generator for topic bathymetry, aerospace telemetry, and trivia cards. |

---

## 2. Review Pack & Physical MP4 Artifacts

| File Path | SHA-256 Checksum | Size (Bytes) | Role & Validation Status |
| :--- | :--- | :--- | :--- |
| `artifacts/three-format-shorts/production-manifest.json` | `dddb55e12e127c78b095535662e9cec432eb011a6b3c0a6734c4c4d87e64cc9d` | 17,995 | Production manifest recording verified file paths, run parameters, and hashes. |
| `artifacts/three-format-shorts/chatgpt-review-pack/SF-Q01/SF-Q01.mp4` | `f7e4faaf6c16495745bdc7365f29a8a130779bfbcb791f86b8f322332d0fdb18` | 1,603,779 | Run 2 Quiz artifact (Solar System Extremes). Physical file hash matches manifest. |
| `artifacts/three-format-shorts/chatgpt-review-pack/SF-F01/SF-F01.mp4` | `2489836745c9301ad2c3006a68f6337fac11da2291f2bacede70d9679e1fc687` | 1,139,441 | Run 2 Facts artifact (The Mariana Trench). Physical file hash matches manifest. |
| `artifacts/three-format-shorts/chatgpt-review-pack/SF-H01/SF-H01.mp4` | `580ce65eebdabd833615ae20af493777c960d525414a79baea875602e7092c38` | 1,489,266 | Run 2 History artifact (Apollo 11 The 1202 Alarm). Physical file hash matches manifest. |
| `artifacts/three-format-shorts/ShortForge-ChatGPT-Review-Pack.zip` | `c0aa482cfd7fa28bf933860bb45511e03a9366ec9610f443e067cce69b0faee5` | 67,879,707 | Bundled review pack containing 1fps contact sheets, ffprobe json, word timings, and audio. |

---

## 3. External Template Submodules & Repositories

| Repository Path | Remote Origin URL | Commit SHA | Declared Licence | Clean-Room Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `vendor/external-templates/Paper-Cut` | `https://github.com/HeiGeAi/Paper-Cut.git` | `5bd160d30ae269051bde6882fcd53f677f2ebec8` | MIT Licence | Layered depth framing adapted into `_draw_history_archival` |
| `vendor/external-templates/procedural-film` | `https://github.com/kuhnhomeuk-cell/procedural-film.git` | `f59413999ae24f6e1f9165b73a0eaa97a0b1c407` | MIT Licence | Blueprint coordinate grids adapted into `_draw_facts_blueprint` |
| `vendor/external-templates/RenderComp` | `https://github.com/RenderComp/free-remotion-templates.git` | `f648980e528defb7594e24c6447055f0540f340b` | MIT Licence | Kinetic countdown & card styling adapted into `_draw_quiz_card` |

---

## 4. Verification & Audit Documentation

| File Path | SHA-256 Checksum | Size (Bytes) | Role & Content |
| :--- | :--- | :--- | :--- |
| `docs/verification/three-format-short-qualification/DEFECT-CORRECTION-LOG.md` | `9fc208aa24bea30e4adf571bdee60755c3ac2e1cd5bf442249d43cc1848e38c4` | 8,999 | Run 2 defect logging and reconciliation record. |
| `docs/verification/three-format-short-qualification/TEMPLATE-LICENCE-LEDGER.md` | `95a75151593c72b157b15a4ce2513ea88d74868e82a6111fdb41ae0c44bc19a3` | 6,689 | Legal commercial licence ledger for external templates and dependencies. |
| `FINAL-PATCH-REVIEW.md` | Generated | ~21,000 | Comprehensive section-by-section audit of git, voice, factual, visual, and test diffs. |
| `FINAL-TEST-RESULTS.md` | Generated | ~8,400 | Authoritative test execution logs and typecheck proofs across all suites. |
| `FINAL-ARCHITECTURE-DIFF.md` | Generated | ~9,500 | Architecture state comparison: Run 1 vs Run 2 vs Remediated ShortForge Pipeline. |
