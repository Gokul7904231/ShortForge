# Seedance 2.0 Sequence Planning → Floor 03 Mapping

Source: https://github.com/Emily2040/seedance-2.0

Observed pattern:
- Plan the full sequence globally, but compile only the next unresolved clip.
- Scenes are re-anchor units; clip lineage carries continuity state, start/end state, references, and chain depth.
- Accepted observed state must replace planned state before continuation.

ShortForge mapping:
- Added ContinuityMode, chain_from_previous, start/end state hints, motion beats, typed reference uses, and bounded regeneration metadata to AssetPlanIR.
- F03 stores planning intent only; physical observed-state reconciliation remains downstream.

Not adopted:
- Provider-specific Seedance syntax.
- Seedance execution or continuation runtime.

Status: PATTERN_EXTRACTION
