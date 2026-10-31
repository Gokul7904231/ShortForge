"""
Pillow Native Frame Compositor for FactoryOS Render Engine.
Provides deterministic, high-performance rendering of 9:16 vertical shorts.
Respects 9:16 safe areas and renders typography, shapes, cards, background photos, and captions.
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
from typing import Dict, Any, List, Optional, Tuple

class NativeFrameCompositor:
    def __init__(self, width: int = 1080, height: int = 1920):
        self.width = width
        self.height = height
        self._font_cache: Dict[int, ImageFont.ImageFont] = {}

    def _get_font(self, size: int) -> ImageFont.ImageFont:
        if size not in self._font_cache:
            try:
                # Try standard sans-serif system fonts
                self._font_cache[size] = ImageFont.truetype("arial.ttf", size)
            except Exception:
                try:
                    self._font_cache[size] = ImageFont.truetype("DejaVuSans.ttf", size)
                except Exception:
                    self._font_cache[size] = ImageFont.load_default()
        return self._font_cache[size]

    def create_gradient_background(self, color1: Tuple[int, int, int], color2: Tuple[int, int, int]) -> Image.Image:
        """Create smooth vertical gradient background."""
        base = Image.new("RGBA", (self.width, self.height))
        draw = ImageDraw.Draw(base)
        for y in range(self.height):
            ratio = y / float(self.height)
            r = int(color1[0] * (1.0 - ratio) + color2[0] * ratio)
            g = int(color1[1] * (1.0 - ratio) + color2[1] * ratio)
            b = int(color1[2] * (1.0 - ratio) + color2[2] * ratio)
            draw.line([(0, y), (self.width, y)], fill=(r, g, b, 255))
        return base

    def render_frame(
        self,
        scene_props: Dict[str, Any],
        shot_recipe: str,
        shot_props: Dict[str, Any],
        progress: float,
        caption_text: str = "",
        highlight_word: str = "",
        safe_top: int = 160,
        safe_bottom: int = 320
    ) -> Image.Image:
        """
        Renders a complete RGBA frame deterministically based on normalized progress p in [0, 1].
        """
        has_background_photo = False
        img = None

        # Check for physical background image asset across scene and shot props
        img_path = (
            shot_props.get("image_path")
            or scene_props.get("image_path")
            or shot_props.get("imageRef")
            or shot_props.get("path")
            or scene_props.get("assetPath")
        )

        if img_path and not scene_props.get("transparent"):
            clean_path = str(img_path).replace("file://", "")
            if os.path.exists(clean_path):
                try:
                    raw_img = Image.open(clean_path).convert("RGBA")
                    # Full-bleed 1080x1920 cover crop
                    fitted = ImageOps.fit(raw_img, (self.width, self.height), Image.Resampling.LANCZOS)
                    # Apply dark contrast overlay (45% black) so white typography and cards are high-contrast and readable
                    scrim = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 115))
                    img = Image.alpha_composite(fitted, scrim)
                    has_background_photo = True
                except Exception:
                    img = None

        if img is None:
            if scene_props.get("transparent"):
                img = Image.new("RGBA", (self.width, self.height), (0, 0, 0, 0))
            elif scene_props.get("background"):
                background = scene_props["background"]
                kind = str(background.get("kind", "SOLID")).upper()
                value = background.get("value")
                if kind == "GRADIENT" and isinstance(value, dict):
                    def parse_color(raw: Any, fallback: Tuple[int, int, int]) -> Tuple[int, int, int]:
                        if isinstance(raw, str):
                            text = raw.strip().lstrip("#")
                            if len(text) == 3:
                                text = "".join(ch * 2 for ch in text)
                            if len(text) >= 6:
                                try:
                                    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
                                except ValueError:
                                    pass
                        return fallback
                    first = parse_color(value.get("start"), (15, 23, 42))
                    last = parse_color(value.get("end"), (30, 41, 59))
                    direction = str(value.get("direction", "VERTICAL")).upper()
                    if direction == "HORIZONTAL":
                        img = Image.new("RGBA", (self.width, self.height))
                        gradient_draw = ImageDraw.Draw(img)
                        for x in range(self.width):
                            ratio = x / float(max(1, self.width - 1))
                            rgb = tuple(int(first[i] * (1.0 - ratio) + last[i] * ratio) for i in range(3))
                            gradient_draw.line([(x, 0), (x, self.height)], fill=rgb + (255,))
                    else:
                        img = self.create_gradient_background(first, last)
                elif kind == "BLUR":
                    base = Image.new("RGBA", (self.width, self.height), (15, 23, 42, 255))
                    img = base.filter(ImageFilter.GaussianBlur(radius=float(background.get("radius", 18))))
                else:
                    raw = value if isinstance(value, str) else "#0f172a"
                    text = raw.strip().lstrip("#")
                    if len(text) == 3:
                        text = "".join(ch * 2 for ch in text)
                    try:
                        rgb = (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
                    except (ValueError, IndexError):
                        rgb = (15, 23, 42)
                    img = Image.new("RGBA", (self.width, self.height), rgb + (255,))
            else:
                bg_type = shot_props.get("background_type", "DARK_SLATE")
                if bg_type == "DEEP_INDIGO":
                    img = self.create_gradient_background((9, 10, 15), (20, 25, 45))
                elif bg_type == "AMBER_HISTORY":
                    img = self.create_gradient_background((28, 25, 23), (69, 26, 3))
                elif bg_type == "MONOCHROME":
                    img = self.create_gradient_background((5, 5, 5), (24, 24, 27))
                elif bg_type == "REDDIT_ORANGE":
                    img = self.create_gradient_background((3, 3, 3), (26, 26, 27))
                else:
                    img = self.create_gradient_background((15, 23, 42), (30, 41, 59))

        draw = ImageDraw.Draw(img)

        # Subtle ambient vignette glow only when no photograph is present
        if not has_background_photo and not scene_props.get("transparent"):
            orb_r = 280
            cx, cy = self.width // 2, self.height // 2
            draw.ellipse([cx - orb_r, cy - orb_r, cx + orb_r, cy + orb_r], fill=(30, 41, 59, 35))

        # Safe area bounds
        left_margin = 80
        right_margin = self.width - 80
        content_width = right_margin - left_margin

        # Render Header / Headline with word-wrapping and safe margins
        raw_headline = shot_props.get("headline") or shot_props.get("title")
        if raw_headline and not str(raw_headline).upper().startswith("FACTS."):
            headline = str(raw_headline).strip()
            font_title = self._get_font(44)
            headline_lines = self._wrap_text(headline.upper(), font_title, content_width - 40)
            if len(headline_lines) > 2:
                font_title = self._get_font(36)
                headline_lines = self._wrap_text(headline.upper(), font_title, content_width - 40)
            headline_y = safe_top + 30
            for h_idx, h_line in enumerate(headline_lines[:2]):
                draw.text(
                    (self.width // 2, headline_y + (h_idx * 50)),
                    h_line,
                    fill=(248, 250, 252, 255),
                    font=font_title,
                    anchor="mt",
                    stroke_width=2,
                    stroke_fill=(0, 0, 0, 200)
                )

        # Center area for shot recipes
        center_y = self.height // 2 - 30

        if shot_recipe == "KINETIC_HOOK":
            tag = str(shot_props.get("tag") or shot_props.get("highlightWord") or "ATTENTION").upper()
            hook_text = str(shot_props.get("subtitle") or shot_props.get("headline") or scene_props.get("narration_text") or "Did you know?")
            # Glowing tag pill
            font_tag = self._get_font(32)
            tag_bbox = font_tag.getbbox(tag)
            tag_w = tag_bbox[2] - tag_bbox[0] + 48
            pill_x1 = (self.width - tag_w) // 2
            pill_y1 = center_y - 130
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + tag_w, pill_y1 + 52], radius=26, fill=(14, 165, 233, 230), outline=(224, 242, 254, 255), width=2)
            draw.text((self.width // 2, pill_y1 + 26), tag, fill=(255, 255, 255, 255), font=font_tag, anchor="mm")
            # Big kinetic typography
            font_hk = self._get_font(52)
            self._draw_wrapped_text(draw, hook_text, self.width // 2, center_y + 40, content_width - 60, font_hk, (255, 255, 255, 255), "mm")

        elif shot_recipe == "BIG_NUMBER":
            num = str(shot_props.get("number", "10X"))
            font_num = self._get_font(120)
            draw.text((self.width // 2, center_y - 50), num, fill=(253, 224, 71, 255), font=font_num, anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0, 220))
            label = str(shot_props.get("label", "CRITICAL METRIC"))
            font_lbl = self._get_font(38)
            draw.text((self.width // 2, center_y + 60), label, fill=(226, 232, 240, 255), font=font_lbl, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0, 220))

        elif shot_recipe == "QUOTE_CARD":
            quote = f'"{shot_props.get("quote", "Discipline equals freedom.")}"'
            author = f"— {shot_props.get('author', 'Unknown')}"
            font_q = self._get_font(38)
            font_a = self._get_font(32)
            q_lines = self._wrap_text(quote, font_q, content_width - 80)
            card_h = max(240, 80 + len(q_lines) * 50 + 60)
            card_top = center_y - (card_h // 2)
            card_bottom = card_top + card_h
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(15, 23, 42, 225), outline=(56, 189, 248, 220), width=2)
            for i, line in enumerate(q_lines):
                draw.text((self.width // 2, card_top + 45 + (i * 50)), line, fill=(244, 244, 245, 255), font=font_q, anchor="mt")
            draw.text((self.width // 2, card_bottom - 36), author, fill=(253, 224, 71, 255), font=font_a, anchor="mm")

        elif shot_recipe == "STAT":
            val = str(shot_props.get("value", "+84%"))
            head = str(shot_props.get("headline", "PROVEN EFFICIENCY"))
            font_val = self._get_font(96)
            font_head = self._get_font(38)
            draw.text((self.width // 2, center_y - 40), val, fill=(56, 189, 248, 255), font=font_val, anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0, 220))
            draw.text((self.width // 2, center_y + 50), head, fill=(241, 245, 249, 255), font=font_head, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0, 220))

        elif shot_recipe == "TIMELINE_BUILD":
            year = str(shot_props.get("year") or shot_props.get("keyYear") or shot_props.get("milestone") or "MILESTONE")
            title = str(shot_props.get("title") or shot_props.get("event") or "Historical Event")
            desc = str(shot_props.get("description") or scene_props.get("narration_text") or "")
            font_yr = self._get_font(52)
            font_evt = self._get_font(38)
            font_d = self._get_font(32)
            d_lines = self._wrap_text(desc, font_d, content_width - 80)
            card_h = max(260, 90 + 50 + len(d_lines) * 44 + 40)
            card_top = center_y - (card_h // 2)
            card_bottom = card_top + card_h
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(28, 25, 23, 230), outline=(245, 158, 11, 230), width=3)
            draw.text((self.width // 2, card_top + 45), year, fill=(245, 158, 11, 255), font=font_yr, anchor="mt")
            draw.text((self.width // 2, card_top + 105), title.upper(), fill=(250, 247, 237, 255), font=font_evt, anchor="mt")
            for i, line in enumerate(d_lines[:3]):
                draw.text((self.width // 2, card_top + 160 + (i * 44)), line, fill=(214, 211, 209, 255), font=font_d, anchor="mt")

        elif shot_recipe == "HEADLINE_CARD":
            source = str(shot_props.get("source", "NEWS DESK")).upper()
            head = str(shot_props.get("headline") or shot_props.get("title") or "Breaking Development")
            card_top = center_y - 160
            card_bottom = center_y + 160
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(17, 24, 39, 235), outline=(239, 68, 68, 255), width=3)
            draw.rounded_rectangle([left_margin + 40, card_top + 30, left_margin + 200, card_top + 74], radius=10, fill=(239, 68, 68, 255))
            font_brk = self._get_font(28)
            draw.text((left_margin + 120, card_top + 52), "BREAKING", fill=(255, 255, 255, 255), font=font_brk, anchor="mm")
            font_src = self._get_font(28)
            draw.text((right_margin - 40, card_top + 52), source, fill=(156, 163, 175, 255), font=font_src, anchor="rm")
            font_hl = self._get_font(44)
            self._draw_wrapped_text(draw, head, self.width // 2, center_y + 35, content_width - 80, font_hl, (249, 250, 251, 255), "mm")

        elif shot_recipe == "SOURCE_CARD":
            src = str(shot_props.get("source", "Verified Source"))
            claim = str(shot_props.get("claim") or shot_props.get("evidence") or scene_props.get("narration_text") or "Verified Data Evidence")
            card_top = center_y - 140
            card_bottom = center_y + 140
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=20, fill=(15, 23, 42, 230), outline=(56, 189, 248, 255), width=2)
            font_sh = self._get_font(30)
            draw.text((self.width // 2, card_top + 40), f"EVIDENCE SOURCE: {src}".upper(), fill=(56, 189, 248, 255), font=font_sh, anchor="mm")
            font_cl = self._get_font(36)
            self._draw_wrapped_text(draw, claim, self.width // 2, center_y + 30, content_width - 80, font_cl, (241, 245, 249, 255), "mm")

        elif shot_recipe == "OUTRO_CTA":
            cta_title = str(shot_props.get("cta") or shot_props.get("title") or "FOLLOW FOR MORE").upper()
            sub_text = str(shot_props.get("subtitle") or "Drop your thoughts in the comments")
            font_ct = self._get_font(44)
            font_cs = self._get_font(32)
            card_top = center_y - 110
            card_bottom = center_y + 110
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=32, fill=(14, 165, 233, 220), outline=(248, 250, 252, 255), width=3)
            draw.text((self.width // 2, center_y - 20), cta_title, fill=(255, 255, 255, 255), font=font_ct, anchor="mm")
            draw.text((self.width // 2, center_y + 40), sub_text, fill=(224, 242, 254, 255), font=font_cs, anchor="mm")

        else:
            # Narrative card / IMAGE_WITH_CAPTION / FULL_BLEED_IMAGE
            if has_background_photo:
                # Background photograph is already drawn full-bleed!
                # Render an elegant informative caption pill in the lower-middle area
                caption = str(shot_props.get("caption") or shot_props.get("headline") or "")
                if caption:
                    font_cap = self._get_font(36)
                    cap_lines = self._wrap_text(caption, font_cap, content_width - 100)
                    pill_h = 40 + len(cap_lines) * 46
                    pill_top = center_y - (pill_h // 2)
                    draw.rounded_rectangle(
                        [left_margin + 30, pill_top, right_margin - 30, pill_top + pill_h],
                        radius=18,
                        fill=(15, 23, 42, 210),
                        outline=(56, 189, 248, 200),
                        width=2
                    )
                    for i, line in enumerate(cap_lines):
                        draw.text(
                            (self.width // 2, pill_top + 20 + (i * 46)),
                            line,
                            fill=(241, 245, 249, 255),
                            font=font_cap,
                            anchor="mt"
                        )
            else:
                card_top = center_y - 150
                card_bottom = center_y + 150
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(30, 41, 59, 210), outline=(71, 85, 105, 255), width=2)
                sub_text = shot_props.get("caption") or scene_props.get("narration_text") or "Production Scene Beat"
                font_body = self._get_font(40)
                self._draw_wrapped_text(draw, sub_text, self.width // 2, center_y, content_width - 80, font_body, (241, 245, 249, 255), "mm")

        # Render Captions / Subtitles in Lower Third (within safe margins)
        if caption_text:
            font_cap = self._get_font(42)
            cap_lines = self._wrap_text(caption_text, font_cap, content_width - 80)
            # Display at most 2 lines at once to avoid covering bottom UI
            visible_lines = cap_lines[:2] if len(cap_lines) > 2 else cap_lines
            line_h = 52
            start_cap_y = 1520 - (len(visible_lines) * line_h)
            for i, line in enumerate(visible_lines):
                y_pos = start_cap_y + (i * line_h)
                draw.text(
                    (self.width // 2, y_pos),
                    line,
                    fill=(254, 240, 138, 255),
                    font=font_cap,
                    anchor="mt",
                    stroke_width=3,
                    stroke_fill=(0, 0, 0, 255)
                )

        return img

    def _wrap_text(self, text: str, font: ImageFont.ImageFont, max_width: int) -> List[str]:
        words = text.split()
        if not words:
            return []
        lines = []
        current = words[0]
        for w in words[1:]:
            test = f"{current} {w}"
            bbox = font.getbbox(test)
            if bbox[2] - bbox[0] <= max_width:
                current = test
            else:
                lines.append(current)
                current = w
        lines.append(current)
        return lines

    def _draw_wrapped_text(self, draw: ImageDraw.ImageDraw, text: str, x: int, y: int, max_width: int, font: ImageFont.ImageFont, fill: Tuple[int, int, int, int], anchor: str = "mm"):
        lines = self._wrap_text(text, font, max_width)
        line_height = int(font.size * 1.3)
        total_h = len(lines) * line_height
        start_y = y - (total_h // 2) if "m" in anchor else y

        for i, line in enumerate(lines):
            cur_y = start_y + (i * line_height)
            draw.text((x, cur_y), line, fill=fill, font=font, anchor=anchor)
