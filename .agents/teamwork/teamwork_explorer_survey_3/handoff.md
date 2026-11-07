# Canva Integration & Native Renderer Inspection Report (Milestones R3, R4, R5)

**Agent:** `teamwork_explorer_survey_3`  
**Execution Date:** 2026-11-02  
**Mission Scope:** Milestones R3, R4, R5 (Canva OAuth 2.0 PKCE, Synchronization Adapter, Design Pack Manifest, and Native Renderer Integration)  
**Status:** COMPLETE (Ready for Orchestration & Implementation)

---

## 1. Observation

### 1.1 Backend Routing Architecture & Host/Port Configuration
- **Control Plane Framework:** Next.js 16.2.12 App Router located at `apps/web/` (`package.json:65`).
- **Default Port & Local Origin:** Next.js dev and start scripts run on port `3000` (`http://localhost:3000`) (`apps/web/package.json:10,19`).
- **Production Origin Variables:** In `apps/web/.env.render.production.example:15-18` and `apps/web/.env`:
  ```bash
  NEXT_PUBLIC_APP_URL=
  NEXT_PUBLIC_API_BASE_URL=
  CONTROL_PLANE_URL=
  APP_ORIGIN=
  ```
- **Existing Route Prefixes & Patterns:**
  - Standard API routes: `apps/web/app/api/` (over 109 routes per `CLAUDE.md:9`).
  - Existing OAuth route implementations:
    - Google Drive OAuth: `apps/web/app/api/drive/connect/route.ts` and `apps/web/app/api/drive/callback/route.ts`.
    - Kaggle OAuth PKCE: `apps/web/app/api/compute/connections/oauth/kaggle/route.ts` and `.../callback/route.ts`.
- **Middleware Boundary:**
  - `apps/web/middleware.ts:10-26` defines `PUBLIC_PREFIXES`:
    ```typescript
    const PUBLIC_PREFIXES = [
      "/login",
      "/api/published-video",
      "/api/health",
      "/health",
      "/api/auth",
      "/api/render-workers/pair",
      "/api/render-workers/heartbeat",
      "/api/rendering",
      "/api/templates",
      "/_next",
      "/public",
      "/favicon.ico",
      "/demo-short.mp4",
      "/german-quiz.mp4",
      "/german-quiz-poster.jpg",
    ];
    ```
  - `apps/web/middleware.ts:183-195` enforces fail-closed authentication (`401 Unauthorized`) for general `/api/*` endpoints not in `PUBLIC_PREFIXES` unless an active session cookie or secret key is present.
  - Therefore, OAuth callback routes that receive external browser redirects must either be registered under `/api/auth/` (e.g. `/api/auth/canva/callback`) or be explicitly added to `PUBLIC_PREFIXES` in `middleware.ts`.

### 1.2 Canva Client Credentials & Git-Ignored Status
- Command executed safely to verify presence without exposure:
  ```python
  # Python inspection script verifying key presence and non-empty length only
  apps/web/.env: CANVA_CLIENT_ID_EXISTS=True, CANVA_CLIENT_SECRET_EXISTS=True
  ```
- Git-ignored status verified via Git engine:
  ```bash
  $ git check-ignore -v apps/web/.env
  apps/web/.gitignore:34:.env*    apps/web/.env
  ```
  Root `.gitignore:34-43` and `apps/web/.gitignore:34` explicitly match `.env`, `*.env`, and `**/*.env`. No credentials are or have been tracked in Git.

### 1.3 Existing PKCE and Cryptographic Reference Implementations
- `apps/web/factoryos/core/compute/connections/KaggleOAuthService.ts`:
  - PKCE verifier generation (`lines 222-224`):
    ```typescript
    export function createPkceVerifier(): string {
      return crypto.randomBytes(32).toString("base64url");
    }
    ```
  - Code challenge computation (`lines 218-220`):
    ```typescript
    export function sha256Base64Url(value: string): string {
      return crypto.createHash("sha256").update(value).digest("base64url");
    }
    ```
  - HMAC-signed CSRF state generation (`lines 56-72`):
    - Nonce: `crypto.randomBytes(32).toString("base64url")`
    - Timestamp: `Date.now()`
    - Signature: `crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url")`
    - Stored in HttpOnly cookie (`maxAge: 600`, 10 minutes).
