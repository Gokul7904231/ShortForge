# Project Ascalon — Current Training-Data Readiness Verification

**Date:** 2026-09-27
**Scope:** evidence-driven trajectory generation readiness; model-weight training was not executed.

## Result

**STATUS: READY_FOR_TRAINING_DATA_GENERATION_UNDER_PROPOSAL_LEARNING_ONLY**

This status applies to the reconciled current architecture on merged `main` commit `9c27c7e75652c2cc04ebe41d41eed299cc88ce91` and is based on fresh CI evidence. It does not authorize Ascalon to bypass Guardian, F07, leases/fencing, CAS, release authorization, or any production capability boundary.

## Canonical topology

F00 -> F01 -> F02 -> (F03 || F04) -> F05 -> F06 -> F07

## Reconciled floor identity

- F03: Visual Asset Realization & Blueprints
- F04: Media Synthesis & Provider Execution
- F05: Timeline Composition & Motion
- F06: Video GPU Rendering Engine
- F07: QA Gate & Social Compliance

## Training-safety invariants

- Claim <= Evidence.
- Provider/model claims do not replace physical evidence.
- Simulation/heuristic shadows are training-ineligible unless explicitly admitted as synthetic curriculum.
- Secret leakage blocks trajectory admission.
- Unknown capabilities/tools block trajectory admission.
- Guardian authorization remains distinct from model proposal.
- Ascalon can propose decisions and repairs but cannot self-authorize or self-certify release.
- Deterministic replayability remains required for authoritative trajectories.

## Fresh verification evidence

| Gate | Run | Result |
|---|---:|---|
| Team Change Gate | 36308757139 | PASS |
| Obsidian Memory Validation | 36308757110 | PASS |
| Google Drive MCP | 36308757132 | PASS |
| Floor 02 + Floor 03 Production Gates | 36308757144 | PASS |
| Floor 04 Production Validation | 36308757103 | PASS |
| Floor 05 Pre-Training Validation | 36308757119 | PASS |
| Floor 06 Pre-Training Validation | 36308757143 | PASS |
| Floor 07 Pre-Training Validation | 36308757101 | PASS |
| Repository CI | post-merge main run on 9c27c7e | PASS |

Repository Web Regression remains an informational lane and does not replace the dedicated admission evidence.

## Ascalon role

Ascalon may:
- propose template choices, temporal allocation, provider/capability selection, repair strategies, diagnoses, and architecture proposals;
- learn from verified proposal -> authorization -> execution -> measurement -> handoff trajectories.

Ascalon may not:
- bypass Guardian authorization;
- declare physical media success without evidence;
- mutate .okf law silently;
- promote a third-party provider/model automatically;
- become F07 release authority;
- change model weights as part of this verification wave.

## Model training status

No LLM weights were modified. No training job was dispatched. The system is ready to generate and benchmark training data subject to the normal trajectory validator and exporter gates.

## Mainline evidence closure

PR #40 (`feat/ascalon-cross-floor-reconciliation-20260927`) is merged. This document therefore supersedes PR-head-only wording and treats the merged `main` commit as the source reference. No model weights were trained or modified.
