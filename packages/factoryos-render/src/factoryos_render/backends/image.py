"""
Pillow Native Frame Compositor for FactoryOS Render Engine.
Provides deterministic, high-performance rendering of 9:16 vertical shorts.
Respects 9:16 safe areas and renders typography, shapes, cards, and captions.
"""

from PIL import Image, ImageDraw, ImageFont
from typing import Dict, Any, List, Optional, Tuple
import math

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
        # Determine background palette
        bg_type = shot_props.get("background_type", "DARK_SLATE")
        if bg_type == "DEEP_INDIGO":
            img = self.create_gradient_background((9, 10, 15), (30, 27, 75))
        elif bg_type == "AMBER_HISTORY":
            img = self.create_gradient_background((28, 25, 23), (69, 26, 3))
        elif bg_type == "MONOCHROME":
            img = self.create_gradient_background((5, 5, 5), (24, 24, 27))
        elif bg_type == "REDDIT_ORANGE":
            img = self.create_gradient_background((3, 3, 3), (26, 26, 27))
        else:
            img = self.create_gradient_background((15, 23, 42), (30, 41, 59))

        draw = ImageDraw.Draw(img)

        # Draw decorative glowing center orb
        orb_r = 380 + int(math.sin(progress * math.pi) * 20)
        cx, cy = self.width // 2, self.height // 2
        draw.ellipse([cx - orb_r, cy - orb_r, cx + orb_r, cy + orb_r], fill=(99, 102, 241, 18))

        # Safe area bounds
        left_margin = 80
        right_margin = self.width - 80
        content_width = right_margin - left_margin

        # Render Header / Headline
        headline = shot_props.get("headline") or shot_props.get("title") or scene_props.get("template_id") or "FACTORYOS SHORT"
        font_title = self._get_font(52)

        # Subtle scale entrance for headline
        headline_y = safe_top + 40
        draw.text((self.width // 2, headline_y), str(headline).upper(), fill=(248, 250, 252, 255), font=font_title, anchor="mt")

        # Render Central Shot Primitive based on recipe
        center_y = self.height // 2 - 40

        if shot_recipe == "KINETIC_HOOK":
            tag = str(shot_props.get("tag") or shot_props.get("highlightWord") or "ATTENTION").upper()
            hook_text = str(shot_props.get("headline") or shot_props.get("subtitle") or scene_props.get("narration_text") or "Did you know?")
            # Glowing tag pill
            font_tag = self._get_font(34)
            tag_bbox = font_tag.getbbox(tag)
            tag_w = tag_bbox[2] - tag_bbox[0] + 48
            pill_x1 = (self.width - tag_w) // 2
            pill_y1 = center_y - 140
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + tag_w, pill_y1 + 54], radius=27, fill=(99, 102, 241, 230), outline=(165, 180, 252, 255), width=2)
            draw.text((self.width // 2, pill_y1 + 27), tag, fill=(255, 255, 255, 255), font=font_tag, anchor="mm")
            # Big kinetic typography
            font_hk = self._get_font(56)
            self._draw_wrapped_text(draw, hook_text, self.width // 2, center_y + 40, content_width - 60, font_hk, (255, 255, 255, 255), "mm")

        elif shot_recipe == "BIG_NUMBER":
            num = str(shot_props.get("number", "10X"))
            font_num = self._get_font(130)
            draw.text((self.width // 2, center_y - 60), num, fill=(253, 224, 71, 255), font=font_num, anchor="mm")
            label = str(shot_props.get("label", "CRITICAL METRIC"))
            font_lbl = self._get_font(40)
            draw.text((self.width // 2, center_y + 60), label, fill=(148, 163, 184, 255), font=font_lbl, anchor="mm")

        elif shot_recipe == "QUOTE_CARD":
            quote = f'"{shot_props.get("quote", "Discipline equals freedom.")}"'
            author = f"— {shot_props.get('author', 'Unknown')}"
            font_q = self._get_font(42)
            font_a = self._get_font(34)
            # Card frame
            card_top = center_y - 170
            card_bottom = center_y + 170
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(24, 24, 27, 220), outline=(63, 63, 70, 255), width=2)
            self._draw_wrapped_text(draw, quote, self.width // 2, center_y - 30, content_width - 80, font_q, (244, 244, 245, 255), "mm")
            draw.text((self.width // 2, center_y + 95), author, fill=(217, 119, 6, 255), font=font_a, anchor="mm")

        elif shot_recipe == "STAT":
            val = str(shot_props.get("value", "+84%"))
            head = str(shot_props.get("headline", "PROVEN EFFICIENCY"))
            font_val = self._get_font(100)
            font_head = self._get_font(40)
            draw.text((self.width // 2, center_y - 40), val, fill=(56, 189, 248, 255), font=font_val, anchor="mm")
            draw.text((self.width // 2, center_y + 50), head, fill=(226, 232, 240, 255), font=font_head, anchor="mm")

        elif shot_recipe == "TIMELINE_BUILD":
            year = str(shot_props.get("year") or shot_props.get("keyYear") or shot_props.get("milestone") or "MILESTONE")
            title = str(shot_props.get("title") or shot_props.get("event") or "Historical Event")
            desc = str(shot_props.get("description") or scene_props.get("narration_text") or "")
            card_top = center_y - 190
            card_bottom = center_y + 190
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(28, 25, 23, 230), outline=(217, 119, 6, 255), width=3)
            # Year badge
            font_yr = self._get_font(56)
            draw.text((self.width // 2, card_top + 60), year, fill=(245, 158, 11, 255), font=font_yr, anchor="mm")
            # Title
            font_evt = self._get_font(42)
            draw.text((self.width // 2, card_top + 130), title.upper(), fill=(250, 247, 237, 255), font=font_evt, anchor="mm")
            # Description
            if desc:
                font_d = self._get_font(34)
                self._draw_wrapped_text(draw, desc, self.width // 2, card_top + 230, content_width - 80, font_d, (214, 211, 209, 255), "mm")

        elif shot_recipe == "HEADLINE_CARD":
            source = str(shot_props.get("source", "NEWS DESK")).upper()
            head = str(shot_props.get("headline") or shot_props.get("title") or "Breaking Development")
            card_top = center_y - 180
            card_bottom = center_y + 180
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(17, 24, 39, 235), outline=(239, 68, 68, 255), width=3)
            # Breaking tag
            draw.rounded_rectangle([left_margin + 40, card_top + 30, left_margin + 200, card_top + 74], radius=10, fill=(239, 68, 68, 255))
            font_brk = self._get_font(28)
            draw.text((left_margin + 120, card_top + 52), "BREAKING", fill=(255, 255, 255, 255), font=font_brk, anchor="mm")
            # Source
            font_src = self._get_font(28)
            draw.text((right_margin - 40, card_top + 52), source, fill=(156, 163, 175, 255), font=font_src, anchor="rm")
            # Headline
            font_hl = self._get_font(46)
            self._draw_wrapped_text(draw, head, self.width // 2, center_y + 40, content_width - 80, font_hl, (249, 250, 251, 255), "mm")

        elif shot_recipe == "SOURCE_CARD":
            src = str(shot_props.get("source", "Verified Source"))
            claim = str(shot_props.get("claim") or shot_props.get("evidence") or scene_props.get("narration_text") or "Verified Data Evidence")
            card_top = center_y - 150
            card_bottom = center_y + 150
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=20, fill=(15, 23, 42, 230), outline=(56, 189, 248, 255), width=2)
            font_sh = self._get_font(32)
            draw.text((self.width // 2, card_top + 45), f"EVIDENCE SOURCE: {src}".upper(), fill=(56, 189, 248, 255), font=font_sh, anchor="mm")
            font_cl = self._get_font(38)
            self._draw_wrapped_text(draw, claim, self.width // 2, center_y + 35, content_width - 80, font_cl, (241, 245, 249, 255), "mm")

        elif shot_recipe == "REDDIT_POST":
            sub = f"r/{shot_props.get('subreddit', 'AmItheAsshole')}"
            author = f"u/{shot_props.get('author', 'Throwaway123')}"
            title = shot_props.get("title", "AITA for walking out of my own wedding?")
            card_top = center_y - 180
            card_bottom = center_y + 180
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(26, 26, 27, 240), outline=(52, 53, 54, 255), width=2)
            font_sub = self._get_font(32)
            font_pt = self._get_font(40)
            draw.text((left_margin + 40, card_top + 40), f"{sub} • Posted by {author}", fill=(129, 131, 132, 255), font=font_sub)
            self._draw_wrapped_text(draw, title, left_margin + 40, card_top + 100, content_width - 80, font_pt, (215, 218, 220, 255), "la")

        elif shot_recipe == "REDDIT_COMMENT":
            author = f"u/{shot_props.get('author', 'TopCommenter')}"
            comment = str(shot_props.get("comment") or shot_props.get("reaction") or scene_props.get("narration_text") or "Top community reaction")
            upvotes = str(shot_props.get("upvotes", "24.5k"))
            card_top = center_y - 160
            card_bottom = center_y + 160
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=20, fill=(20, 20, 21, 240), outline=(255, 69, 0, 200), width=2)
            font_u = self._get_font(30)
            draw.text((left_margin + 40, card_top + 36), f"{author} • {upvotes} upvotes", fill=(255, 69, 0, 255), font=font_u)
            font_c = self._get_font(38)
            self._draw_wrapped_text(draw, comment, left_margin + 40, card_top + 95, content_width - 80, font_c, (228, 230, 232, 255), "la")

        elif shot_recipe == "OUTRO_CTA":
            cta_title = str(shot_props.get("cta") or shot_props.get("title") or "FOLLOW FOR MORE").upper()
            sub_text = str(shot_props.get("subtitle") or "Drop your thoughts in the comments")
            font_ct = self._get_font(48)
            font_cs = self._get_font(34)
            card_top = center_y - 120
            card_bottom = center_y + 120
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=32, fill=(99, 102, 241, 220), outline=(248, 250, 252, 255), width=3)
            draw.text((self.width // 2, center_y - 20), cta_title, fill=(255, 255, 255, 255), font=font_ct, anchor="mm")
            draw.text((self.width // 2, center_y + 45), sub_text, fill=(224, 231, 255, 255), font=font_cs, anchor="mm")

        elif shot_recipe == "FLAG_REVEAL":
            country = str(shot_props.get("countryName", "JAPAN")).upper()
            code = str(shot_props.get("countryCode", "JP")).upper()
            draw.rectangle([cx - 240, center_y - 150, cx + 240, center_y + 150], fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=4)
            draw.ellipse([cx - 75, center_y - 75, cx + 75, center_y + 75], fill=(188, 0, 45, 255))
            font_c = self._get_font(48)
            draw.text((cx, center_y + 220), country, fill=(255, 255, 255, 255), font=font_c, anchor="mm")

        else:
            # General narrative card / IMAGE_WITH_CAPTION / FULL_BLEED_IMAGE
            # Check if a physical image asset is provided
            img_path = shot_props.get("image_path") or shot_props.get("imageRef") or shot_props.get("path")
            has_rendered_image = False
            if img_path:
                clean_path = img_path.replace("file://", "")
                import os
                if os.path.exists(clean_path):
                    try:
                        from PIL import ImageOps
                        src_raw = Image.open(clean_path).convert("RGBA")
                        card_top = center_y - 240
                        card_bottom = center_y + 240
                        card_w = content_width
                        card_h = card_bottom - card_top
                        fitted = ImageOps.fit(src_raw, (card_w, card_h), Image.Resampling.LANCZOS)
                        # Paste fitted image with border
                        img.paste(fitted, (left_margin, card_top), fitted)
                        draw.rectangle([left_margin, card_top, right_margin, card_bottom], outline=(255, 255, 255, 120), width=3)
                        has_rendered_image = True
                    except Exception:
                        pass

            if not has_rendered_image:
                card_top = center_y - 160
                card_bottom = center_y + 160
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(30, 41, 59, 200), outline=(71, 85, 105, 255), width=2)
                sub_text = shot_props.get("caption") or scene_props.get("narration_text") or "Production Scene Beat"
                font_body = self._get_font(42)
                self._draw_wrapped_text(draw, sub_text, self.width // 2, center_y, content_width - 80, font_body, (241, 245, 249, 255), "mm")

        # Render Captions / Subtitles in Lower Third (above safe bottom)
        caption_y = self.height - safe_bottom - 60
        if caption_text:
            font_cap = self._get_font(48)
            # Draw caption background pill
            cap_lines = self._wrap_text(caption_text, font_cap, content_width - 60)
            for i, line in enumerate(cap_lines):
                y_pos = caption_y + (i * 60)
                draw.text((self.width // 2, y_pos), line, fill=(254, 240, 138, 255), font=font_cap, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0, 255))

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