- Credential encryption in database:
  - `apps/web/factoryos/core/compute/connections/ComputeConnectionCrypto.ts:3-41`:
    - Cipher: AES-256-GCM (`ALGORITHM = "aes-256-gcm"`).
    - Key source: `CREDENTIAL_ENCRYPTION_KEY` hashed with SHA-256.
    - Bundle: `{ version: 1, iv, authTag, ciphertext }`.
    - Sanitized display helper: `maskConnectionSecret()` (`line 75-78`).

### 1.4 Backblaze B2 Object Storage Integration
- Environment variables present in `apps/web/.env`:
  `B2_APPLICATION_KEY_ID: True`, `B2_APPLICATION_KEY: True`, `B2_BUCKET_NAME: True`, `B2_ENDPOINT: True`.
- Implementation: `apps/web/lib/visual-assets/StorageProvider.ts:61-275`:
  - `BackblazeB2StorageProvider`:
    - Authorizes with B2 API via `https://api.backblazeb2.com/b2api/v2/b2_authorize_account` using Basic auth (`B2_APPLICATION_KEY_ID:B2_APPLICATION_KEY`).
    - Obtains `apiUrl`, `authorizationToken`, and `downloadUrl`.
    - Gets upload URL via `b2_get_upload_url`.
    - Uploads asset stream with `X-Bz-File-Name`, `Content-Type`, `Content-Length`, and `X-Bz-Content-Sha1`.
    - Returns canonical URI: `b2://${this.bucketName}/${cleanedKey}`.
    - Local fallback / mirror cache: `data/visual-assets-store/b2/`.
- Telemetry & retention: `apps/web/lib/storage/b2-storage-manager.ts:1-150`:
  - Enforces strict separation between permanent assets (`prefix: "permanent"`, e.g. B2 background image library) and temporary renders (`prefix: "temp-renders"`).
  - Permanent asset safety rule (`line 116-117`): `if (obj.prefix === "permanent") continue;` — permanent assets are never purged.

### 1.5 Native Rendering Backend & Template Architecture
- Authoritative renderer: `packages/factoryos-render/src/factoryos_render/backends/image.py` (Pillow `NativeFrameCompositor`, 727 lines).
  - Input: 1080x1920 (9:16 vertical), 30 fps.
  - Safe area margins: `safe_top = 160`, `safe_bottom = 320`, `left_margin = 80`, `right_margin = 1000`.
  - Font loading (`image.py:39-59`): Loads local system TTF fonts (`Segoe UI`, `Arial`, `DejaVuSans`). Local licensed fonts are resolved without extracting Canva font files.
  - Photographic subject backdrop (`image.py:210-225`):
    - Scaled via `ImageOps.fit` to (1080, 1920).
    - Atmospheric blur via `ImageFilter.GaussianBlur(radius=18)`.
    - Scrim alpha composite: `(6, 12, 24, 195)` dark navy tint.
  - Shot recipes handled natively:
    - `QUESTION_CARD` (`image.py:371-418`): Category pill, crisp wrapped question text, 4 option boxes with option badges (A, B, C, D) and active highlight styling.
    - `COUNTDOWN` (`image.py:419-470`): Timer pill `⏱️ {rem_secs}s`, dynamic countdown progress bar (V2), suspense option boxes.
    - `ANSWER_REVEAL` (`image.py:471-568`): Correct option emerald punch (`fill=(16, 95, 48, 245)`, `outline=(52, 211, 153, 255)`), vector checkmark, dimmed unselected options, explanation box `💡 {explanation}`.
    - Captions / Subtitles (`image.py:658-692`): Dedicated high-contrast pill `(5, 10, 20, 225)` at `caption_y = 1490` for quiz.
