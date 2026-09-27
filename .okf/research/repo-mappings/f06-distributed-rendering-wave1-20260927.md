# Floor 06 Distributed Rendering — Research & Adoption Ledger (2026-09-27)

External repositories and research are evidence sources only. Executable ShortForge contracts, Guardian policy, tests, CI evidence and .okf governance remain authoritative.

## Sources reviewed

| Source | Useful mechanism | ShortForge disposition |
|---|---|---|
| OpenCue | Render-farm task decomposition, resource tagging, queue/resource allocation and monitoring | ADOPTED AS BOUNDARY REFERENCE. Do not introduce OpenCue as a second scheduler. |
| Temporal | Durable workflow execution and event history | ADOPTED AS DURABILITY PATTERN ONLY. ShortForge keeps its own floor/Guardian authority rather than adding a second workflow engine. |
| Kueue | Explicit admission before scheduling, quota/resource accounting and fair sharing | ADOPTED AS ADMISSION DESIGN PATTERN. The current implementation records F06 admission evidence without importing Kubernetes/Kueue. |
| Ray | Hard resource requirements, labels and placement strategy/data-locality concepts | ADOPTED AS ROUTING PATTERN. F06 separates hard provider eligibility from soft utility ranking. |
| OpenTelemetry | Standardized traces, events and metric semantics around long-running work | ADOPTED AS OBSERVABILITY REFERENCE. Existing FabricEventJournal/telemetry remain the implementation authority. |
| FFmpeg / ffprobe | Physical decode, stream and container inspection | ADOPTED directly at the F06 physical artifact admission boundary. |

## Why these patterns do not replace ShortForge

ShortForge already has explicit authority layers, Guardian authorization, floor permissions, RenderFabric, ComputeRouter, CAS, worker fencing and F07 release verification. Replacing those with a general workflow/scheduler framework would create a second authority path and violate the .okf source-of-truth rule.

The safe assimilation rule is therefore:

`external pattern → typed internal contract → tests → production-helper evidence → promotion`

not:

`external repository → direct runtime adoption`

## Wave 1 implementation

1. F06 now has a provider-independent physical render verifier.
2. Provider completion is rejected unless the physical artifact's SHA-256 and byte length match.
3. ffprobe verifies MP4 container and requested video/audio stream metadata.
4. FFmpeg decoder smoke is a separate check from ffprobe.
5. ComputeRouter now treats provider availability as a hard admission condition.
6. F06 records a typed `RenderAdmissionRecord` containing the policy version, candidate set, rejection reasons, capability/health snapshot and selected provider.
7. A failed physical admission triggers bounded provider failover instead of accepting the provider claim.
8. F07 remains an independent release authority.

## F03 compatibility decision

The current F03 AssetPlanIR already carries the downstream semantics required for F05 composition and F06 execution identity. No additional F03 field was justified by this research wave.

This is deliberate architectural restraint: do not expand a semantic planning contract when the downstream need can be satisfied by the existing immutable F05 projection.

## Security notes

- Remote provider URIs are not physically verified directly; providers must stage bytes into an approved CAS/local path first.
- Symlink escapes are rejected.
- Artifact paths must remain inside approved storage roots.
- Provider-reported hashes are observations; F06 recomputes the physical digest.
- F07 repeats independent verification.
- Ascalon never receives provider secrets.

## Non-adoption

No source code, model weights, credentials, scheduler control plane, storage backend or license-bearing runtime component was copied from the external sources.
