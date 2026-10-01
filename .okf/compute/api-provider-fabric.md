# ShortForge API Provider Fabric

Status: IMPLEMENTATION TRACK — API-ONLY / WORKER-PLANE EXCLUDED

Date: 2026-10-01

## Boundary

The provider API fabric is responsible only for cloud-resource control:

- credentials/auth validation;
- account context and provider quota where the provider exposes it;
- live/dynamic offer discovery;
- resource provisioning;
- resource state observation;
- idempotency and ambiguous-outcome reconciliation;
- provider rate-limit/error normalization;
- lifecycle termination;
- API render-probe capability classification.

It does not execute the ShortForge worker, own rendering state, store the production artifact, or certify F07.

## Provider set

| Provider | API version / boundary | Discovery | Provision | Render launch via provider API | Physical render proof without worker plane |
|---|---|---|---|---|---|
| Vast.ai | REST v0 | Dynamic GPU marketplace | GPU instance | YES via `onstart` / container args | API log proof supported; independent artifact retrieval remains later |
| RunPod | REST v2 | GPU/datacenter catalog | Pod | YES via container `args` | API log proof supported; independent artifact retrieval remains later |
| Daytona | current REST + Toolbox API | GPU sandbox types | Sandbox | YES | YES, API command execution + remote SHA/ffprobe evidence |
| Paperspace | REST v1 | machine availability | Machine | YES via startup script | NOT CLAIMED |
| Modal | JS SDK 0.11.x | Resource request | Sandbox | YES | YES, SDK exec/filesystem/stdout allow direct verification |

## Verification taxonomy

### CONTROL_PLANE_VERIFIED

Credential/authentication, provider reachability and documented lifecycle operations were observed against the provider API.

### RENDER_LAUNCH_VERIFIED

The live provider API accepted a GPU resource request and attached the supplied render command to the provider execution mechanism (for example Vast `onstart`, RunPod Pod `args`, or Paperspace startup script).

This proves API-driven launch capability, not successful artifact creation.

### PHYSICAL_RENDER_VERIFIED

A provider API/SDK directly executed the render process and made sufficient artifact evidence available to the test harness to establish a non-empty artifact, digest and media probe without a ShortForge worker.

Current API-only direct physical-render evidence paths are Vast.ai, RunPod v2, Daytona, and Modal. Paperspace remains launch-verified because this adapter does not yet have a documented, portable API path to inspect the running machine's output.

## Why this distinction exists

Vast.ai and RunPod v2 expose provider-side logs that can carry a self-verifying render marker, so the API harness can prove that the remote command produced a non-empty file and report SHA-256/size/media metadata. This remains provider-side evidence rather than the independent control-plane artifact download/re-hash required by the later F06/CAS boundary. Paperspace currently remains launch-only in this API-only phase.

A later worker-plane adapter can use the resource returned by this API fabric (SSH, exposed port, or worker endpoint) without changing the control contracts.

## Current official documentation anchors

- Vast.ai REST API: https://docs.vast.ai/api-reference/introduction
- Vast.ai instance creation: https://docs.vast.ai/api-reference/instances/create-instance
- RunPod REST API v2: https://docs.runpod.io/api-reference-v2/overview
- RunPod v2 create Pod: https://docs.runpod.io/api-reference-v2/create-pod
- RunPod v2 delete Pod: https://docs.runpod.io/api-reference-v2/delete-pod
- Daytona GPU Sandboxes: https://www.daytona.io/docs/en/sandboxes/
- Paperspace REST API: https://docs.paperspace.com/api-reference/
- Paperspace Machines: https://docs.paperspace.com/api-reference/machines/
- Paperspace Startup Scripts: https://docs.paperspace.com/api-reference/startup-scripts/
- Modal JS Sandbox API: https://modal.com/docs/sdk/js/latest/Sandbox
- Modal JS SDK releases: https://modal.com/docs/sdk/js/releases

## Research-derived design references

SkyPilot demonstrates heterogeneous provider normalization; dstack explicitly distinguishes online GPU marketplace offers from offline/static catalogs and has dedicated RunPod/Vast.ai backends; Kueue demonstrates admission/resource-class separation; Crossplane demonstrates desired-state reconciliation.

These are architectural references only. ShortForge retains ComputeRouter as its single scheduling authority and does not add a second scheduler/workflow engine.
