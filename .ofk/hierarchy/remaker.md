# Hierarchy: The ReMaker Engine (`ReMakerEngine.ts`)

> **Tier**: Asset Reconstruction & Repair (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide ReMaker Engine  
> **Location**: `apps/web/factoryos/core/remaker/`  

---

## 1. Responsibilities

The ReMaker specializes in surgical artifact repair when media outputs fail quality, format, or compliance checks at Floor 07:

1. **Recipe Preservation**: Preserves the exact composition blueprint (timeline JSON, audio tracks, subtitle offsets, scene durations) created during Floors 01–05.
2. **Targeted Sub-task Re-execution**: Re-renders only the corrupted or desynced segments (e.g. regenerating misaligned subtitles or re-encoding audio tracks) without triggering costly full-pipeline regenerations.
3. **Codec & Format Normalization**: Corrects pixel format flags, audio sample rates, and aspect ratios if third-party encoders produce non-compliant MP4 containers.
