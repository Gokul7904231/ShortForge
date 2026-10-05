"""
Deterministic lowering helpers for editor CompositionIR features.

This module is renderer-owned execution logic, not an editor authority.
Every operation is pure with respect to a frame: the same input frame,
feature graph, and media time produce the same output pixels.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _numeric(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _bezier_coord(t: float, p1: float, p2: float) -> float:
    u = 1.0 - t
    return (3 * u * u * t * p1) + (3 * u * t * t * p2) + (t * t * t)


def _bezier_ease(progress: float, out_handle: Optional[Mapping[str, Any]], in_handle: Optional[Mapping[str, Any]]) -> float:
    if not out_handle or not in_handle:
        return progress
    x1 = _clamp(_numeric(out_handle.get("x"), 0.0), 0.0, 1.0)
    y1 = _numeric(out_handle.get("y"), 0.0)
    x2 = _clamp(_numeric(in_handle.get("x"), 1.0), 0.0, 1.0)
    y2 = _numeric(in_handle.get("y"), 1.0)

    lo, hi = 0.0, 1.0
    for _ in range(32):
        mid = (lo + hi) / 2.0
        x = _bezier_coord(mid, x1, x2)
        if x < progress:
            lo = mid
        else:
            hi = mid
    return _bezier_coord((lo + hi) / 2.0, y1, y2)


def evaluate_keyframes(
    keyframes: Sequence[Mapping[str, Any]],
    time_seconds: float,
    default: float,
) -> float:
    if not keyframes:
        return default

    ordered = sorted(keyframes, key=lambda item: _numeric(item.get("timeSeconds"), 0.0))
    t = max(0.0, time_seconds)
    first = ordered[0]
    last = ordered[-1]

    first_time = _numeric(first.get("timeSeconds"), 0.0)
    last_time = _numeric(last.get("timeSeconds"), first_time)
    if t <= first_time:
        return _numeric(first.get("value"), default)
    if t >= last_time:
        return _numeric(last.get("value"), default)

    for left, right in zip(ordered, ordered[1:]):
        lt = _numeric(left.get("timeSeconds"), 0.0)
        rt = _numeric(right.get("timeSeconds"), lt)
        if lt <= t <= rt:
            lv = _numeric(left.get("value"), default)
            rv = _numeric(right.get("value"), lv)
            span = max(1e-9, rt - lt)
            progress = _clamp((t - lt) / span, 0.0, 1.0)
            interpolation = str(left.get("interpolation", "LINEAR")).upper()
            if interpolation == "HOLD":
                return lv
            if interpolation == "BEZIER":
                progress = _bezier_ease(
                    progress,
                    left.get("outHandle"),
                    right.get("inHandle"),
                )
            return lv + (rv - lv) * progress

    return _numeric(last.get("value"), default)


def evaluate_animation_tracks(
    tracks: Iterable[Mapping[str, Any]],
    time_seconds: float,
    defaults: Optional[Mapping[str, float]] = None,
) -> Dict[str, float]:
    values: Dict[str, float] = dict(defaults or {})
    for track in tracks:
        prop = str(track.get("property", ""))
        if not prop:
            continue
        default = _numeric(values.get(prop), 0.0)
        values[prop] = evaluate_keyframes(
            track.get("keyframes", []),
            time_seconds,
            default,
        )
    return values


def _parse_color(value: Any, fallback: Tuple[int, int, int]) -> Tuple[int, int, int]:
    if isinstance(value, (list, tuple)) and len(value) >= 3:
        return tuple(int(_clamp(_numeric(v), 0, 255)) for v in value[:3])  # type: ignore[return-value]
    if isinstance(value, str):
        text = value.strip().lstrip("#")
        if len(text) == 3:
            text = "".join(ch * 2 for ch in text)
        if len(text) >= 6:
            try:
                return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
            except ValueError:
                pass
    return fallback


def create_background(
    width: int,
    height: int,
    background: Mapping[str, Any],
) -> Image.Image:
    kind = str(background.get("kind", "SOLID")).upper()
    value = background.get("value")

    if kind == "GRADIENT":
        if isinstance(value, Mapping):
            start = _parse_color(value.get("start"), (15, 23, 42))
            end = _parse_color(value.get("end"), (30, 41, 59))
            direction = str(value.get("direction", "VERTICAL")).upper()
        else:
            start = (15, 23, 42)
            end = (30, 41, 59)
            direction = "VERTICAL"
        img = Image.new("RGBA", (width, height))
        draw = ImageDraw.Draw(img)
        for i in range(height if direction == "VERTICAL" else width):
            ratio = i / max(1, (height if direction == "VERTICAL" else width) - 1)
            color = tuple(
                int(start[j] * (1.0 - ratio) + end[j] * ratio)
                for j in range(3)
            ) + (255,)
            if direction == "VERTICAL":
                draw.line([(0, i), (width, i)], fill=color)
            else:
                draw.line([(i, 0), (i, height)], fill=color)
        return img

    if kind == "BLUR":
        base = Image.new("RGBA", (width, height), _parse_color(value, (15, 23, 42)) + (255,))
        return base.filter(ImageFilter.GaussianBlur(radius=max(0.0, _numeric(background.get("radius"), 18.0))))

    return Image.new("RGBA", (width, height), _parse_color(value, (15, 23, 42)) + (255,))


def apply_effects(
    image: Image.Image,
    effects: Iterable[Mapping[str, Any]],
    time_seconds: float,
) -> Image.Image:
    result = image.convert("RGBA")
    for effect in effects:
        if effect.get("enabled") is False:
            continue
        kind = str(effect.get("kind", "")).upper()
        params = dict(effect.get("params") or {})
        animated = evaluate_animation_tracks(
            effect.get("animations") or [],
            time_seconds,
            defaults={k: _numeric(v) for k, v in params.items() if isinstance(v, (int, float))},
        )
        params.update(animated)

        if kind in {"BRIGHTNESS", "BRIGHTNESS_ADJUST"}:
            result = ImageEnhance.Brightness(result).enhance(max(0.0, _numeric(params.get("amount"), 1.0)))
        elif kind in {"CONTRAST", "CONTRAST_ADJUST"}:
            result = ImageEnhance.Contrast(result).enhance(max(0.0, _numeric(params.get("amount"), 1.0)))
        elif kind in {"SATURATION", "SATURATE"}:
            result = ImageEnhance.Color(result).enhance(max(0.0, _numeric(params.get("amount"), 1.0)))
        elif kind in {"GRAYSCALE", "GRAYSCALE_MIX"}:
            amount = _clamp(_numeric(params.get("amount"), 1.0), 0.0, 1.0)
            gray = ImageOps.grayscale(result).convert("RGBA")
            result = Image.blend(result, gray, amount)
        elif kind in {"BLUR", "GAUSSIAN_BLUR"}:
            result = result.filter(ImageFilter.GaussianBlur(max(0.0, _numeric(params.get("radius"), 4.0))))
        elif kind in {"SHARPEN"}:
            result = result.filter(ImageFilter.UnsharpMask(radius=max(0.0, _numeric(params.get("radius"), 2.0)), percent=int(_clamp(_numeric(params.get("percent"), 150.0), 0, 500))))
        elif kind in {"INVERT", "NEGATIVE"}:
            alpha = result.getchannel("A")
            result = ImageOps.invert(result.convert("RGB")).convert("RGBA")
            result.putalpha(alpha)
        elif kind in {"SEPIA"}:
            amount = _clamp(_numeric(params.get("amount"), 1.0), 0.0, 1.0)
            gray = ImageOps.grayscale(result)
            sepia = ImageOps.colorize(gray, black="#2d1f16", white="#d9b37c").convert("RGBA")
            result = Image.blend(result, sepia, amount)

    return result


def _shape_mask(
    size: Tuple[int, int],
    kind: str,
    x: float,
    y: float,
    width: float,
    height: float,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    box = [x, y, x + width, y + height]
    cx, cy = x + width / 2.0, y + height / 2.0

    if kind == "ELLIPSE":
        draw.ellipse(box, fill=255)
    elif kind == "DIAMOND":
        draw.polygon([(cx, y), (x + width, cy), (cx, y + height), (x, cy)], fill=255)
    elif kind == "STAR":
        points = []
        for i in range(10):
            radius = width / 2.0 if i % 2 == 0 else width / 4.0
            angle = -math.pi / 2 + i * math.pi / 5
            points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius * (height / max(width, 1.0))))
        draw.polygon(points, fill=255)
    elif kind == "HEART":
        points = []
        for i in range(101):
            t = math.pi * 2 * i / 100
            hx = 16 * math.sin(t) ** 3
            hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            points.append((cx + hx * width / 34.0, cy - hy * height / 28.0))
        draw.polygon(points, fill=255)
    elif kind == "SPLIT":
        draw.rectangle([x, y, x + width / 2.0, y + height], fill=255)
    elif kind == "CINEMATIC_BARS":
        bar = max(0.0, height * 0.12)
        draw.rectangle([x, y, x + width, y + bar], fill=255)
        draw.rectangle([x, y + height - bar, x + width, y + height], fill=255)
    else:
        draw.rectangle(box, fill=255)

    return mask


def apply_masks(
    image: Image.Image,
    masks: Iterable[Mapping[str, Any]],
    time_seconds: float,
) -> Image.Image:
    result = image.convert("RGBA")
    for mask in masks:
        kind = str(mask.get("kind", "RECTANGLE")).upper()
        animations = mask.get("animations") or []
        animated = evaluate_animation_tracks(
            animations,
            time_seconds,
            defaults={
                "x": _numeric(mask.get("x"), 0.0),
                "y": _numeric(mask.get("y"), 0.0),
                "width": _numeric(mask.get("width"), result.width),
                "height": _numeric(mask.get("height"), result.height),
                "rotationDeg": _numeric(mask.get("rotationDeg"), 0.0),
            },
        )
        x = animated.get("x", _numeric(mask.get("x"), 0.0))
        y = animated.get("y", _numeric(mask.get("y"), 0.0))
        width = max(1.0, animated.get("width", _numeric(mask.get("width"), result.width)))
        height = max(1.0, animated.get("height", _numeric(mask.get("height"), result.height)))
        rotation = animated.get("rotationDeg", _numeric(mask.get("rotationDeg"), 0.0))
        shape = _shape_mask(result.size, kind, x, y, width, height)
        if abs(rotation) > 0.001:
            shape = shape.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=False)
        feather = max(0.0, _numeric(mask.get("feather"), 0.0))
        if feather > 0:
            shape = shape.filter(ImageFilter.GaussianBlur(radius=feather))
        if mask.get("inverted"):
            shape = ImageOps.invert(shape)
        result.putalpha(ImageChops.multiply(result.getchannel("A"), shape))
    return result


def apply_transform(
    image: Image.Image,
    transform: Mapping[str, Any],
    animations: Iterable[Mapping[str, Any]],
    time_seconds: float,
) -> Image.Image:
    animated = evaluate_animation_tracks(
        animations,
        time_seconds,
        defaults={
            "x": _numeric(transform.get("x"), 0.0),
            "y": _numeric(transform.get("y"), 0.0),
            "scaleX": _numeric(transform.get("scaleX"), transform.get("scale", 1.0)),
            "scaleY": _numeric(transform.get("scaleY"), transform.get("scale", 1.0)),
            "rotationDeg": _numeric(transform.get("rotationDeg"), 0.0),
            "opacity": _numeric(transform.get("opacity"), 1.0),
        },
    )

    sx = max(0.01, animated.get("scaleX", 1.0))
    sy = max(0.01, animated.get("scaleY", 1.0))
    rotation = animated.get("rotationDeg", 0.0)
    opacity = _clamp(animated.get("opacity", 1.0), 0.0, 1.0)
    tx = animated.get("x", 0.0)
    ty = animated.get("y", 0.0)

    resized = image.resize(
        (max(1, int(round(image.width * sx))), max(1, int(round(image.height * sy)))),
        resample=Image.Resampling.LANCZOS,
    )
    if abs(rotation) > 0.001:
        resized = resized.rotate(rotation, resample=Image.Resampling.BICUBIC, expand=True)

    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    px = int(round((image.width - resized.width) / 2.0 + tx))
    py = int(round((image.height - resized.height) / 2.0 + ty))
    canvas.alpha_composite(resized, (px, py))
    if opacity < 0.999:
        alpha = canvas.getchannel("A").point(lambda a: int(a * opacity))
        canvas.putalpha(alpha)
    return canvas


def render_feature_stack(
    image: Image.Image,
    *,
    transform: Optional[Mapping[str, Any]] = None,
    animations: Optional[Iterable[Mapping[str, Any]]] = None,
    effects: Optional[Iterable[Mapping[str, Any]]] = None,
    masks: Optional[Iterable[Mapping[str, Any]]] = None,
    time_seconds: float = 0.0,
) -> Image.Image:
    result = image.convert("RGBA")
    result = apply_transform(result, transform or {}, animations or [], time_seconds)
    result = apply_effects(result, effects or [], time_seconds)
    result = apply_masks(result, masks or [], time_seconds)
    return result


def transition_mix(
    outgoing: Image.Image,
    incoming: Image.Image,
    kind: str,
    progress: float,
) -> Image.Image:
    p = _clamp(progress, 0.0, 1.0)
    mode = kind.upper()
    if mode in {"FADE", "DISSOLVE", "CROSSFADE"}:
        return Image.blend(outgoing.convert("RGBA"), incoming.convert("RGBA"), p)

    if mode in {"SLIDE_LEFT", "SLIDE_RIGHT", "SLIDE_UP", "SLIDE_DOWN"}:
        out_img = outgoing.convert("RGBA")
        in_img = incoming.convert("RGBA")
        dx = dy = 0
        if mode == "SLIDE_LEFT":
            dx = int(-incoming.width * p)
        elif mode == "SLIDE_RIGHT":
            dx = int(incoming.width * p)
        elif mode == "SLIDE_UP":
            dy = int(-incoming.height * p)
        else:
            dy = int(incoming.height * p)
        canvas = Image.new("RGBA", incoming.size, (0, 0, 0, 0))
        canvas.alpha_composite(out_img, (0, 0))
        canvas.alpha_composite(in_img, (dx + (incoming.width if mode == "SLIDE_LEFT" else -incoming.width if mode == "SLIDE_RIGHT" else 0), dy + (incoming.height if mode == "SLIDE_UP" else -incoming.height if mode == "SLIDE_DOWN" else 0)))
        # Move the outgoing frame away from center to complete the slide.
        if mode == "SLIDE_LEFT":
            canvas = Image.new("RGBA", incoming.size, (0, 0, 0, 0))
            canvas.alpha_composite(out_img, (int(-incoming.width * p), 0))
            canvas.alpha_composite(in_img, (int(incoming.width * (1.0 - p)), 0))
        elif mode == "SLIDE_RIGHT":
            canvas = Image.new("RGBA", incoming.size, (0, 0, 0, 0))
            canvas.alpha_composite(out_img, (int(incoming.width * p), 0))
            canvas.alpha_composite(in_img, (int(-incoming.width * (1.0 - p)), 0))
        elif mode == "SLIDE_UP":
            canvas = Image.new("RGBA", incoming.size, (0, 0, 0, 0))
            canvas.alpha_composite(out_img, (0, int(-incoming.height * p)))
            canvas.alpha_composite(in_img, (0, int(incoming.height * (1.0 - p))))
        elif mode == "SLIDE_DOWN":
            canvas = Image.new("RGBA", incoming.size, (0, 0, 0, 0))
            canvas.alpha_composite(out_img, (0, int(incoming.height * p)))
            canvas.alpha_composite(in_img, (0, int(-incoming.height * (1.0 - p))))
        return canvas

    if mode in {"WIPE_LEFT", "WIPE_RIGHT", "WIPE_UP", "WIPE_DOWN"}:
        result = outgoing.copy().convert("RGBA")
        reveal = Image.new("L", result.size, 0)
        draw = ImageDraw.Draw(reveal)
        if mode == "WIPE_LEFT":
            draw.rectangle([0, 0, int(result.width * p), result.height], fill=255)
        elif mode == "WIPE_RIGHT":
            draw.rectangle([int(result.width * (1 - p)), 0, result.width, result.height], fill=255)
        elif mode == "WIPE_UP":
            draw.rectangle([0, int(result.height * (1 - p)), result.width, result.height], fill=255)
        else:
            draw.rectangle([0, 0, result.width, int(result.height * p)], fill=255)
        incoming_rgba = incoming.convert("RGBA")
        result.alpha_composite(Image.composite(incoming_rgba, Image.new("RGBA", result.size, (0, 0, 0, 0)), reveal))
        return result

    return Image.blend(outgoing.convert("RGBA"), incoming.convert("RGBA"), p)