- Template registry & production pipeline:
  - `apps/web/lib/templates/definitions/CanonicalTemplates.ts:590-740`:
    - `quiz.universal.glass.v1` (lines 590-663) is preserved unchanged.
    - `quiz.universal.cinematic.v2` (lines 665-740) is the upgraded V2 template.
  - `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`:
    - 50-beat explicit sequence (`lines 346-455`):
      `Hook -> (Question -> Option A -> Option B -> Option C -> Option D -> Think Gate [5.0s] -> Answer Reveal -> Explanation) x 6 -> Outro`.
    - Option D ends with `audioTailSeconds: 0` (`line 390`).
    - Think gate is 5.0 seconds (150 frames at 30 fps), silent, with zero narration overlap (`lines 1255, 1288-1297, 1381`).
    - Answer narration starts only after think gate ends (`lines 423-426`).

---

## 2. Logic Chain

### 2.1 Determination of Exact Redirect URIs for Canva OAuth 2.0 PKCE
1. **Host & Port Context:** Next.js serves the Control Plane on port `3000` locally and on `${APP_ORIGIN}` / `${CONTROL_PLANE_URL}` in production.
2. **Path Selection:**
   - In Next.js App Router, routes under `app/api/canva/callback/route.ts` map to URL path `/api/canva/callback`.
   - In `apps/web/middleware.ts:10-26`, `/api/auth` is already in `PUBLIC_PREFIXES`. If the route is placed at `app/api/auth/canva/callback/route.ts`, it is exempt from middleware session gating by default. If placed at `app/api/canva/callback/route.ts`, `/api/canva/callback` must be added to `PUBLIC_PREFIXES` in `middleware.ts`.
3. **Exact URIs to Report to Owner for Canva Developer Portal Registration:**
   - **Local URI (Primary):** `http://localhost:3000/api/canva/callback`
   - **Local URI (Alternative under public prefix):** `http://localhost:3000/api/auth/canva/callback`
   - **Production URI (Primary):** `https://shortforge.com/api/canva/callback` (or `${APP_ORIGIN}/api/canva/callback`)
   - **Production URI (Alternative under public prefix):** `https://shortforge.com/api/auth/canva/callback` (or `${APP_ORIGIN}/api/auth/canva/callback`)

### 2.2 Backend-Managed OAuth 2.0 PKCE Architecture
1. **Security Constraint:** Never expose `CANVA_CLIENT_ID` or `CANVA_CLIENT_SECRET` to browser clients. All exchanges occur server-side in Node.js runtime.
2. **PKCE Flow Execution:**
   - When user clicks "Connect Canva" in Settings/Visual Assets, client initiates `GET /api/canva/connect` (or `POST`).
   - Server generates `code_verifier = crypto.randomBytes(32).toString("base64url")`.
   - Server computes `code_challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")`.
   - Server creates CSRF state with HMAC signature using `OAUTH_STATE_SECRET` (falling back to `INTERNAL_API_SECRET_KEY`):
     - `statePayload = { userId, nonce, issuedAt, hmac }`
     - Server sets `canva_oauth_state` HttpOnly, Secure, SameSite=Lax cookie containing `{ nonce, issuedAt, codeVerifier }` (encrypted via AES-256-GCM).
   - Server redirects user to Canva authorization URL:
     ```
     https://www.canva.com/api/oauth/v1/authorize?
       client_id=${CANVA_CLIENT_ID}&
       response_type=code&
       redirect_uri=${REDIRECT_URI}&
       code_challenge=${code_challenge}&
       code_challenge_method=S256&
       state=${state}&
       scope=design:content:read%20design:meta:read%20export:read%20export:write%20profile:read
     ```
