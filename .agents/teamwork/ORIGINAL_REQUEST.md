# Original User Request

## Initial Request — 2026-11-02T11:07:06Z

Integrate Canva as ShortForge's external visual-design authoring environment while retaining ShortForge's existing native production rendering architecture, and resolve the critical V2 five-second thinking window narration sequencing defect.

Integrity mode: development

Reference material:
- Canva Developer Documentation: https://www.canva.dev/docs/
- Canva Authentication (OAuth with PKCE): https://www.canva.dev/docs/apps/rest-apis/authentication/
- Canva Capabilities: https://www.canva.dev/docs/apps/rest-apis/capabilities/
- Canva REST API Reference: https://www.canva.dev/docs/apps/rest-apis/reference/
- Canva Autofill Guide: https://www.canva.dev/docs/apps/rest-apis/autofill-guide/

## Requirements

### R1. Forensic Baseline Audit
Inspect the current Git branch, working tree, active agent worktrees, V2 template registry, renderer path, B2 integration, voice provider architecture, and countdown implementation. Reproduce the reported premature-answer narration defect and determine why existing tests failed to catch the playback problem. Document all findings in docs/verification/canva-integration-baseline.md. Preserve V1 unchanged without resetting or overwriting existing work, and do not introduce a third quiz template ID or a new production renderer.

### R2. Fix Critical Audio Sequencing and Five-Second Thinking Window
Implement an explicit audio and visual event sequence for every question: Question narration -> Option A narration -> Option B narration -> Option C narration -> Option D narration -> 5-second thinking window -> Answer reveal -> Correct answer narration -> Explanation narration. The thinking window must start only after the final option audio segment has physically ended, must last exactly 5,000 milliseconds (150 frames at 30 fps), and must have zero narration overlap. All answer voice narration must begin at or after the thinking window ends. Verify timing by decoding physical MP4 audio rather than relying on metadata alone, and record acceptance evidence for all six questions in docs/verification/quiz-five-second-think-gate.md.

### R3. Canva Developer OAuth Integration and Capability Audit
Verify that CANVA_CLIENT_ID and CANVA_CLIENT_SECRET exist in the local environment configuration without printing, exposing, logging, committing, or returning their values, and confirm the environment file is Git-ignored. Implement backend-managed OAuth 2.0 using Authorization Code with PKCE, secure state and CSRF validation, token refresh, and safe disconnect. Inspect the existing backend routing architecture to determine exact local and production redirect URIs and report them to the owner before registration in the Canva Developer Portal. Query GET /rest/v1/users/me/capabilities to audit permissions, account for Pro Lite subscription limits (Autofill optional with automatic fallback to native variable-content rendering), and document findings in docs/verification/canva-api-capability-report.md.

### R4. Reusable Canva Master Visual Template and Asset Synchronization
Support a reusable master 9:16 portrait design covering intro, question, think countdown, answer reveal, explanation, and outro across all quiz categories (Geography, Science, History, AI, General Knowledge, Custom topics) using B2-resolved background images. The owner will select and approve the Canva template design ID during Phase 3 following OAuth readiness and capability reporting. Develop a backend synchronization adapter using Canva REST APIs to list designs, retrieve metadata, export supported PNG/MP4 assets, poll jobs, immediately download and store assets in B2 rather than using expiring Canva URLs, and record version metadata. Question text, options, answers, explanations, countdown values, and narration remain dynamic native-renderer content; local licensed fonts must be mapped without extracting Canva font files.

### R5. Canonical Design Pack Manifest and Native Renderer Integration
Design and document an immutable versioned asset-pack manifest (manifest.json) containing design pack ID, version, Canva provider, source design ID, canvas dimensions, element roles, export formats, asset paths, SHA-256 hashes, font mappings, design tokens, licensing provenance, and export timestamp. Integrate the design pack into the existing CompositionIR/F05 and RenderFabric/F06 pipeline (image.py), ensuring the ShortForge renderer can operate reliably from cached B2 assets even if Canva is unavailable.

### R6. Flagship Production Verification and Acceptance
Rely entirely on the test harnesses, verification scripts, and B2 assets existing in the codebase. Produce two complete six-question flagship Shorts (Geography and Science) meeting all timing, voice, visual, and duration criteria. Capture contact sheets and physical media metadata, delivering docs/verification/canva-hybrid-quiz-acceptance.md with complete F07 acceptance.

## Acceptance Criteria

### Timing and Audio Sequencing
- [ ] For all 6 questions in each flagship video, the 5-second thinking window starts only after the final option audio segment has physically ended.
- [ ] The thinking window duration is exactly 5,000 milliseconds (150 frames at 30 fps) with zero narration overlap.
- [ ] Answer voice narration begins at or after the end of that question's thinking window on all six questions.
- [ ] Timing verification is confirmed by physical decoded MP4 audio analysis and documented in docs/verification/quiz-five-second-think-gate.md.

### Architecture and Renderer Integrity
- [ ] Template quiz.universal.glass.v1 is preserved unchanged.
- [ ] No parallel Remotion production pipeline or third quiz template ID is introduced.
- [ ] Native rendering backend (image.py) remains authoritative; Canva MP4 is not used as the final production renderer.
- [ ] Dynamic text, narration, countdown values, and B2 background resolution are owned by ShortForge.

### Security and OAuth Implementation
- [ ] Canva OAuth 2.0 Authorization Code with PKCE is implemented strictly backend-managed.
- [ ] CANVA_CLIENT_ID and CANVA_CLIENT_SECRET are verified without exposing, logging, committing, or printing their values.
- [ ] Environment file is verified as git-ignored with no tracked credentials.
- [ ] Local and production redirect URIs are determined from existing backend routes and reported before portal registration.
- [ ] PKCE verifier/challenge and CSRF state validation are implemented.
- [ ] Token refresh, expiry handling, secure storage, and error handling are implemented.

### Canva API & Design Synchronization
- [ ] Account capabilities are audited via GET /rest/v1/users/me/capabilities and recorded in docs/verification/canva-api-capability-report.md.
- [ ] Pro Lite limitations are respected; Autofill is treated as optional with native fallback if unavailable.
- [ ] Canva export assets are downloaded immediately and persisted to B2 rather than using temporary Canva URLs.
- [ ] An immutable versioned design pack manifest.json is generated with SHA-256 hashes and metadata.
- [ ] Renderer can operate from cached B2 assets if Canva API is unavailable.

### Production Shorts Quality & Deliverables
- [ ] Two complete six-question flagship Shorts are produced (Geography and Science).
- [ ] Six distinct relevant B2 backgrounds per video.
- [ ] Correct voice and pronunciation with no robotic male fallback.
- [ ] Complete option narration, correct answer reveal, and complete explanation without clipped audio or text.
- [ ] Target duration is within configured tolerance in 9:16 portrait format.
- [ ] Baseline audit delivered in docs/verification/canva-integration-baseline.md.
- [ ] Final acceptance report delivered in docs/verification/canva-hybrid-quiz-acceptance.md with contact sheets and media metadata.
- [ ] F07 acceptance passed for all questions and production runs.
