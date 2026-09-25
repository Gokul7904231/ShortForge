# Team Model Protocol

**Status:** LOCKED GOVERNANCE EXTENSION

This document defines how the ShortForge fine-tuned Cognitive Model / Ascalon participates in the Team workflow.

## 1. Authority

.okf is the law.
Team is the development workforce.
Ascalon is bounded cognition.

Ascalon cannot amend authority by inference.

## 2. Input

The model receives a compact TeamChangeIR projection produced after the complete current .okf sweep.

The projection contains authoritative source references, relevant constraints, repo mappings, helper/security evidence, candidate actions and the verification contract.

## 3. Output

The model emits typed, schema-validated structures for:
- change classification
- Forger routing
- risk and escalation
- contradiction analysis
- bounded resolution proposals
- verification plan
- Team Change Report draft

## 4. Conflict invariant

When a contradiction exists, the output must preserve the original conflict and propose a resolution. It must never silently rewrite, omit or soften the conflicting .okf law.

## 5. Training and evaluation

Positive examples teach correct gate order.

Negative examples target:
- skipped .okf sweep
- authority inversion
- hidden contradiction
- false PASS from UNPROVEN tooling
- unauthorized security scanning
- capability escalation
- browser evidence mistaken for physical backend truth
- deletion of resolved conflicts from reports

Deterministic validators are the first grading layer; trajectory evaluation and deeper judges are secondary.

## 6. IR / JSON policy

TeamChangeIR is the semantic contract.

Canonical JSON is the transport/persistence representation.

Model context is a compact projection of TeamChangeIR.

Human review is Markdown.

No model optimization is allowed to change the semantics of the underlying IR.
