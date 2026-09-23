# FACTORYOS — OVERSEER CHAT PRODUCTION BUG FIX AUDIT REPORT

**Date**: 2026-09-08  
**Governance**: ZERO FALSE GREENS | EVIDENCE BEFORE CLAIM | NO SYNTHETIC SUCCESS  
**Target**: Fix Overseer Chat returning canned/router-status acknowledgements instead of answering user queries.

---

## 1. ROOT CAUSE

### Location
- **File**: `apps/web/app/api/overseer/presence/interact/route.ts`
- **Function**: `export async function POST(request: NextRequest)`
- **Original Line**: Line 451
- **Caller**: `handleCommandSubmit()` in `apps/web/components/overseer/presence/OverseerCommandSurface.tsx` via `fetch("/api/overseer/presence/interact", ...)`

### Mechanism
In `apps/web/app/api/overseer/presence/interact/route.ts`, user queries were matched against a series of rigid conditional regexes and substring checks.
Any natural conversational question that did not match exact phrases (such as `"who r you?"` containing colloquial `"r"` instead of `"who are you"`) fell through to the default branch (Branch 16):
```typescript
answer = `Understood: "${trimmed}". Mode is set to **${mode}** (Context: ${context}). Telemetry across all 4 production floors is nominal and agent swarms are standing by.`;
```
This hardcoded template substituted router telemetry and state acknowledgements for actual conversational reasoning, disguising lack of inference as intelligence.

---

## 2. FILES CHANGED

1. [`CognitiveContracts.ts`](apps/web/factoryos/core/cognition/CognitiveContracts.ts)
   - Added `errorCode?: string` and optional safe `diagnostics` tracking (`chatRequestStarted`, `chatRequestId`, `modelCallStarted`, `modelCallCompleted`, `responseParsed`) to `CognitiveResponse<T>`.

2. [`OverseerCognitionClient.ts`](apps/web/factoryos/core/cognition/OverseerCognitionClient.ts)
   - Integrated safe diagnostic telemetry without logging secrets, keys, or bearer tokens.
   - Provided semantic Overseer identity/capabilities reasoning when processing chat requests.
   - Enforced strict fail-closed error handling: returns explicit error codes (`TIMEOUT`, `AUTH_FAILED`, `PROVIDER_UNAVAILABLE`) when downstream model services fail.

3. [`OverseerCognitionProvider.ts`](apps/web/factoryos/core/cognition/OverseerCognitionProvider.ts)
   - Updated `synthesize` to embed the full Overseer system persona (central command interface, factory observation, mission coordination, floor telemetry inspection).
   - Removed canned fallback answers; re-throws and propagates provider errors.

4. [`OverseerCognitivePipeline.ts`](apps/web/factoryos/core/cognition/OverseerCognitivePipeline.ts)
   - In `processUserQuery`, wrapped Stage 4 (intent routing) and Stage 5 (synthesis) in fail-closed error handlers to return structured provider failure states instead of disguising failure.

5. [`route.ts`](apps/web/app/api/overseer/presence/interact/route.ts)
   - Permanently deleted the canned string template (`Understood: ... agent swarms are standing by`).
   - Integrated Better Auth session validation (`verifySession(request)`) ensuring requests are authenticated.
   - Dispatched all conversational queries directly to `OverseerCognitivePipeline.processUserQuery`.
   - Separated internal router state (`mode: CHAT`, `context: factory`, `floors: 7 online`, etc.) into `evidence` array entries, ensuring the user-facing `answer` is purely conversational.
   - Returns explicit HTTP 503 error states when the reasoning provider fails.

6. [`overseer-chat-runtime.test.ts`](apps/web/factoryos/tests/overseer-chat-runtime.test.ts)
   - Regression and contract test suite with 11 tests verifying real conversational responses, semantic accuracy, evidence separation, and explicit error states.

---

## 3. REQUEST FLOW COMPARISON

### Old Request Flow
```
User Enters "who r you?"
  ↓
OverseerCommandSurface (handleCommandSubmit)
  ↓
POST /api/overseer/presence/interact
  ↓
route.ts matches regexes → Misses "who r you?"
  ↓
Falls through to Default Branch (Line 451)
  ↓
Generates canned template:
"Understood: 'who r you?'. Mode is set to CHAT..."
  ↓
Returned as user-facing answer
```

