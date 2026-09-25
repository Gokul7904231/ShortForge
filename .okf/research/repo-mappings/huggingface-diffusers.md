# Repo Mapping — Hugging Face Diffusers

**Repository:** https://github.com/huggingface/diffusers  
**License:** Apache-2.0  
**Role:** Modular video-conditioning reference.

## F03-relevant findings
Diffusers exposes first-frame and first/last-frame video conditioning plus explicit frame-count and image sizing inputs.

## ShortForge mapping
AssetPlanIR keeps first/last-frame semantics provider-neutral and represents temporal intent without embedding a model-specific pipeline API.

## Boundary
No Diffusers pipeline code or model-specific contract is imported into F03.
