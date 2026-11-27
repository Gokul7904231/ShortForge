import sys
from pathlib import Path

# Add core to sys.path
services_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(services_dir))

import pytest
from core.lexical import (
    measure_px,
    font_covers,
    syllables,
    predict_frames,
    validate_and_compile_scenes,
    PixelOverflowError,
    MIN_SCENE_FRAMES,
)

# Test font path (use any standard font or windows font)
FONT_PATH = "C:/Windows/Fonts/arial.ttf"
if not Path(FONT_PATH).exists():
    FONT_PATH = str(Path(__file__).resolve().parent.parent.parent.parent / ".agents" / "skills" / "design" / "2-layout" / "ui-styling" / "canvas-fonts" / "ArsenalSC-Regular.ttf")


def test_measure_px_measures_dimensions():
    w, h = measure_px("ShortForge FactoryOS", FONT_PATH, 42)
    assert w > 0
    assert h > 0
    # "WWWWWWWW" vs "iiiiiiii" pixel width discrepancy proof
    w_wide, _ = measure_px("WWWWWWWW", FONT_PATH, 42)
    w_thin, _ = measure_px("iiiiiiii", FONT_PATH, 42)
    assert w_wide > w_thin * 2  # Proves char counting is a false proxy!


def test_font_covers_catches_uncovered_glyphs():
    if Path(FONT_PATH).exists():
        # Test ascii coverage
        uncovered = font_covers("Hello World 123", FONT_PATH)
        assert len(uncovered) == 0

        # Test rare unicode / glyphs that standard latin font does not cover (e.g. archaic or cuneiform)
        uncovered_rare = font_covers("Ancient 𒀀 <ctrl42> symbol", FONT_PATH)
        assert len(uncovered_rare) > 0


def test_syllables_and_frame_prediction():
    assert syllables("cat") == 1
    assert syllables("factory") >= 2
    assert syllables("autonomous") >= 3

    # predict_frames returns integer frame counts
    frames = predict_frames("Welcome to the ShortForge automated factory line.")
    assert isinstance(frames, int)
    assert frames >= MIN_SCENE_FRAMES


def test_validate_and_compile_scenes_merges_short_scenes():
    raw_scenes = [
        {"scene_id": "sc1", "text": "Hi"},  # very short -> < 45 frames
        {"scene_id": "sc2", "text": "Welcome to FactoryOS production line."},
        {"scene_id": "sc3", "text": "This is a full-length concluding segment."},
    ]

    compiled = validate_and_compile_scenes(
        raw_scenes,
        font_path=FONT_PATH,
        font_size=42,
        max_px_width=1200,
        min_scene_frames=MIN_SCENE_FRAMES,
    )

    # sc1 and sc2 should have been deterministically merged!
    assert len(compiled) == 2
    assert "Hi Welcome to FactoryOS" in compiled[0].text
    assert compiled[0].predicted_frames >= MIN_SCENE_FRAMES
    assert compiled[0].measured_px[0] > 0
    assert compiled[0].syllable_count > 0


def test_validate_and_compile_scenes_rejects_overflow():
    raw_scenes = [
        {"scene_id": "sc_overflow", "text": "A" * 150},  # will blow past 864px
    ]
    with pytest.raises(PixelOverflowError):
        validate_and_compile_scenes(
            raw_scenes,
            font_path=FONT_PATH,
            font_size=42,
            max_px_width=500,
        )
