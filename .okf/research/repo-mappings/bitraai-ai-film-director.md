# Repo Mapping — ai-film-director

**Repository:** https://github.com/BitraAI/ai-film-director  
**License:** No SPDX license declared in GitHub repository metadata.  
**Role:** Stage-schema and adapter-boundary reference.

## F03-relevant findings
The pipeline uses explicit stage artifacts, stable IDs and continuity checks, with provider workflow execution separated from the planning stages.

## ShortForge mapping
AssetPlanIR remains a stable typed stage artifact. Provider/model selection stays out of the contract.

## Boundary
No third-party stage schema or runtime implementation is copied into F03.