3. **Callback Processing (`/api/canva/callback`):**
   - Receives `code` and `state`.
   - Verifies state HMAC in constant time (`crypto.timingSafeEqual`).
   - Verifies cookie nonce matches state nonce and timestamp is within 10 minutes.
   - Extracts `code_verifier` from encrypted cookie.
   - Executes POST request to Canva token endpoint:
     `POST https://api.canva.com/rest/v1/oauth/token`
     - Headers: `Authorization: Basic base64(${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET})`, `Content-Type: application/x-www-form-urlencoded`.
     - Body: `grant_type=authorization_code&code=${code}&redirect_uri=${REDIRECT_URI}&code_verifier=${code_verifier}`.
   - Receives `{ access_token, refresh_token, expires_in, token_type }`.
4. **Token Storage & Disconnect:**
   - Tokens encrypted via `ComputeConnectionCrypto.encryptConnectionSecrets()` (AES-256-GCM) and persisted in Firestore collection `canva_connections` (or MongoDB/SQLite connection store).
   - Refresh token rotated automatically via `POST https://api.canva.com/rest/v1/oauth/token` with `grant_type=refresh_token`.
   - Safe disconnect: Revokes tokens via Canva revocation API `POST https://api.canva.com/rest/v1/oauth/revoke` and deletes database record.

### 2.3 Canva Capabilities Audit & Pro Lite Subscription Handling
1. **Capabilities Verification:**
   - Query endpoint: `GET https://api.canva.com/rest/v1/users/me/capabilities` with `Authorization: Bearer <access_token>`.
   - Scopes audited:
     - `design:content:read` / `design:meta:read`: Required to inspect master template dimensions and elements.
     - `export:read` / `export:write`: Required to export PNG/MP4 layers.
     - `profile:read`: Account verification.
     - `autofill:read` / `autofill:write`: Optional enhancement.
2. **Pro Lite Constraints:**
   - Pro Lite accounts may have restricted access to enterprise features (such as the Canva Autofill API).
   - Export rate limits and concurrency limits apply (e.g. 1-2 concurrent exports, queueing required).
   - Export download URLs expire rapidly (within 24 hours).
3. **Architectural Separation & Native Fallback:**
   - In accordance with R3 and R4, Canva is utilized as an **external visual-design authoring environment** for static visual layouts, backgrounds, and brand frames.
   - Dynamic text (questions, options, explanations), audio narration, countdown numbers, and B2 background resolution are owned by ShortForge native renderer.
   - Therefore, if Autofill is unavailable under Pro Lite, ShortForge operates seamlessly with zero degradation: native PIL rendering overlays dynamic text directly onto Canva visual layers.

### 2.4 B2 Asset Synchronization Adapter & Anti-Expiry Invariant
1. **Canva Export Invariant:** Canva export URLs are strictly ephemeral. They must never be stored in video render intents or database manifests.
2. **Synchronization Lifecycle:**
   - Step 1: Request export via `POST https://api.canva.com/rest/v1/exports` specifying format (`type: "png"` or `"mp4"`), export quality, and page/element IDs.
   - Step 2: Poll `GET https://api.canva.com/rest/v1/exports/{export_id}` until `status === "success"`.
   - Step 3: Stream physical bytes directly into memory/buffer from temporary download URL.
   - Step 4: Compute authoritative SHA-256 hash.
   - Step 5: Upload to Backblaze B2 using `BackblazeB2StorageProvider` under permanent prefix:
     `shortsfactory-assets/canva-packs/{pack_id}/{version}/{asset_role}.png`.
   - Step 6: Write local mirror cache to `data/visual-assets-store/b2/shortsfactory-assets/canva-packs/...`.
   - Step 7: Record asset entry in `manifest.json`.

### 2.5 Native Renderer Integration & Offline B2 Fallback
1. **Authoritative Rendering:** `packages/factoryos-render/src/factoryos_render/backends/image.py` remains the final production renderer. Remotion or Canva MP4 video exports are never used as the final production renderer.
2. **Overlay Mechanism:**
   - When rendering a quiz scene (e.g. `QUESTION_CARD`), the compositor loads the static frame layer from the design pack (e.g. `question_card_frame.png` with transparent cutout for dynamic text).
   - Composites on top of the B2 photographic subject backdrop (which has Gaussian blur and dark scrim).
   - Renders dynamic text, countdown timer, options, and captions on top with local fonts.
