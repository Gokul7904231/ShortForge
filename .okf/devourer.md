
# ShortForge / FactoryOS — Devourer Program Charter

> Document Class: Canonical Self-Improvement Program Charter
> Status: LOCKED / CONTROLLED
> Parent Authority: Overseer
> Cognitive Home: .okf/cognitive/devourer.md
> Purpose: Continuously improve ShortForge while preventing unverified external knowledge, model drift, architecture drift, or self-modification from silently entering production.

## 1. Definition

Devourer is ShortForge's controlled self-improvement system.

Its job is not merely to make the LLM smarter.

Its deeper objective is:

> Make the factory require less expensive intelligence while becoming more capable, reliable, and measurable.

## 2. Absolute authority boundary

Devourer is not sovereign.

~~~
Human
  |
Overseer
  |
Devourer
  |
Candidate experimentation
  |
Evaluation
  |
Canary
  |
Promotion gate
~~~

Devourer cannot silently:

- replace production weights
- expand authority
- change security policy
- rewrite worker permissions
- bypass Guardian
- bypass F07
- replace canonical contracts
- promote an external repository's design directly into production

## 3. Mandatory first step

Every Devourer cycle begins with a complete current .okf review.

The cycle may not start from:

- a GitHub README
- a research paper
- a benchmark
- a model announcement
- a conversation idea

without first reconstructing the current internal architecture.

## 4. Devourer review sequence

~~~
Entire .okf
   |
Current implementation
   |
Current tests
   |
Existing repo mappings
   |
Production-helper evidence
   |
External discovery
   |
Research IR
   |
Architecture comparison
   |
Candidate pattern
   |
Prototype
   |
Benchmark
   |
Evaluation
   |
Canary
   |
Promotion / rejection
~~~

## 5. Repo-mapping assimilation rule

Every useful external repository is treated as a pattern source with provenance.

The Devourer must extract:

- problem solved
- architecture
- mechanism
- assumptions
- security implications
- licensing
- performance implications
- parts already present in ShortForge
- parts worth extending
- parts explicitly rejected

External code is not copied into ShortForge without an explicit licensing and architecture decision.

## 6. Current media engineering stack

Devourer must treat the selected media stack as the first comparison target:

- Remotion — programmatic composition and rendering foundation
- AgentTube — scene-manifest, checkpoint, selective-repair, audio-first pattern source
- TimelineIR — canonical ShortForge composition IR
- RenderFabric / FFmpeg — physical render and deterministic fallback infrastructure

A new renderer must beat or complement this stack on a documented capability, cost, latency, fidelity, reliability, or operational property.

## 7. Worker cognition improvement

Devourer should search for:

- repeated expensive decisions that can become deterministic rules
- stable classifications that can become Fast Decision Core heads
- sequential calls that can become decision packs
- recurring failures that can become preflight checks
- repeated worker mistakes that can become better contracts
- redundant capabilities that can be removed
- permissions that can be attenuated
- templates that can be standardized

## 8. Training data rule

Only real, verified trajectories belong in the trusted training set.

Minimum trusted provenance:

- WorldState
- TraceContext
- task / mission identity
- evidence
- artifact identity
- verification outcome
- model / provider version

Synthetic hallucinated telemetry is never silently converted into training truth.

## 9. Candidate model gate

A candidate model must pass, as applicable:

1. contract validation
2. held-out evaluation
3. factuality / provenance evaluation
4. decision quality
5. calibration
6. safety / permission regression
7. worker behavior regression
8. latency
9. throughput
10. memory / compute budget
11. production-helper checks
12. canary validation
13. rollback readiness

## 10. Architecture candidate gate

A candidate architecture must pass:

~~~
.okf review
+
repo-mapping comparison
+
code feasibility
+
security review
+
failure-mode analysis
+
benchmark
+
tests
+
staging evidence
+
rollback plan
~~~

## 11. Promotion

Only the authorized promotion path may convert a candidate into production truth.

Devourer may recommend.

Overseer / appropriate authority approves within established governance.

Guardian continues to enforce capability boundaries.

F07 continues to verify physical output.

## 12. Rejection reasons

A candidate is rejected when:

- evidence is insufficient
- implementation contradicts canonical authority
- security becomes weaker
- worker boundaries become ambiguous
- verification is bypassed
- performance gain is unproven
- licensing is incompatible
- rollback is unsafe
- it increases complexity without measurable value

## 13. Devourer records

Maintain:

- Research IR
- ArchitectureProposal
- LearningCandidate
- ModelEvaluation
- BenchmarkRecord
- CanaryRecord
- PromotionDecision
- RejectionReason
- RollbackRecord

## 14. Final Devourer loop

~~~
Observe
  |
Digest
  |
Compare
  |
Discover
  |
Prototype
  |
Measure
  |
Verify
  |
Canary
  |
Promote or Reject
  |
Record
  |
Learn
~~~

The loop improves both the Fast Decision Core and the ShortForge Cognitive Model, while also seeking ways to reduce the need for expensive cognition.
