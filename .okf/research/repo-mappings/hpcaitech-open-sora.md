# Repo Mapping — Open-Sora

**Repository:** https://github.com/hpcaitech/Open-Sora  
**License:** Apache-2.0  
**Role:** Temporal-generation metadata reference.

## F03-relevant findings
Open-Sora exposes generation aspect ratio and frame-count controls as explicit inputs.

## ShortForge mapping
F03's temporal plan and existing platform aspect-ratio/resolution fields are the semantic place for such metadata when supplied upstream. Execution-specific sampling values remain downstream.

## Boundary
No Open-Sora model/runtime code is embedded in F03.
