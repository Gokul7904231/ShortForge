# ShortForge Notebook & Interactive Compute Fabric

Status: implementation wave — 2026-10-01.

## Boundary

Notebook runtimes are an execution and experimentation substrate, not an implicit F06 worker fleet.

~~~text
Notebook Registry
      |
      v
provider notebook/runtime
      |
      v
optional future worker bootstrap
      |
      v
F06 worker admission
      |
      v
physical artifact -> CAS -> F07
~~~

A notebook provider is never considered production-render eligible merely because a runtime can be created.

## Canonical provider matrix

| Provider | Runtime kind | GPU | Provision | Code execution | Persistence | Production worker |
|---|---|---:|---:|---:|---:|---:|
| Kaggle | Kaggle Kernel | yes | yes | yes | no | no |
| Colab | Colab Runtime | yes | yes* | no | no | no |
| Paperspace | Machine-backed notebook | yes | yes | no | yes | no |
| Lightning | Studio | yes | yes | yes | yes | no |
| HF ZeroGPU | Gradio Space function | yes | no | yes | no | no |

* Colab runtime API access is beta/allowlisted.

## Truthfulness rules

- No-card classification is evidence-based. The model distinguishes NO_CARD_STATED from NO_CARD_NOT_ESTABLISHED.
- Free is not the same thing as persistent or production-capable.
- Colab free managed runtimes are not used as hidden distributed workers.
- ZeroGPU is not modeled as a notebook VM; it is shared GPU function execution inside a Hugging Face Space.
- Paperspace uses the current v1 machine control API, not the retired legacy notebook API.
- Kaggle physical artifact verification recomputes SHA-256 and byte length locally after output download.
- The notebook plane does not own F07 release truth.

## Kaggle

The adapter uses the official Kaggle kernels push/status/output/delete lifecycle. The repository also retains the real Python controller under services/compute/kaggle-controller/. The TypeScript adapter mirrors that controller's physical-output verification semantics.

## Colab

The adapter exposes beta runtime control: validate, create, poll the long-running operation, read runtime connection metadata, and terminate. It deliberately does not invent a generic remote code execution API.

## Paperspace

Paperspace is modeled as a machine-backed notebook. The current API provides machine lifecycle and startup-script controls. The adapter does not invent portable command/log/file readback behavior.

## Lightning

The adapter invokes the installed lightning-sdk package and supports the documented Studio start/run/stop lifecycle. Artifact transfer into ShortForge CAS is a separate bridge.

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
