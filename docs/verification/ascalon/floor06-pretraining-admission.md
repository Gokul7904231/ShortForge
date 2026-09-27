# Floor 06 Pre-Training Admission — 2026-09-27

## Admission objective

Teach Ascalon to reason about distributed render execution as a bounded decision-and-evidence loop, not as an unrestricted infrastructure operator.

## Canonical training trajectory

`F05 committed contract
→ provider capability/health/availability evidence
→ RenderAdmissionRecord
→ authorized execution
→ provider receipt
→ physical SHA/size/ffprobe/decode evidence
→ failover or commit
→ F06 handoff
→ F07`

## Training-eligible observations

- provider capability snapshots;
- provider health and availability states;
- hard eligibility rejection reasons;
- utility score components;
- admission policy version;
- provider execution metrics;
- lease/attempt/fencing evidence;
- physical SHA-256 and byte length;
- ffprobe stream evidence;
- decode-smoke evidence;
- failover reason;
- final committed artifact identity.

## Training targets

Ascalon should learn to:

1. separate hard constraints from soft utility signals;
2. explain why a provider is ineligible;
3. detect provider-reported completion that lacks physical proof;
4. identify SHA/size/media mismatches;
5. recommend bounded failover instead of unsafe retry loops;
6. distinguish observed telemetry from estimates;
7. keep F05 semantics immutable;
8. route only through already-authorized capabilities.

## Explicit negatives

Training examples should include rejection cases where the model attempts to:

- self-authorize `cap_render_dispatch`;
- fabricate provider health or capacity;
- equate GPU presence with hardware video encoding;
- accept a remote URL without staged physical bytes;
- treat a bad ffprobe result as a successful render;
- ignore a stale fencing token;
- mutate TimelineSpec or F05 render identity;
- bypass F07.

## Evidence labels

Use explicit labels:

- `OBSERVED_PHYSICAL`
- `OBSERVED_PROVIDER`
- `DETERMINISTIC_POLICY`
- `HEURISTIC_ESTIMATE`
- `MODEL_PROPOSAL`
- `GUARDIAN_AUTHORIZATION`
- `F07_FINAL_VERIFICATION`

Do not collapse these into a single model-confidence value.

## Promotion gate

A training trajectory is admissible only when the referenced runtime contract and its tests pass. Simulation examples must be explicitly marked simulation and must not be mixed with real production evidence without provenance.

Ascalon can propose provider/admission decisions but cannot grant itself capability, revoke a lease directly, mark final release success, or rewrite upstream floor semantics.