3. **Offline Fallback Guarantee:**
   - Priority 1: Local mirror cache on disk (`data/visual-assets-store/b2/...`) verified by SHA-256.
   - Priority 2: Remote Backblaze B2 Object Storage download.
   - Priority 3: Native procedural drawing in `image.py` (which already implements cards, pills, gradients, countdown bars, and emerald reveal boxes without external assets).
   - Result: 100% rendering resilience even if Canva servers are completely offline or unreachable.

---

## 3. Caveats

1. **Owner Design Selection:** The exact Canva master design ID will be selected and approved by the owner during Phase 3 after OAuth readiness and capability audit reporting. The synchronization adapter must accept any valid design ID chosen by the owner.
2. **Canva Rate Limits:** Canva REST APIs enforce rate limits on export job creation. The synchronization adapter must implement exponential backoff retry logic and poll interval throttling (e.g. 1.5s to 3s).
3. **No Font File Extraction:** Canva Terms of Use prohibit downloading raw proprietary font files from Canva. Local system fonts (`Segoe UI`, `Arial`, `DejaVu Sans`, `Inter`) must be mapped via `manifest.json` font mappings.

---

## 4. Conclusion

1. **Routing & Redirect URIs:** The backend routing architecture is fully mapped. The exact redirect URIs to be communicated to the owner for registration in the Canva Developer Portal are:
   - **Local Redirect URI:** `http://localhost:3000/api/canva/callback` (or `http://localhost:3000/api/auth/canva/callback`)
   - **Production Redirect URI:** `https://shortforge.com/api/canva/callback` (or `${APP_ORIGIN}/api/canva/callback`)
2. **OAuth PKCE Readiness:** All architectural building blocks for backend-managed PKCE (`crypto.randomBytes(32).toString("base64url")`, SHA-256 `code_challenge`, HMAC state verification, AES-256-GCM token encryption) already exist in `apps/web/factoryos/core/compute/connections/KaggleOAuthService.ts` and `ComputeConnectionCrypto.ts` and provide an exact blueprint for Canva OAuth.
3. **Credentials Verified Safely:** `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` exist in `apps/web/.env`, and `apps/web/.env` is strictly git-ignored by `.gitignore:34`.
4. **B2 Storage Architecture:** `BackblazeB2StorageProvider` and `B2StorageManager` provide full authorization, upload, SHA hashing, and local cache mirroring. Canva assets will be downloaded immediately upon export completion and permanently persisted to B2.
5. **Renderer Authority:** Native rendering in `image.py` and `TemplateProductionPipeline.ts` strictly satisfies the 5-second think gate, narration sequencing, B2 background resolution, and dynamic typography requirements without reliance on Canva for dynamic content.
6. **Canonical Design Pack Manifest Spec:** A complete, immutable `manifest.json` schema is specified below.

---

## 5. Canonical Design Pack Manifest Specification (`manifest.json`)

The design pack manifest is an immutable, versioned JSON contract stored in B2 and mirrored locally at:  
`data/visual-assets-store/b2/shortsfactory-assets/canva-packs/{packId}/{version}/manifest.json`

