#!/usr/bin/env python3
"""
P3 Pure Frame Generator (Rawvideo Pipe, Zero Per-Frame PNGs)
=============================================================
f(timeline, frame_index) -> 1080x1920x3 RGB24 bytes streamed to ffmpeg stdin.
"""

from __future__ import annotations

from typing import Tuple

from PIL import Image, ImageDraw

from core.preflight import SAFE_LEFT, SAFE_TOP, get_pinned_font_path, wrap_lines_pixel_exact, _load_pil_font

WIDTH = 1080
HEIGHT = 1920


def render_pil_frame_to_rgb24(img: Image.Image) -> bytes:
    """Normalize any PIL image to exact 1080x1920 RGB24 raw bytes."""
    if img.size != (WIDTH, HEIGHT):
        raise ValueError(f"Frame size must be {WIDTH}x{HEIGHT}, got {img.size}")
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img.tobytes()


def stream_solid_frames_to_ffmpeg(
    frame_index: int,
    *,
    total_frames: int,
    text: str = "",
    bg_rgb: Tuple[int, int, int] = (16, 24, 40),
) -> bytes:
    """Deterministic pure frame renderer inside the safe area (no unsafe-band text)."""
    _ = (frame_index, total_frames)
    img = Image.new("RGB", (WIDTH, HEIGHT), bg_rgb)
    if text:
        draw = ImageDraw.Draw(img)
        fp = get_pinned_font_path()
        font = _load_pil_font(str(fp), 52)
        lines = wrap_lines_pixel_exact(text, font, 840)
        y = max(SAFE_TOP + 80, (HEIGHT - len(lines) * 70) // 2)
        for line in lines:
            draw.text((SAFE_LEFT + 30, y), line, font=font, fill=(245, 247, 250))
            y += 70
    return img.tobytes()
