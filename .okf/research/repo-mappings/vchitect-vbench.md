# VBench → Floor 03 Mapping

Source: https://github.com/Vchitect/VBench
License: Apache-2.0

Observed pattern:
- Video-generation evaluation is multidimensional and includes technical, semantic, motion, human, physics and composition-oriented dimensions.
- VBench-2.0 extends evaluation toward more intrinsic faithfulness and complex capabilities.

ShortForge mapping:
- Quality evaluation belongs in Scene Quality Judge / downstream verification, not inside F03 planning.
- The research reinforces the existing planner-vs-critic separation: F03 can declare constraints and evidence, but must not self-assign a quality score as authority.

Status: EVALUATION_PATTERN