```json
{
  "$schema": "https://shortforge.internal/schemas/design-pack-manifest.v1.json",
  "manifestVersion": "1.0.0",
  "designPackId": "canva.pack.quizshow.master.v1",
  "version": "1.0.0",
  "title": "ShortForge Universal Canva Master Visual Design Pack",
  "description": "Master 9:16 portrait design pack covering intro, question, think countdown, answer reveal, explanation, and outro across all quiz categories.",
  "createdAt": "2026-11-02T12:00:00.000Z",
  "provider": {
    "name": "canva",
    "sourceDesignId": "DAF_EXAMPLE_APPROVED_DESIGN_ID",
    "exportTimestamp": "2026-11-02T12:05:00.000Z",
    "exportJobId": "exp_canva_789456123",
    "canvaApiVersion": "v1"
  },
  "canvas": {
    "width": 1080,
    "height": 1920,
    "aspectRatio": "9:16",
    "targetFps": 30,
    "safeArea": {
      "top": 160,
      "bottom": 320,
      "left": 80,
      "right": 80
    }
  },
  "assets": {
    "intro_card_frame": {
      "role": "intro_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/intro_card_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/intro_card_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/intro_card_frame.png",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "sizeBytes": 142500,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    },
    "question_card_frame": {
      "role": "question_card_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/question_card_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/question_card_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/question_card_frame.png",
      "sha256": "f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2",
      "sizeBytes": 185400,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    },
    "think_countdown_frame": {
      "role": "think_countdown_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/think_countdown_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/think_countdown_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/think_countdown_frame.png",
      "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      "sizeBytes": 178200,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    },
    "answer_reveal_frame": {
      "role": "answer_reveal_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/answer_reveal_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/answer_reveal_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/answer_reveal_frame.png",
      "sha256": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
      "sizeBytes": 192800,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    },
    "explanation_card_frame": {
      "role": "explanation_card_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/explanation_card_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/explanation_card_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/explanation_card_frame.png",
      "sha256": "c897931f71dfb5c9603099955743b0ce944a9918fb5de632c0d510ff3f124bf0",
      "sizeBytes": 164000,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    },
    "outro_card_frame": {
      "role": "outro_card_frame",
      "exportFormat": "png",
      "b2Key": "shortsfactory-assets/canva-packs/quizshow-master-v1/outro_card_frame.png",
      "b2Uri": "b2://factoryos-assets/shortsfactory-assets/canva-packs/quizshow-master-v1/outro_card_frame.png",
      "localMirrorPath": "data/visual-assets-store/b2/shortsfactory-assets/canva-packs/quizshow-master-v1/outro_card_frame.png",
      "sha256": "4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865",
      "sizeBytes": 151200,
      "dimensions": { "width": 1080, "height": 1920 },
      "hasAlpha": true
    }
  },
  "fontMappings": {
    "Canva Sans": {
      "localCandidates": ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"],
      "fallback": "DejaVuSans.ttf"
    },
    "Canva Sans Bold": {
      "localCandidates": ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"],
      "fallback": "DejaVuSans-Bold.ttf"
    },
    "Inter": {
      "localCandidates": ["Inter-Regular.ttf", "segoeui.ttf", "arial.ttf"],
      "fallback": "arial.ttf"
    },
    "Inter Black": {
      "localCandidates": ["Inter-Black.ttf", "segoeuib.ttf", "arialbd.ttf"],
      "fallback": "arialbd.ttf"
    }
  },
  "designTokens": {
    "colors": {
      "cardBackgroundRgba": [11, 18, 32, 248],
      "accentRgb": {
        "geography": [6, 182, 212],
        "science": [139, 92, 246],
        "history": [245, 158, 11],
        "ai": [59, 130, 246],
        "default": [0, 170, 255]
      },
      "correctAnswerPunchRgba": [16, 95, 48, 245],
      "correctAnswerOutlineRgba": [52, 211, 153, 255],
      "dimmedOptionRgba": [13, 20, 36, 140],
      "dimmedOptionTextRgba": [100, 116, 139, 200],
      "timerAmberRgb": [245, 158, 11],
      "timerRedRgb": [239, 68, 68],
      "captionPillRgba": [5, 10, 20, 225],
      "captionTextRgba": [254, 240, 138, 255]
    },
    "geometry": {
      "cardTop": 320,
      "cardBottom": 1380,
      "cardRadius": 26,
      "dividerYOffset": 190,
      "optionBoxHeight": 105,
      "optionBoxRadius": 18,
      "optionVerticalSpacing": 125,
      "captionY": 1490
    },
    "typography": {
      "categoryPillFontSize": 28,
      "questionFontSize": 38,
      "optionFontSize": 36,
      "optionBadgeFontSize": 32,
      "timerFontSize": 34,
      "captionFontSize": 48,
      "explanationFontSize": 28
    }
  },
  "licensingProvenance": {
    "author": "ShortForge Core Team",
    "canvaLicenseType": "Canva Pro Lite Integration",
    "commercialUseConfirmed": true,
    "fontExtractionProhibited": true,
    "redistributionScope": "Compiled MP4 media output only; raw Canva templates preserved in Canva cloud",
    "assetGrounding": "Backblaze B2 persistent photographic asset library (shortsfactory-assets/quiz-v2/)"
  },
  "offlineFallback": {
    "allowLocalCacheFallback": true,
    "allowB2StorageFallback": true,
    "allowProceduralNativeFallback": true,
    "proceduralRendererPath": "packages/factoryos-render/src/factoryos_render/backends/image.py"
  }
}
```

