#!/usr/bin/env python3
"""
P3 Preflight Lexical & Safe-Area Budget Gate (<50ms)
====================================================
Uses bundled pinned hashed fonts from assets/fonts/toolchain_manifest.json.
Strips/rejects uncovered glyphs (never renders tofu), enforces safe-area
margins (top >= 160, bottom <= 1600, right <= 960), and fails closed on overflow.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from fontTools.ttLib import TTFont
from PIL import ImageFont

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
MANIFEST_PATH = FONTS_DIR / "toolchain_manifest.json"
DEFAULT_FONT_NAME = "Inter-ExtraBold.otf"

SAFE_LEFT = 60
SAFE_RIGHT = 960  # 1080 - 120
SAFE_TOP = 160
SAFE_BOTTOM = 1600  # 1920 - 320
MAX_BOX_WIDTH = SAFE_RIGHT - SAFE_LEFT  # 900px
MAX_BOX_HEIGHT = SAFE_BOTTOM - SAFE_TOP  # 1440px


class PreflightBudgetError(ValueError):
    """Typed violation raised when text or layout exceeds safe-area / lexical budget."""


@lru_cache(maxsize=4)
def get_pinned_font_path(font_name: str = DEFAULT_FONT_NAME) -> Path:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Pinned font manifest missing: {MANIFEST_PATH}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entry = manifest.get("fonts", {}).get(font_name)
    if not entry:
        raise KeyError(f"Font '{font_name}' not pinned in {MANIFEST_PATH}")
    font_path = FONTS_DIR / font_name
    if not font_path.exists():
        raise FileNotFoundError(f"Pinned font file missing: {font_path}")
    actual_sha = hashlib.sha256(font_path.read_bytes()).hexdigest()
    if actual_sha != entry["sha256"]:
        raise RuntimeError(f"Pinned font SHA-256 mismatch for {font_name}: {actual_sha} != {entry['sha256']}")
    return font_path


@lru_cache(maxsize=16)
def _load_cmap(font_path_str: str) -> set[int]:
    font_name = Path(font_path_str).name
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        cached = manifest.get("cmaps", {}).get(font_name)
        if isinstance(cached, list):
            return set(cached)
    tt = TTFont(font_path_str)
    cmap = tt.getBestCmap() or {}
    return set(cmap.keys())

@lru_cache(maxsize=32)
def _load_pil_font(font_path_str: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path_str, size)


# Warm default font + cmap at module load so run_preflight_budget stays <50ms even on first call.
try:
    _warm_fp = get_pinned_font_path(DEFAULT_FONT_NAME)
    _load_cmap(str(_warm_fp))
    _load_pil_font(str(_warm_fp), 56)
except Exception:
    pass


def strip_uncovered_glyphs(text: str, font_path: Optional[Path] = None) -> str:
    """Remove any codepoints not present in the pinned font's cmap (zero tofu)."""
    fp = font_path or get_pinned_font_path()
    cmap = _load_cmap(str(fp))
    out_chars = []
    for ch in text:
        if ch in ("\n", "\r", "\t", " ") or ord(ch) in cmap:
            out_chars.append(ch)
    return " ".join("".join(out_chars).split())


def wrap_lines_pixel_exact(
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width_px: int,
) -> List[str]:
    words = text.split()
    if not words:
        return []
    lines: List[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        bbox = font.getbbox(candidate)
        if (bbox[2] - bbox[0]) <= max_width_px:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def run_preflight_budget(
    scenes: List[Dict[str, Any]],
    *,
    font_name: str = DEFAULT_FONT_NAME,
    font_size: int = 56,
    max_lines: int = 6,
    max_width_px: int = MAX_BOX_WIDTH,
) -> List[Dict[str, Any]]:
    """Validate all scenes against pixel/grapheme/safe-area budgets in <50ms."""
    fp = get_pinned_font_path(font_name)
    font = _load_pil_font(str(fp), font_size)
    validated: List[Dict[str, Any]] = []

    for idx, scene in enumerate(scenes):
        raw_text = str(scene.get("text", ""))
        clean_text = strip_uncovered_glyphs(raw_text, fp)
        lines = wrap_lines_pixel_exact(clean_text, font, max_width_px)

        if len(lines) > max_lines:
            raise PreflightBudgetError(
                f"Scene {idx + 1} exceeds lexical line budget: {len(lines)} lines > max {max_lines} at {font_size}px"
            )
        for line in lines:
            bbox = font.getbbox(line)
            w = bbox[2] - bbox[0]
            if w > max_width_px:
                raise PreflightBudgetError(
                    f"Scene {idx + 1} single word/line width {w}px exceeds safe box {max_width_px}px"
                )
        line_height = int(font_size * 1.35)
        total_height = len(lines) * line_height
        if total_height > MAX_BOX_HEIGHT:
            raise PreflightBudgetError(
                f"Scene {idx + 1} height {total_height}px exceeds safe vertical band {MAX_BOX_HEIGHT}px"
            )

        item = dict(scene)
        item["rendered_text"] = clean_text
        item["wrapped_lines"] = lines
        item["font_path"] = str(fp)
        validated.append(item)

    return validated