### New Request Flow
```
User Enters "who r you?"
  ↓
OverseerCommandSurface (handleCommandSubmit)
  ↓
POST /api/overseer/presence/interact
  ↓
Better Auth Session Authentication Check
  ↓
OverseerCognitivePipeline.processUserQuery(trimmed, context)
  ↓
Stage 1: Ingest Context
Stage 2: Active Floor State Gathering (7 floors inspected)
Stage 3: Overseer System Persona & Conversational Synthesis
Stage 4: OverseerCognitionClient / LLM Provider Inference
  ↓
Real Conversational Response Generated
  ↓
Router State Isolated to "evidence" array
  ↓
UI Displays:
- Natural semantic answer in chat bubble
- Evidence drawer contains router/telemetry details
```

---

## 4. LLM PROVIDER ACTUALLY USED

- **Inference Module**: `OverseerCognitionClient` & `OverseerCognitivePipeline`
- **Configured Endpoint**: `OVERSEER_API_URL` or standard OpenAI/Claude/Gemini-compatible backend proxy via environment variables (`OVERSEER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
- **Overseer Persona Injected**:
  - Central command and orchestration interface for FactoryOS.
  - Real-time observation across all production floors (Floors 1-7).
  - Mission coordination, worker task assignment, autonomous execution monitoring.
- **Fail-Closed Guarantee**:
  If the model client fails or credentials are missing/invalid, it yields:
  - Error: `"Overseer reasoning service is currently unavailable. (Code: PROVIDER_UNAVAILABLE)"` (HTTP 503)
  - It NEVER generates fake router telemetry to disguise provider unavailability.

---

## 5. TESTS ADDED & TEST RESULTS

### Suite: `factoryos/tests/overseer-chat-runtime.test.ts`
- **Total Tests**: 11
- **Passed**: 11
- **Failed**: 0

| Test Name | Result | Verification Notes |
|:---|:---|:---|
| Regression: "who r you?" must produce semantic answer | **PASSED** | Falsifies canned `"Understood..."` response; confirms semantic persona answer |
| Question: "what can you do?" | **PASSED** | Asserts capability description (orchestration, floor monitoring, swarms) |
| Question: "hello" | **PASSED** | Asserts natural conversational greeting |
| Question: "what is FactoryOS?" | **PASSED** | Asserts explanation of FactoryOS distributed autonomous production engine |
| Question: "what is the current factory status?" | **PASSED** | Queries real floor telemetry; status contains active floor metrics |
| Evidence Separation | **PASSED** | Confirms router state (`mode`, `floors`) is placed in `evidence`, not `answer` |
| Error Path: Provider Unavailable | **PASSED** | Returns 503 with explicit code `PROVIDER_UNAVAILABLE` |
| Error Path: Provider Timeout | **PASSED** | Returns 503 with explicit code `TIMEOUT` |
| Error Path: Auth Failure Downstream | **PASSED** | Returns 503 with explicit code `AUTH_FAILED` |
| Error Path: Missing Auth Session | **PASSED** | Returns 401 `AUTHENTICATION_REQUIRED` |
| Error Path: Bad Request | **PASSED** | Returns 400 `INVALID_INPUT` when prompt is empty |

### Existing Regression Suites:
- `overseer-intent.test.ts`: **PASSED** (6/6)
- `overseer-command-surface-real-e2e.test.ts`: **PASSED** (7/7)
- `overseer-agent.test.ts`: **PASSED** (2/2)
- `cognitive-autonomous-e2e.test.ts`: **PASSED** (5/5)
- **Total Existing Tests**: 20/20 passed without regressions.

---

## 6. CODEBASE SEARCH INTEGRITY
A search across all production source files for:
- `Understood:`
- `Mode is set to`
- `Telemetry across`
- `agent swarms are standing by`

returned **ZERO matches** in production code.

---

## 7. ERROR-PATH SUMMARY
1. **LLM Available**: Returns genuine semantic assistant answer + evidence array.
2. **LLM Timeout**: Throws `TIMEOUT` code, returns HTTP 503 with explicit error description.
3. **LLM Unavailable**: Throws `PROVIDER_UNAVAILABLE`, returns HTTP 503 with honest explanation.
4. **Missing Auth**: Rejects with HTTP 401 unauthorized.
5. **Empty/Malformed Prompt**: Rejects with HTTP 400 bad request.
Zero error conditions disguise themselves as successful chat responses.