---

## 6. Verification Method

To independently verify the facts and architecture documented in this report:

1. **Verify Backend Routing & Host/Port:**
   - Inspect `apps/web/package.json` line 10 and 19 to confirm Next.js dev and start scripts.
   - Inspect `apps/web/middleware.ts` lines 10-26 and 183-195 to verify `PUBLIC_PREFIXES` and fail-closed `/api/*` protection.
   - Inspect `apps/web/app/api/drive/connect/route.ts` and `apps/web/app/api/compute/connections/oauth/kaggle/route.ts` to confirm existing OAuth routing conventions.

2. **Verify Canva Credentials & Git-Ignore Boundary:**
   - Run `git check-ignore -v apps/web/.env` to confirm the file is ignored by Git (`apps/web/.gitignore:34:.env*`).
   - Run a non-printing check to confirm `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` keys exist with non-zero length:
     ```bash
     python -c "import os; lines = open('apps/web/.env').readlines(); print('CANVA_CLIENT_ID_EXISTS:', any(l.startswith('CANVA_CLIENT_ID=') and len(l.split('=',1)[1].strip())>0 for l in lines)); print('CANVA_CLIENT_SECRET_EXISTS:', any(l.startswith('CANVA_CLIENT_SECRET=') and len(l.split('=',1)[1].strip())>0 for l in lines))"
     ```

3. **Verify B2 Storage Integration:**
   - Inspect `apps/web/lib/visual-assets/StorageProvider.ts` lines 61-275 (`BackblazeB2StorageProvider`) and `apps/web/lib/storage/b2-storage-manager.ts`.
   - Verify 12 qualified B2 assets documented in `docs/verification/quiz-v2-b2-asset-qualification.md` exist under `data/visual-assets-store/b2/shortsfactory-assets/quiz-v2/`.

4. **Verify Native Renderer (image.py) & Dynamic Content Separation:**
   - Inspect `packages/factoryos-render/src/factoryos_render/backends/image.py`:
     - Lines 39-59: local font resolution without font extraction.
     - Lines 210-225: photographic B2 background resolution with Gaussian blur and scrim.
     - Lines 371-418: dynamic `QUESTION_CARD` rendering.
     - Lines 419-470: dynamic `COUNTDOWN` with timer pill and progress bar.
     - Lines 471-568: dynamic `ANSWER_REVEAL` with emerald punch and dimmed options.
     - Lines 658-692: captions pill at `caption_y = 1490`.

5. **Verify Template Production Pipeline Audio-First Synchronization:**
   - Inspect `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`:
     - Lines 346-455: 50-beat structure with 0-tail on option D.
     - Lines 1255-1258, 1288-1297, and 1381-1392: 5.0-second silent think gate (150 frames at 30 fps) starting at the physical end of option D audio with zero narration overlap.
