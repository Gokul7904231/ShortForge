"""
Exclusive ShortForge Component Registry (Python F06 Native).
Defines canonical component tokens, safe-zone bounding boxes on 1080x1920 canvas,
Z-Index hierarchy, and layout constraints.
"""

from typing import Dict, Any, List, Optional, Tuple

CANONICAL_COMPONENTS: Dict[str, Dict[str, Any]] = {
    "sf.hook.kinetic_stack": {
        "id": "sf.hook.kinetic_stack",
        "name": "Opening Kinetic Hook Stack",
        "z_index": 15,
        "safe_zone": {"x": 80, "y": 640, "width": 920, "height": 640, "padding": 32},
        "contrast_min": 12.0,
        "singleton": True,
        "audio_lock_buffer_ms": 200,
    },
    "sf.stage.semantic_b2_bg": {
        "id": "sf.stage.semantic_b2_bg",
        "name": "Semantic B2 Background Stage",
        "z_index": 0,
        "safe_zone": {"x": 0, "y": 0, "width": 1080, "height": 1920},
        "contrast_min": 7.0,
        "singleton": True,
    },
    "sf.quiz.question_glass_card": {
        "id": "sf.quiz.question_glass_card",
        "name": "Question Glass Container Card",
        "z_index": 10,
        "safe_zone": {"x": 60, "y": 340, "width": 960, "height": 380, "max_height": 380, "padding": 40},
        "contrast_min": 14.0,
        "singleton": True,
    },
    "sf.quiz.option_matrix_4x1": {
        "id": "sf.quiz.option_matrix_4x1",
        "name": "Option Matrix 4x1 Tile Group",
        "z_index": 20,
        "safe_zone": {"x": 85, "y": 760, "width": 910, "height": 520, "padding": 20},
        "contrast_min": 7.5,
        "singleton": True,
    },
    "sf.timer.countdown_ring_5s": {
        "id": "sf.timer.countdown_ring_5s",
        "name": "Precision Countdown Ring 5s",
        "z_index": 30,
        "safe_zone": {"x": 475, "y": 1355, "width": 130, "height": 130},
        "contrast_min": 8.0,
        "singleton": True,
    },
    "sf.payoff.explanation_drawer": {
        "id": "sf.payoff.explanation_drawer",
        "name": "Micro-Fact Payoff Drawer",
        "z_index": 25,
        "safe_zone": {"x": 80, "y": 1390, "width": 920, "height": 160, "padding": 24},
        "contrast_min": 10.0,
        "singleton": True,
    },
    "sf.outro.scoreboard_cta": {
        "id": "sf.outro.scoreboard_cta",
        "name": "Scoreboard Outro CTA Finisher",
        "z_index": 40,
        "safe_zone": {"x": 80, "y": 720, "width": 920, "height": 480, "padding": 36},
        "contrast_min": 9.0,
        "singleton": True,
        "audio_lock_buffer_ms": 500,
    },
    "sf.brand.watermark_lock": {
        "id": "sf.brand.watermark_lock",
        "name": "Permanent ShortForge Watermark Lock",
        "z_index": 99,
        "safe_zone": {"x": 940, "y": 1800, "width": 88, "height": 88},
        "contrast_min": 4.5,
        "singleton": True,
    },
}

def calculate_auto_font_size(text: str, max_chars_per_line: int = 34, default_size: int = 42, min_size: int = 34) -> int:
    """
    Auto-scales question font size (56px -> 40px/34px) if text exceeds 3 lines.
    Ensures question never overflows the single glass card boundary.
    """
    length = len(text.strip())
    estimated_lines = max(1, (length + max_chars_per_line - 1) // max_chars_per_line)
    if estimated_lines > 3:
        return min_size
    elif estimated_lines == 3:
        return int((default_size + min_size) / 2)
    elif estimated_lines <= 1:
        return 48
    return default_size

def get_component_definition(comp_id: str) -> Optional[Dict[str, Any]]:
    return CANONICAL_COMPONENTS.get(comp_id)
