# Repo Mapping — ComfyUI

**Repository:** https://github.com/Comfy-Org/ComfyUI  
**License:** GPL-3.0  
**Role:** Clean-room architecture reference for declarative media workflows.

## F03-relevant findings
ComfyUI represents media generation as reusable node/subgraph workflows and supports asynchronous queueing and partial graph re-execution. The repository notes that unchanged graph regions can be skipped and only changed/dependent regions executed.

## ShortForge mapping
F03 keeps the semantic workflow declarative through AssetPlanIR. Dependency edges and impact_radius describe what downstream execution may need to rebuild, while provider workflow graphs remain outside F03.

## Boundary
No ComfyUI code, workflow JSON, node implementation, or GPL dependency is imported into F03.
