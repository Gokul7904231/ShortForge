# Reverse Features — Candidate Evaluation Protocol

> Applies to all RF-00–RF-20 workstreams. Subordinate to `.okf/decision-protocol.md` and existing canonical contracts.

## 1. Candidate set

Every candidate register starts with the current ShortForge implementation (`INCUMBENT`). Add all viable mechanisms discovered through REA, source analysis, earlier repo mappings, papers, or independent design. Add a hybrid when combining mechanisms is plausible and evaluable. Do not add straw-man alternatives just to make a favored design look best.

Pin each candidate identity: repository/version/commit or design revision, relevant modules, license/provenance, evidence scope, configuration and implementation status. Distinguish measured implementation from paper design, README claim, prototype or inference.

## 2. Fairness and pairwise challenge

For N viable candidates, produce N×(N−1)/2 pairwise comparisons, or document why a specific pair is genuinely inapplicable. Include the incumbent in those comparisons. Do not limit the exercise to marketing-style feature lists or compare one alternative only with the incumbent while leaving alternatives unchallenged.

Before execution:
- define the user outcome, hard constraints, acceptance criteria and shared workload;
- freeze/record datasets, inputs, test cases, environment, versions and configuration;
- separate mandatory gates from optimizable metrics;
- define sample size, repeat count and statistical/measurement caveats when benchmarking applies;
- record what evidence can prove and what it cannot.

Run candidates under equivalent conditions. When an alternative is not yet implemented, compare documented/source-supported mechanisms but label empirical claims UNVERIFIED; do not invent its performance.

## 3. Mandatory hard gates

A candidate failing an applicable hard gate is BLOCKED/REJECTED regardless of other scores:
- violates law, license or clean-room/provenance requirements;
- breaks security, identity isolation, trust boundaries or capability permissions;
- violates Human/Overseer, Guardian, Treasurer, worker or F07 authority boundaries;
- corrupts data/artifact identity or treats claims as physical evidence;
- breaks mandatory canonical contracts without an approved migration decision;
- cannot meet mandatory user/safety/release requirements;
- relies on fabricated outputs, non-reproducible evidence or a false PASS.

Record gate disposition and evidence per candidate. Unknown is not a pass.

## 4. Comparison dimensions

Select dimensions that fit the domain and disclose omissions. Consider:
- correctness and behavioral parity;
- user/outcome quality and completeness;
- robustness, failure isolation, recovery and durability;
- latency/throughput/tail latency and CPU/RAM/GPU/network consumption;
- real cost, quota/scarcity use and operating burden;
- security, privacy, authorization and attack surface;
- maintainability, complexity, observability and dependency risk;
- migration/backward compatibility and impact on existing users;
- license/provenance risk;
- quality, authority and reproducibility of evidence.

Prefer raw measurements with confidence/caveats over ungrounded scores. Do not hide incomparable dimensions in a single weighted average. Apply hard gates first, then use transparent metric comparisons, Pareto analysis or explicit priorities. A candidate can win one dimension and lose another; disclose the trade-off.

## 5. Adversarial tests

Use positive, boundary, malformed, denied/unauthorized, timeout, partial-result, cancellation, provider failure, retry, recovery and regression cases as appropriate. Try to falsify the strongest claim made by each candidate. Tests must not manufacture successful upstream stage outputs to help downstream stages pass.

For performance claims, preserve command, revision, environment, workload, warm/cold conditions, run count, raw results, variance/outliers and tool version. For source/REA investigations, preserve target identity, source locations/Evidence references, exact coverage and unknowns.

## 6. Winner and rejection rules

The chosen candidate must:
1. pass every applicable hard gate;
2. meet all required acceptance criteria;
3. demonstrate a material advantage on the declared objective, or provide a justified trade-off with no safer/equally effective alternative;
4. remain compatible with ShortForge's canonical authority and contract model;
5. have an achievable verification and rollback plan.

Do not force a universal winner if the evidence shows incomparable trade-offs. Use `NEEDS_EVIDENCE` or make a narrowly scoped decision with explicit conditions. The incumbent may remain the operational default pending more proof, without claiming it is globally optimal. Reject alternatives with recorded evidence/reasons.

## 7. Required comparison table

At minimum, record for every candidate pair: candidate IDs; criteria; comparable evidence/measurements; hard-gate results; wins/losses/ties/incomparables by dimension; confounders; unresolved questions; and conclusion. Link raw results and test artifacts where possible.

## 8. Promotion

Implementation only follows a recorded selected candidate. Afterwards, compare the actual implementation against the incumbent baseline and rerun regression/contract/security/integration tests. A design-stage winner is not a verified implementation until the applicable gates pass. Update the decision record and repository mappings after results are known.
