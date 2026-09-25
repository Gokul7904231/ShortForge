# Ascalon / ShortForge Cognitive Model — Team Protocol

Ascalon is the fine-tuned ShortForge Cognitive Model used for bounded Team cognition. It is not the Team authority.

## Runtime position

Human / repository authority
→ .okf
→ Team Change Gate
→ Fast Decision Core / Ascalon
→ Forger evidence
→ authorized decision

## Efficient inference

1. Deterministic change detector captures the diff.
2. Governance/compiler performs the full .okf sweep.
3. Context Compiler builds TeamChangeIR.
4. Fast Decision Core handles cheap routing, risk and gate classification.
5. Ascalon handles deeper conflict analysis, planning, diagnosis and synthesis.
6. Forgers execute bounded work and emit evidence.
7. Deterministic validators check the Team report.
8. Only a proven disposition advances the change.

## Mandatory conflict behavior

When the change contradicts an .okf rule, Ascalon must preserve the contradiction and produce a ConflictRecord containing ruleRefs, originalConflict, change claim, evidence, proposedResolution, tradeOffs, requiredAuthority and canonicalUpdates.

A model response that hides a contradiction is a failed trajectory even when its proposed implementation is technically useful.

## Safety boundaries

Ascalon cannot:
- rewrite .okf law silently
- grant production capabilities
- bypass Guardian, F07, leases/fencing, CAS or ReleaseAuthorization
- convert UNPROVEN evidence to PASS
- publish a change solely because its own reasoning says it is safe
