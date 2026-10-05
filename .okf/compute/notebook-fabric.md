# ShortForge Notebook Render Fabric

Status: implementation wave — 2026-10-03.

## Boundary

Notebook providers in ShortForge are rendering backends. They may use provider-native notebook/runtime infrastructure, but every successful render must terminate in a physical artifact that can be independently verified by F07.

~~~text
Notebook Registry
      |
      v
provider runtime
      |
      v
render execution
      |
      v
physical artifact
      |
      v
CAS -> F07
~~~

A notebook provider is never considered production-render eligible merely because a runtime can be created or code can be executed.

## Canonical provider matrix

| Provider | Runtime kind | GPU | Provision | Code execution | Persistence | Production worker |
|---|---|---:|---:|---:|---:|---:|
| Kaggle | Kaggle Kernel | yes | yes | yes | no | no |
| Colab | Colab Runtime | yes | yes* | yes | no | no |
| Paperspace | Machine-backed notebook | yes | yes | no | yes | no |
| Lightning | Studio | yes | yes | yes | yes | no |
| HF ZeroGPU | Gradio Space function | yes | no | yes | no | no |

* Colab runtime API access is beta/allowlisted.

## Routing

NotebookRouter applies capability constraints before selection. Under the strict no-card policy, only NO_CARD_STATED is admitted; NO_CARD_NOT_ESTABLISHED is excluded rather than guessed.

## Truthfulness rules

- No-card classification is evidence-based. The model distinguishes NO_CARD_STATED from NO_CARD_NOT_ESTABLISHED.
- Free is not the same thing as persistent or production-capable.
- Colab is a rendering backend only; it is not automatically admitted as an F06 production worker.
- ZeroGPU is not modeled as a notebook VM; it is shared GPU function execution inside a Hugging Face Space.
- Paperspace uses the current v1 machine control API, not the retired legacy notebook API.
- Physical-artifact verification recomputes SHA-256 and byte length outside the provider before F07 acceptance.
- The notebook plane does not own F07 release truth.

## Kaggle

The adapter uses the official Kaggle kernels push/status/output/delete lifecycle. The latest live proof verified real hosted execution, physical MP4 retrieval, and local SHA-256/byte-length verification. Kaggle remains productionWorkerEligible=false by design.

## Colab

The adapter uses the allowlisted Colab Runtime API plus the managed runtime's standard Jupyter interface. Google documents the managed runtime as a Jupyter server and returns short-lived connection metadata containing a URL, proxy token, and expiry; the adapter keeps that runtime proxy credential in process memory only.

The render path is bounded and artifact-first:

1. authenticate using an explicit Colab access token or Google Application Default Credentials;
2. query runtimespecs and select an eligible runtime spec, such as T4;
3. create the managed runtime and poll the long-running operation;
4. obtain fresh runtime connection metadata;
5. execute the bounded render command through the Jupyter kernel WebSocket;
6. retrieve the physical output from the Jupyter file endpoint;
7. recompute SHA-256 and byte length locally, and validate the MP4 container signature;
8. terminate the runtime created by the operation.

No synthetic execution success is emitted when Jupyter execution or artifact retrieval fails. Colab remains productionWorkerEligible=false until the separate F06 worker-admission contract is independently satisfied.

## Lightning

The adapter invokes the installed lightning-sdk package and supports the documented Studio start/run/stop lifecycle. The latest live CI proof verified authenticated Studio lifecycle and deterministic code execution. Physical MP4 transfer into ShortForge CAS is still a separate bridge, so the Lightning rendering lane is not yet physically closed.

## Hugging Face ZeroGPU

ZeroGPU executes GPU-decorated functions inside a Gradio Space through the Space API queue. It has no generic VM lifecycle and therefore no provision/terminate semantics in this adapter.

## Promotion gate

Future notebook-to-worker promotion must independently satisfy:

1. authenticated control;
2. capability match;
3. service-policy compatibility;
4. worker bootstrap identity;
5. heartbeat, lease, and fencing;
6. artifact upload;
7. independent SHA-256 and byte-length verification;
8. F07 acceptance.

No notebook adapter may self-promote to worker status.


## HF ZeroGPU live qualification gate

The HF ZeroGPU adapter now follows the real private Space contract:
1. validate the authenticated Gradio Space info endpoint and configured named route;
2. submit the documented zero-input Gradio function call;
3. consume the completed SSE event;
4. resolve the returned FileData artifact;
5. download the artifact with the authenticated Space file header;
6. recompute SHA-256 and byte length in ShortForge;
7. hand the physical artifact to the independent CAS/F07 verification path.

Operator proof on 2026-10-04 established the hosted GPU and authenticated artifact retrieval path. Repository qualification completed on GitHub Actions run 37215052417 with independent media probe, CAS integrity, F07 physical verification, and signed receipt verification. HF ZeroGPU remains `productionWorkerEligible=false`.


### HF ZeroGPU qualification result — 2026-10-04

The repository-side live proof is **REAL-SMOKE-VERIFIED**. ShortForge itself authenticated the private Space, invoked the real zero-input `/render` endpoint, downloaded the resulting MP4, recomputed its digest/byte length, independently probed the media, stored the bytes in CAS, and passed the F07 physical + signed receipt boundary.

GitHub Actions run: `37215052417`  
Artifact: `hf-zerogpu-f07-evidence` / ID `11308620102`  
SHA-256: `788664813bde46040ab1c15d3f83d745074575707061ab88c8d38deffae6b34d`  
Byte length: `277495`  
F07 receipt: `rcpt_live_hf_zerogpu_muu0d83o_2026-10-04T160122706Z`

The live proof workflow is manual-only after qualification to prevent ordinary PR synchronization from consuming ZeroGPU quota. No F06 worker promotion is granted.


## Kaggle + Wan Dual-T4 renderer — reference integration

ShortForge now contains a repository-owned Kaggle renderer template at `tools/kaggle/shortforge-wan-dual-t4/`. It is derived from engineering patterns observed in current public Kaggle/Wan examples, not from a community notebook dependency.

The renderer has three explicit profiles:
- `PROOF`: deterministic GPU-backed MP4 generation with no model download.
- `WAN_T2V_1_3B`: lower-risk model-backed Wan 2.1 text-to-video smoke.
- `WAN_DUAL_T4_14B`: explicit two-T4 experiment for `Wan-AI/Wan2.1-T2V-14B-Diffusers`.

The public Wan Dual-T4 reference uses runtime hardware detection and selects a 14B path only when two T4 GPUs are present. Current Hugging Face Diffusers documentation supports `device_map="balanced"` to distribute pipeline components across multiple GPUs, which ShortForge uses for the dual-T4 model-backed path. This does not constitute a live feasibility claim; the 14B path must pass an explicit Kaggle run before qualification.

The first live proof should use `PROOF` to validate the ShortForge-owned kernel packaging and T4 x2 hardware contract. Model-backed runs are manual-only and quota-aware.

All successful Kaggle renders remain subject to the existing physical-artifact gate: download -> SHA-256/byte length -> independent media probe -> CAS -> F07. Kaggle remains `productionWorkerEligible=false`.
