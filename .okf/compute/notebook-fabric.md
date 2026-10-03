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
