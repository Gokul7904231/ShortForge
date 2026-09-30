# Comms Fabric Research Mapping — 2026-09-30

## Repositories studied

- NVIDIA/OpenShell
- averygan/reclip
- VectifyAI/PageIndex
- rakyll/hey
- elastic/elasticsearch
- FxEmbed/FxEmbed
- max-sixty/worktrunk
- ahujasid/mcp-for-blender
- ShortForge current Comms/SituationRecord/EventBus surfaces

## Adopt / adapt / reject

| Source | Pattern | FactoryOS action |
|---|---|---|
| OpenShell | Gateway/supervisor split, authenticated long-lived session, multiplexed relay/control, capability declaration, last-known-good configuration | ADOPT |
| MCP for Blender | Simple typed JSON command/response, persistent connection, protocol handshake and capability reporting | ADAPT + HARDEN |
| Elasticsearch | Explicit request/response/task/listener, node transport and coordination semantics | ADAPT |
| Worktrunk | Parallel-agent context, lifecycle hooks, isolated work execution context | ADAPT |
| PageIndex | Structured tree/context and traceable references | ADAPT |
| hey | Concurrency, rate limiting, duration/timeout, CSV observability | ADAPT for comms load testing |
| ReClip | Deduplication and lightweight adapter boundary | ADAPT |
| FxEmbed | Lightweight edge adapter deployment boundary | ADAPT |
| Generic LLM comms papers | Layered protocol: transport + syntax + semantics; schema/interaction state/discovery | ADOPT |

## Rejected shortcuts

- Do not replace DurableEventBus with a new bus simply to add protocol semantics.
- Do not make free-text the canonical communication contract.
- Do not treat successful delivery as successful execution.
- Do not let Ascalon/LLM reasoning mutate comms authority.
- Do not create a second authoritative state database for communication.
