# Project: Canva Integration & V2 Five-Second Thinking Window Resolution

## Architecture
- **Control Plane & UI**: Next.js 16 App Router (`apps/web`), managing templates, OAuth connections, asset manifests, and render orchestration.
- **Render Engine**: Native Python Pillow compositor (`packages/factoryos-render/src/factoryos_render/backends/image.py`) and FFmpeg backend (`ffmpeg.py`) spawned via `LocalRenderAdapter.ts`. Native backend is authoritative. Remotion is absent and Canva MP4 is not the final production renderer.
- **Voice & Narration**: `VoiceFabric.ts` and `synthesize_quizshow_v2_audio.py` producing 44 discrete female (Zira) Kore warmth acoustic audio tracks for 6 questions, with 6 silent think scenes.
- **Storage & Synchronization**: Backblaze B2 (`BackblazeB2StorageProvider`, `B2StorageManager`) under `shortsfactory-assets/canva-packs/` with local mirror cache in `data/visual-assets-store/b2/`.
- **Canva Partner Role**: Canva acts strictly as an external visual-design authoring environment for static templates/backgrounds/frames. Dynamic text, countdown values, narration, and final video rendering remain native to ShortForge.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Git & Worktree Audit | Full audit of branch, commit SHA, 12 worktrees, and working tree cleanliness | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Environment & Credential Security | Verify CANVA_CLIENT_ID and CANVA_CLIENT_SECRET exist without exposure; verify gitignore | M1 | ORIGINAL_REQUEST §R1, §R3 |
| 3 | V2 Template Invariants Verification | Verify quiz.universal.glass.v1 preserved unchanged; no 3rd quiz template introduced | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Production Renderer Architecture Verification | Verify native image.py / ffmpeg.py authority; Remotion / Canva MP4 renderer exclusion | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Baseline Documentation Delivery | Deliver docs/verification/canva-integration-baseline.md | M1 | ORIGINAL_REQUEST §R1 |
| 6 | 50-Beat Explicit Audio Sequencing | Question -> Option A -> Option B -> Option C -> Option D -> Think -> Answer -> Explanation | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Exact 5-Second Thinking Window | 5,000 ms (150 frames @ 30 fps) digital silence gate (< -50 dBFS, actual -91 dBFS) | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Zero Narration Overlap & Immediate Post-D Start | Think gate starts within 1 frame after Option D audio physically ends; 0 tail on Option D | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Answer Narration at Gate Conclusion | Correct answer narration starts strictly at or after 5.0s think gate ends | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Decoded Physical MP4 Audio Verification | 100-check verification per video decoding physical MP4 audio waveform | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Think Gate Documentation Delivery | Deliver docs/verification/quiz-five-second-think-gate.md with 6-question acceptance tables | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Backend-Managed OAuth 2.0 with PKCE | Code verifier, SHA-256 challenge, HMAC CSRF state validation, token refresh, disconnect | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Redirect URIs Determination & Owner Report | Local (http://localhost:3000/api/canva/callback) & Production reported before portal registration | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Canva Capability Audit & Pro Lite Adaptation | Query GET /rest/v1/users/me/capabilities; accommodate Pro Lite limits with native fallback | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Capability Audit Documentation Delivery | Deliver docs/verification/canva-api-capability-report.md | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Reusable 9:16 Canva Master Visual Template | Master portrait design covering intro, question, think countdown, reveal, explanation, outro | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Canva REST Synchronization Adapter | List designs, fetch metadata, export PNG/MP4 layers, poll jobs with exponential backoff | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Immediate B2 Persistence (Anti-Expiry) | Download exported assets immediately and persist to B2; zero ephemeral URL storage | M4 | ORIGINAL_REQUEST §R4 |
| 19 | Canonical Design Pack Manifest (manifest.json) | Versioned manifest with SHA-256 hashes, element roles, font mappings, and tokens | M5 | ORIGINAL_REQUEST §R5 |
| 20 | Native Renderer Design Pack Integration | Integrate manifest into CompositionIR/F05 & image.py/F06 with 3-tier offline B2 fallback | M5 | ORIGINAL_REQUEST §R5 |
| 21 | Flagship Geography Shorts Production | Produce complete 6-question Geography flagship video with contact sheets & metadata | M6 | ORIGINAL_REQUEST §R6 |
| 22 | Flagship Science Shorts Production | Produce complete 6-question Science flagship video with contact sheets & metadata | M6 | ORIGINAL_REQUEST §R6 |
| 23 | Final Acceptance Documentation Delivery | Deliver docs/verification/canva-hybrid-quiz-acceptance.md with F07 pass across all runs | M6 | ORIGINAL_REQUEST §R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Forensic Baseline Audit | Deliver docs/verification/canva-integration-baseline.md covering Git, env, templates, renderer, and audio baseline | none | IN_PROGRESS |
| M2 | Audio Sequencing & 5s Thinking Window | Implement & verify explicit 50-beat sequencing, 150-frame silent think gate, and deliver docs/verification/quiz-five-second-think-gate.md | M1 | PLANNED |
| M3 | Canva OAuth PKCE & Capability Audit | Implement backend-managed OAuth PKCE, determine redirect URIs, audit capabilities, deliver docs/verification/canva-api-capability-report.md | M1 | PLANNED |
| M4 | Canva Master Template & Asset Sync Adapter | Build Canva REST synchronization adapter, export jobs, and immediate B2 persistence | M3 | PLANNED |
| M5 | Design Pack Manifest & Native Renderer Integration | Generate canonical manifest.json, integrate into image.py/F06 with offline fallback | M4 | PLANNED |
| M6 | Flagship Production Verification & Acceptance | Produce Geography & Science flagship Shorts, contact sheets, deliver docs/verification/canva-hybrid-quiz-acceptance.md | M2, M5 | PLANNED |

## Interface Contracts

### Canva OAuth ↔ Next.js Backend
- Initiation: `GET /api/canva/connect` -> sets secure HTTP-only cookie with encrypted verifier, redirects to Canva auth URL.
- Callback: `GET /api/canva/callback?code=...&state=...` -> validates HMAC CSRF state, exchanges code with PKCE verifier via `POST https://api.canva.com/rest/v1/oauth/token`.
- Storage: Stores tokens encrypted via AES-256-GCM (`ComputeConnectionCrypto.ts`).

### Canva Sync Adapter ↔ Backblaze B2
- Export request: `POST https://api.canva.com/rest/v1/exports`
- Export polling: `GET https://api.canva.com/rest/v1/exports/{id}`
- Upload to B2: `BackblazeB2StorageProvider.upload(stream, { key: "shortsfactory-assets/canva-packs/{pack_id}/{version}/{role}.png", contentType: "image/png" })`
- Local mirror: `data/visual-assets-store/b2/shortsfactory-assets/canva-packs/{pack_id}/{version}/`

### Design Pack Manifest ↔ Native Renderer (`image.py`)
- Manifest path: `manifest.json` in design pack directory.
- Layer loading: Frame overlays (`question_card_frame.png`, `answer_reveal_frame.png`) loaded as RGBA and alpha-composited over B2 blurred backdrop.
- Text & countdown: Rendered procedurally on top of frames using local licensed system fonts (`Segoe UI`, `Arial`, `Inter`).
- Fallback: If assets or B2 are unavailable, renderer falls back to pure native procedural rendering without failing.

### 50-Beat Audio & Visual Event Sequence (Per Question)
1. `QUESTION` (6.5s narration, question card visible)
2. `OPTION_A` (1.5s narration, Option A highlighted)
3. `OPTION_B` (1.5s narration, Option B highlighted)
4. `OPTION_C` (1.5s narration, Option C highlighted)
5. `OPTION_D` (1.5s narration, Option D highlighted, `audioTailSeconds: 0`)
6. `THINK_GATE` (Exactly 5.000s / 150 frames @ 30 fps, digital silence <= -50 dBFS, progress bar animating)
7. `ANSWER_REVEAL` (2.0s narration, emerald punch on correct answer, non-selected dimmed)
8. `EXPLANATION` (6.0s narration, explanation callout visible)

## Code Layout
- `apps/web/`: Next.js 16 Web application & control plane.
  - `app/api/`: API routes (including OAuth callback).
  - `factoryos/core/templates/`: Template production pipeline and payload definitions.
  - `factoryos/core/render/`: Render adapter (`LocalRenderAdapter.ts`).
  - `factoryos/core/voice/`: Voice synthesis fabric (`VoiceFabric.ts`).
  - `lib/templates/`: Canonical template registry (`CanonicalTemplates.ts`).
  - `lib/visual-assets/`: B2 storage provider.
- `packages/factoryos-render/`: Native Python Pillow & FFmpeg rendering backend.
  - `src/factoryos_render/backends/image.py`: Authoritative Pillow frame compositor.
  - `src/factoryos_render/backends/ffmpeg.py`: Scene encoder and MP4 multiplexer.
- `tools/`: Verification and production generation scripts.
  - `verify_quiz_v2_timing.ts`: Automated physical MP4 audio waveform decoding verifier.
  - `render_quizshow_v2_samples.ts`: Flagship render tool.
  - `synthesize_quizshow_v2_audio.py`: Female Zira Kore warmth audio synthesis tool.
- `docs/verification/`: Verification reports and gate documentation.
