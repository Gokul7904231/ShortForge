"""
Pillow Native Frame Compositor for FactoryOS Render Engine.
Provides deterministic, high-performance rendering of 9:16 vertical shorts.
Respects 9:16 safe areas and renders typography, shapes, cards, and captions.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from typing import Dict, Any, List, Optional, Tuple
import math

class NativeFrameCompositor:
    def __init__(self, width: int = 1080, height: int = 1920):
        self.width = width
        self.height = height
        self._font_cache: Dict[int, ImageFont.ImageFont] = {}
        self._watermark_cache: Optional[Image.Image] = None
        self._design_pack_cache: Dict[str, Dict[str, Image.Image]] = {}

    def _get_design_pack_layer(self, pack_id: str, role: str) -> Optional[Image.Image]:
        if not pack_id:
            return None
        if pack_id not in self._design_pack_cache:
            self._design_pack_cache[pack_id] = {}
        if role in self._design_pack_cache[pack_id]:
            return self._design_pack_cache[pack_id][role]

        import os
        candidates = [
            os.path.join(os.getcwd(), 'assets', 'canva', 'packs', pack_id, f"{role}.png"),
            os.path.join(os.getcwd(), 'data', 'visual-assets-store', 'b2', 'shortsfactory-assets', 'canva-packs', pack_id, f"{role}.png"),
            os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'assets', 'canva', 'packs', pack_id, f"{role}.png")),
            os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'data', 'visual-assets-store', 'b2', 'shortsfactory-assets', 'canva-packs', pack_id, f"{role}.png")),
        ]
        for c in candidates:
            if os.path.exists(c):
                try:
                    raw = Image.open(c).convert('RGBA')
                    if raw.size != (self.width, self.height):
                        raw = raw.resize((self.width, self.height), Image.Resampling.LANCZOS)
                    self._design_pack_cache[pack_id][role] = raw
                    return raw
                except Exception:
                    pass
        return None

    def _get_watermark(self) -> Optional[Image.Image]:
        if self._watermark_cache is not None:
            return self._watermark_cache
        import os
        candidates = [
            os.path.join(os.getcwd(), 'assets', 'branding', 'shortforge-watermark.png'),
            os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'assets', 'branding', 'shortforge-watermark.png')),
        ]
        for c in candidates:
            if os.path.exists(c):
                try:
                    raw = Image.open(c).convert('RGBA')
                    resized = raw.resize((88, 88), Image.Resampling.LANCZOS)
                    r, g, b, a = resized.split()
                    a = a.point(lambda p: int(p * 0.75))
                    self._watermark_cache = Image.merge('RGBA', (r, g, b, a))
                    return self._watermark_cache
                except Exception:
                    pass
        return None

    def _get_font(self, size: int) -> ImageFont.ImageFont:
        if size not in self._font_cache:
            candidates = [
                "segoeui.ttf",
                "arial.ttf",
                "DejaVuSans.ttf",
                "SegoeUI.ttf",
                "Arial.ttf",
                "C:\\Windows\\Fonts\\segoeui.ttf",
                "C:\\Windows\\Fonts\\arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            ]
            loaded = None
            for cand in candidates:
                try:
                    loaded = ImageFont.truetype(cand, size)
                    break
                except Exception:
                    continue
            self._font_cache[size] = loaded or ImageFont.load_default()
        return self._font_cache[size]

    @staticmethod
    def _clean_image_path(p: Any) -> Optional[str]:
        if not p:
            return None
        clean = str(p).replace("file://", "")
        if clean.startswith("/") and len(clean) > 2 and clean[2] == ":":
            clean = clean[1:]
        return clean

    @staticmethod
    def _sanitize_unicode(text: str) -> str:
        """Normalizes typography and special glyphs for robust cross-platform rendering."""
        if not text:
            return ""
        return (
            text.replace("\u2019", "'")
            .replace("\u2018", "'")
            .replace("\u201c", '"')
            .replace("\u201d", '"')
            .replace("\u2013", "-")
            .replace("\u2014", "--")
        )

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

    def _get_quiz_theme(self, shot_props: Dict[str, Any], scene_props: Dict[str, Any]) -> Tuple[Tuple[int, int, int], str]:
        """Derive universal semantic tokens (accent_rgb, bg_type) across Geography, Science, History, AI, etc."""
        explicit_accent = shot_props.get("accentColor")
        if explicit_accent and isinstance(explicit_accent, (list, tuple)) and len(explicit_accent) >= 3:
            return (int(explicit_accent[0]), int(explicit_accent[1]), int(explicit_accent[2])), "DEEP_NAVY"

        topic = str(shot_props.get("topic") or scene_props.get("topic") or shot_props.get("categoryBadge") or shot_props.get("headline") or "").upper()
        if any(k in topic for k in ["SCIENCE", "PHYSICS", "SPACE", "ASTRONOMY", "BIOLOGY", "CHEMISTRY", "SOLAR"]):
            return (139, 92, 246), "QUIZ_SCIENCE" # Purple/Violet
        elif any(k in topic for k in ["HISTORY", "CIVILIZATION", "ANCIENT", "WAR", "EMPIRE", "ERA", "CENTURY", "TIMELINE"]):
            return (245, 158, 11), "QUIZ_HISTORY" # Amber/Gold
        elif any(k in topic for k in ["AI", "ARTIFICIAL", "TECH", "ROBOT", "COMPUT", "NEURAL", "CYBER", "MACHINE"]):
            return (59, 130, 246), "QUIZ_AI" # Tech Blue
        elif any(k in topic for k in ["GEO", "EARTH", "MAP", "COUNTRY", "CAPITAL", "OCEAN", "CONTINENT", "FLAG"]):
            return (6, 182, 212), "QUIZ_GEOGRAPHY" # Oceanic Cyan
        else:
            return (0, 170, 255), "DEEP_NAVY" # Electric Cyan/Blue

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
        # Background is explicit CompositionIR/F06 data. A transparent layer is used
        # when the FrameEngine is stacking multiple clips.
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
            family = str(scene_props.get("format_family") or scene_props.get("content_engine") or shot_props.get("visual_family") or "").upper()
            bg_type = shot_props.get("background_type")
            if not bg_type:
                if "QUIZ" in family:
                    _, bg_type = self._get_quiz_theme(shot_props, scene_props)
                elif "FACT" in family:
                    bg_type = "DEEP_INDIGO"
                elif "HIST" in family:
                    bg_type = "AMBER_HISTORY"
                else:
                    bg_type = "DARK_SLATE"

            if bg_type == "QUIZ_SCIENCE":
                img = self.create_gradient_background((14, 11, 33), (24, 18, 55))
            elif bg_type == "QUIZ_HISTORY":
                img = self.create_gradient_background((26, 17, 10), (45, 28, 15))
            elif bg_type == "QUIZ_AI":
                img = self.create_gradient_background((6, 14, 30), (10, 25, 55))
            elif bg_type == "QUIZ_GEOGRAPHY":
                img = self.create_gradient_background((8, 19, 37), (12, 35, 60))
            elif bg_type == "DEEP_INDIGO":
                img = self.create_gradient_background((9, 14, 28), (20, 30, 55))
            elif bg_type == "DEEP_NAVY":
                img = self.create_gradient_background((8, 18, 40), (15, 23, 42))
            elif bg_type == "AMBER_HISTORY":
                img = self.create_gradient_background((28, 25, 23), (69, 36, 12))
            elif bg_type == "MONOCHROME":
                img = self.create_gradient_background((5, 5, 5), (24, 24, 27))
            elif bg_type == "REDDIT_ORANGE":
                img = self.create_gradient_background((3, 3, 3), (26, 26, 27))
            else:
                img = self.create_gradient_background((15, 23, 42), (30, 41, 59))

        draw = ImageDraw.Draw(img)

        # Atmospheric Photographic Subject Backdrop Layer (Defect 10 fix)
        img_path = shot_props.get("image_path") or shot_props.get("imageRef") or scene_props.get("image_url")
        clean_p = self._clean_image_path(img_path)
        if clean_p:
            import os
            if os.path.exists(clean_p):
                try:
                    from PIL import ImageFilter, ImageOps
                    src_raw = Image.open(clean_p).convert("RGBA")
                    bg_fitted = ImageOps.fit(src_raw, (self.width, self.height), Image.Resampling.LANCZOS)
                    blurred_bg = bg_fitted.filter(ImageFilter.GaussianBlur(radius=18))
                    scrim = Image.new("RGBA", (self.width, self.height), (6, 12, 24, 195))
                    blurred_bg.alpha_composite(scrim)
                    img.paste(blurred_bg, (0, 0))
                    draw = ImageDraw.Draw(img)
                except Exception:
                    pass

        # Decorative visual primitives are strictly composition-controlled.
        # Unconditional global orb removed to eliminate generic visual sameness.
        if shot_props.get("decorative_orb") is True or scene_props.get("decorative_orb") is True:
            orb_r = 380 + int(math.sin(progress * math.pi) * 20)
            cx, cy = self.width // 2, self.height // 2
            draw.ellipse([cx - orb_r, cy - orb_r, cx + orb_r, cy + orb_r], fill=(99, 102, 241, 18))

        # Safe area bounds
        left_margin = 80
        right_margin = self.width - 80
        content_width = right_margin - left_margin

        # Render Header / Headline
        raw_headline = shot_props.get("headline") or shot_props.get("title") or scene_props.get("scene_title") or ""
        # Strictly prevent internal template IDs or developer metadata from appearing as viewer-facing text
        if raw_headline and not any(raw_headline.endswith(suffix) for suffix in [".v1", ".v2", ".v3"]) and "." not in raw_headline and "internal" not in str(raw_headline).lower():
            headline = raw_headline
        else:
            headline = ""

        font_title = self._get_font(42)
        if headline:
            headline_y = safe_top + 25
            bbox = font_title.getbbox(str(headline).upper())
            if (bbox[2] - bbox[0]) > content_width:
                font_title = self._get_font(32)
            self._draw_wrapped_text(draw, str(headline).upper(), self.width // 2, headline_y, content_width, font_title, (248, 250, 252, 255), "mt")

        # Canva Master Visual Design Pack Resolution
        pack_id = (
            shot_props.get("design_pack")
            or scene_props.get("design_pack")
            or shot_props.get("canva_design_pack")
            or scene_props.get("canva_design_pack")
        )
        if not pack_id:
            tmpl_id = str(scene_props.get("template_id") or shot_props.get("template_id") or scene_props.get("templateId") or shot_props.get("templateId") or "")
            if "v2" in tmpl_id or tmpl_id.endswith(".v2"):
                pack_id = "quiz.universal.cinematic.v1"

        # Render Central Shot Primitive based on recipe
        center_y = self.height // 2 - 40

        if shot_recipe == "KINETIC_HOOK":
            tag = str(shot_props.get("tag") or shot_props.get("highlightWord") or "ATTENTION").upper()
            hook_text = str(shot_props.get("subtitle") or shot_props.get("headline") or scene_props.get("narration_text") or "Did you know?")
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

        elif shot_recipe == "QUESTION_CARD":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            category = str(shot_props.get("categoryBadge") or shot_props.get("headline") or "QUIZ CHALLENGE").upper()
            accent_rgb, _ = self._get_quiz_theme(shot_props, scene_props)

            card_top = 320
            card_bottom = 1380
            divider_y = card_top + 190

            # Canva Design Pack Glass Frame or Native Vector Card
            glass_frame = self._get_design_pack_layer(pack_id, "glass_card_frame")
            if glass_frame:
                img.alpha_composite(glass_frame)
                draw = ImageDraw.Draw(img)
            else:
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=(11, 18, 32, 248), outline=accent_rgb + (200,), width=3)

            # Category Pill at top (Canva Badge Plate or Native Pill)
            badge_layer = self._get_design_pack_layer(pack_id, "category_badge")
            if badge_layer:
                img.alpha_composite(badge_layer)
                draw = ImageDraw.Draw(img)
            else:
                font_cat = self._get_font(28)
                pill_w = min(content_width - 40, max(260, len(category) * 16 + 60))
                draw.rounded_rectangle([self.width // 2 - pill_w // 2, card_top - 28, self.width // 2 + pill_w // 2, card_top + 26], radius=27, fill=accent_rgb + (240,), outline=(255, 255, 255, 255), width=2)

            font_cat = self._get_font(28)
            draw.text((self.width // 2, card_top - 1), category, fill=(255, 255, 255, 255), font=font_cat, anchor="mm")

            # Question Text - Crisp pure white sitting directly on card canvas (no nested box!)
            font_q = self._get_font(38)
            self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 95, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Divider / Track
            track_layer = self._get_design_pack_layer(pack_id, "progress_track")
            if track_layer:
                img.alpha_composite(track_layer)
                draw = ImageDraw.Draw(img)
            else:
                draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=accent_rgb + (80,), width=2)

            # Options (A, B, C, D) - Clearly separated mobile friendly boxes
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)
            highlight_idx = shot_props.get("highlightOptionIndex")
            highlight_idx = int(highlight_idx) if highlight_idx is not None else None
            for oidx in range(min(4, len(options))):
                opt_y = divider_y + 20 + oidx * 125
                box = [left_margin + 25, opt_y, right_margin - 25, opt_y + 105]
                is_highlight = highlight_idx == oidx
                draw.rounded_rectangle(
                    box,
                    radius=18,
                    fill=(accent_rgb + (70,)) if is_highlight else (18, 28, 50, 220),
                    outline=accent_rgb + (255 if is_highlight else 140,),
                    width=4 if is_highlight else 2,
                )
                bx, by = left_margin + 85, opt_y + 52
                draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=accent_rgb + (80,), outline=accent_rgb + (240,), width=2)
                draw.text((bx, by), opt_labels[oidx], fill=(255, 255, 255, 255), font=font_badge, anchor="mm")
                opt_str = str(options[oidx])
                draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")

        elif shot_recipe == "COUNTDOWN":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            total_secs = float(shot_props.get("seconds", 5))
            rem_secs = max(1, int(math.ceil(total_secs * (1.0 - progress))))

            card_top = 320
            card_bottom = 1380
            divider_y = card_top + 190

            glass_frame = self._get_design_pack_layer(pack_id, "glass_card_frame")
            if glass_frame:
                img.alpha_composite(glass_frame)
                draw = ImageDraw.Draw(img)
            else:
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=(11, 18, 32, 248), outline=(245, 158, 11, 200), width=3)

            # Countdown Timer Pill
            timer_color = (245, 158, 11, 255) if rem_secs > 1 else (239, 68, 68, 255)
            draw.rounded_rectangle([self.width // 2 - 130, card_top - 28, self.width // 2 + 130, card_top + 26], radius=27, fill=(11, 18, 32, 255), outline=timer_color, width=3)
            font_timer = self._get_font(34)
            draw.text((self.width // 2, card_top - 1), f"⏱️ {rem_secs}s", fill=timer_color, font=font_timer, anchor="mm")

            # Question Text - Crisp pure white
            font_q = self._get_font(38)
            self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 95, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Divider & Track
            track_layer = self._get_design_pack_layer(pack_id, "progress_track")
            if track_layer:
                img.alpha_composite(track_layer)
                draw = ImageDraw.Draw(img)
            else:
                draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=(245, 158, 11, 80), width=2)

            tmpl_id = str(scene_props.get("template_id") or shot_props.get("template_id") or scene_props.get("templateId") or shot_props.get("templateId") or "")
            is_v2 = "v2" in tmpl_id or tmpl_id.endswith(".v2") or bool(pack_id)

            if is_v2:
                # Dynamic countdown progress bar across divider
                bar_y = divider_y - 12
                bar_full_w = content_width - 80
                bar_w = int(bar_full_w * max(0.0, min(1.0, 1.0 - progress)))
                if not track_layer:
                    draw.rounded_rectangle([left_margin + 40, bar_y - 4, right_margin - 40, bar_y + 4], radius=4, fill=(20, 30, 48, 220), outline=(245, 158, 11, 60), width=1)
                if bar_w > 0:
                    draw.rounded_rectangle([left_margin + 40, bar_y - 4, left_margin + 40 + bar_w, bar_y + 4], radius=4, fill=timer_color)

            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)
            for oidx in range(min(4, len(options))):
                opt_y = divider_y + 20 + oidx * 125
                box = [left_margin + 25, opt_y, right_margin - 25, opt_y + 105]
                draw.rounded_rectangle(box, radius=18, fill=(28, 25, 23, 230), outline=(245, 158, 11, 140), width=2)
                bx, by = left_margin + 85, opt_y + 52
                draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(245, 158, 11, 60), outline=(245, 158, 11, 220), width=2)
                draw.text((bx, by), opt_labels[oidx], fill=(255, 255, 255, 255), font=font_badge, anchor="mm")
                opt_str = str(options[oidx])
                draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")

        elif shot_recipe == "ANSWER_REVEAL":
            q_text = str(shot_props.get("question") or "")
            options = list(shot_props.get("options") or [])
            correct_idx = shot_props.get("answerIndex", 0)
            if not isinstance(correct_idx, int):
                try:
                    correct_idx = int(correct_idx)
                except Exception:
                    correct_idx = 0
            correct_val = shot_props.get("correctOption") or shot_props.get("answer")
            if not options and correct_val:
                options = [str(correct_val)]
                correct_idx = 0
            elif correct_val and 0 <= correct_idx < len(options):
                options[correct_idx] = str(correct_val)
            explanation = str(shot_props.get("explanation") or shot_props.get("caption") or "")

            card_top = 320
            card_bottom = 1380
            divider_y = card_top + 190

            glass_frame = self._get_design_pack_layer(pack_id, "glass_card_frame")
            if glass_frame:
                img.alpha_composite(glass_frame)
                draw = ImageDraw.Draw(img)
            else:
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=(11, 18, 32, 248), outline=(34, 197, 94, 220), width=3)

            # Answer Reveal Tag Pill (Canva Punch or Native Emerald Pill)
            punch_layer = self._get_design_pack_layer(pack_id, "reveal_punch")
            if punch_layer:
                img.alpha_composite(punch_layer)
                draw = ImageDraw.Draw(img)
            else:
                draw.rounded_rectangle([self.width // 2 - 160, card_top - 28, self.width // 2 + 160, card_top + 26], radius=27, fill=(34, 197, 94, 250), outline=(255, 255, 255, 255), width=2)

            font_tag = self._get_font(28)
            draw.text((self.width // 2, card_top - 1), "CORRECT ANSWER", fill=(255, 255, 255, 255) if punch_layer else (11, 18, 32, 255), font=font_tag, anchor="mm")

            # Question text
            if q_text:
                font_q = self._get_font(38)
                self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 95, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Divider
            divider_y = card_top + 190
            draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=(34, 197, 94, 80), width=2)

            # Options in reveal state
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)

            tmpl_id = str(scene_props.get("template_id") or shot_props.get("template_id") or scene_props.get("templateId") or shot_props.get("templateId") or "")
            is_v2 = "v2" in tmpl_id or tmpl_id.endswith(".v2") or bool(pack_id)

            if is_v2:
                for oidx in range(min(4, len(options))):
                    opt_y = divider_y + 20 + oidx * 125
                    box = [left_margin + 25, opt_y, right_margin - 25, opt_y + 105]
                    is_correct = (oidx == correct_idx)

                    if is_correct:
                        # Vibrant Emerald Green fill + crisp white bold text + active indicator bar
                        draw.rounded_rectangle(box, radius=18, fill=(16, 95, 48, 245), outline=(52, 211, 153, 255), width=3)
                        draw.rounded_rectangle([box[0], box[1], box[0] + 10, box[3]], radius=5, fill=(52, 211, 153, 255))
                        bx, by = left_margin + 85, opt_y + 52
                        draw.ellipse([bx - 28, by - 28, bx + 28, by + 28], fill=(34, 197, 94, 255), outline=(255, 255, 255, 255), width=2)
                        draw.line([(bx - 10, by), (bx - 3, by + 8), (bx + 11, by - 8)], fill=(11, 18, 32, 255), width=4)
                        opt_str = str(options[oidx])
                        draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")
                    else:
                        # Softly dim unselected incorrect options in V2
                        draw.rounded_rectangle(box, radius=18, fill=(13, 20, 36, 140), outline=(51, 65, 85, 70), width=1)
                        bx, by = left_margin + 85, opt_y + 52
                        draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(255, 255, 255, 10), outline=(255, 255, 255, 30), width=1)
                        draw.text((bx, by), opt_labels[oidx], fill=(100, 116, 139, 200), font=font_badge, anchor="mm")
                        opt_str = str(options[oidx])
                        draw.text((left_margin + 135, by), opt_str, fill=(100, 116, 139, 200), font=font_opt, anchor="lm")
            else:
                for oidx in range(min(4, len(options))):
                    opt_y = divider_y + 20 + oidx * 125
                    box = [left_margin + 25, opt_y, right_margin - 25, opt_y + 105]
                    is_correct = (oidx == correct_idx)

                    if is_correct:
                        # Vibrant Emerald Green fill + crisp white bold text (>12:1 contrast ratio)
                        draw.rounded_rectangle(box, radius=18, fill=(22, 101, 52, 235), outline=(34, 197, 94, 255), width=3)
                        # Active left indicator bar (Movin style)
                        draw.rounded_rectangle([box[0], box[1], box[0] + 8, box[3]], radius=4, fill=(34, 197, 94, 255))
                        bx, by = left_margin + 85, opt_y + 52
                        draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(34, 197, 94, 255), outline=(255, 255, 255, 255), width=2)
                        # Vector checkmark
                        draw.line([(bx - 10, by), (bx - 3, by + 8), (bx + 11, by - 8)], fill=(11, 18, 32, 255), width=4)
                        opt_str = str(options[oidx])
                        draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")
                    else:
                        draw.rounded_rectangle(box, radius=18, fill=(18, 28, 50, 120), outline=(255, 255, 255, 25), width=1)
                        bx, by = left_margin + 85, opt_y + 52
                        draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(255, 255, 255, 20), outline=(255, 255, 255, 40), width=1)
                        draw.text((bx, by), opt_labels[oidx], fill=(148, 163, 184, 255), font=font_badge, anchor="mm")
                        opt_str = str(options[oidx])
                        draw.text((left_margin + 135, by), opt_str, fill=(148, 163, 184, 255), font=font_opt, anchor="lm")

            if explanation:
                exp_y = divider_y + 20 + 4 * 125 + 15
                exp_layer = self._get_design_pack_layer(pack_id, "explanation_card")
                if exp_layer:
                    img.alpha_composite(exp_layer)
                    draw = ImageDraw.Draw(img)
                else:
                    draw.rounded_rectangle([left_margin + 20, exp_y, right_margin - 20, exp_y + 135], radius=16, fill=(5, 10, 20, 250), outline=(56, 189, 248, 200), width=2)
                font_exp = self._get_font(28)
                self._draw_wrapped_text(draw, f"💡 {explanation}", self.width // 2, exp_y + 68, content_width - 80, font_exp, (56, 189, 248, 255), "mm")

        elif shot_recipe == "MAP_ZOOM":
            region = str(shot_props.get("region") or shot_props.get("title") or "THE HISTORICAL THEATER").upper()
            coords = str(shot_props.get("coordinates") or shot_props.get("era") or "HISTORICAL GEOGRAPHY")
            desc = str(shot_props.get("description") or scene_props.get("narration_text") or "")
            card_top = center_y - 220
            card_bottom = center_y + 220
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(28, 25, 23, 235), outline=(217, 119, 6, 255), width=3)
            font_cr = self._get_font(30)
            draw.rounded_rectangle([self.width // 2 - 160, card_top - 25, self.width // 2 + 160, card_top + 25], radius=20, fill=(217, 119, 6, 255))
            draw.text((self.width // 2, card_top), coords, fill=(255, 255, 255, 255), font=font_cr, anchor="mm")
            font_rg = self._get_font(46)
            draw.text((self.width // 2, card_top + 90), region, fill=(250, 247, 237, 255), font=font_rg, anchor="mm")
            draw.line([(left_margin + 50, card_top + 150), (right_margin - 50, card_top + 150)], fill=(217, 119, 6, 120), width=2)
            if desc:
                font_md = self._get_font(36)
                self._draw_wrapped_text(draw, desc, self.width // 2, card_top + 270, content_width - 80, font_md, (214, 211, 209, 255), "mm")

        elif shot_recipe == "OUTRO_CTA":
            cta_title = str(shot_props.get("cta") or shot_props.get("title") or "FOLLOW FOR MORE").upper()
            sub_text = str(shot_props.get("subtitle") or "Drop your thoughts in the comments")
            font_ct = self._get_font(44)
            font_cs = self._get_font(32)
            card_top = center_y - 160
            card_bottom = center_y + 160

            outro_layer = self._get_design_pack_layer(pack_id, "outro_card")
            if outro_layer:
                img.alpha_composite(outro_layer)
                draw = ImageDraw.Draw(img)
            else:
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=32, fill=(99, 102, 241, 230), outline=(248, 250, 252, 255), width=3)

            draw.text((self.width // 2, center_y - 45), cta_title, fill=(255, 255, 255, 255), font=font_ct, anchor="mm")
            self._draw_wrapped_text(draw, sub_text, self.width // 2, center_y + 40, content_width - 80, font_cs, (224, 231, 255, 255), "mm")

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
            asset_frame = shot_props.get("asset_frame")
            img_path = shot_props.get("image_path") or shot_props.get("imageRef") or shot_props.get("path")
            has_rendered_image = False
            if isinstance(asset_frame, Image.Image):
                try:
                    from PIL import ImageOps
                    card_top = center_y - 340
                    card_bottom = center_y + 340
                    fitted = ImageOps.fit(asset_frame.convert("RGBA"), (content_width, card_bottom - card_top), Image.Resampling.LANCZOS)
                    img.paste(fitted, (left_margin, card_top), fitted)
                    draw.rectangle([left_margin, card_top, right_margin, card_bottom], outline=(255, 255, 255, 120), width=3)
                    has_rendered_image = True
                except Exception:
                    pass

            clean_path = self._clean_image_path(img_path)
            if not has_rendered_image and clean_path:
                import os
                if os.path.exists(clean_path):
                    try:
                        from PIL import ImageOps
                        src_raw = Image.open(clean_path).convert("RGBA")
                        card_top = center_y - 240
                        card_bottom = center_y + 240
                        fitted = ImageOps.fit(src_raw, (content_width, card_bottom - card_top), Image.Resampling.LANCZOS)
                        img.paste(fitted, (left_margin, card_top), fitted)
                        draw.rectangle([left_margin, card_top, right_margin, card_bottom], outline=(255, 255, 255, 120), width=3)
                        has_rendered_image = True
                    except Exception:
                        pass
                else:
                    if shot_props.get("strict_production") is True or shot_props.get("fail_on_missing_asset") is True or scene_props.get("strict_production") is True:
                        raise FileNotFoundError(f"[RENDER_ERROR: MISSING_MANDATORY_ASSET] Mandatory visual asset does not exist: {img_path}")
                    # Make missing required visual assets observable: never silently swallow or mask missing topic imagery
                    card_top = center_y - 200
                    card_bottom = center_y + 200
                    draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=20, fill=(45, 15, 15, 235), outline=(239, 68, 68, 255), width=3)
                    font_err = self._get_font(32)
                    missing_name = os.path.basename(clean_path)
                    self._draw_wrapped_text(draw, f"[OBSERVABLE DEFECT: MISSING ASSET '{missing_name}']", self.width // 2, center_y, content_width - 80, font_err, (252, 165, 165, 255), "mm")
                    has_rendered_image = True

            if not has_rendered_image:
                card_top = center_y - 160
                card_bottom = center_y + 160
                draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=24, fill=(30, 41, 59, 200), outline=(71, 85, 105, 255), width=2)
                sub_text = shot_props.get("caption") or scene_props.get("narration_text") or "Production Scene Beat"
                font_body = self._get_font(42)
                self._draw_wrapped_text(draw, sub_text, self.width // 2, center_y, content_width - 80, font_body, (241, 245, 249, 255), "mm")

        # Render Captions / Subtitles in Lower Third with dedicated high-contrast background pill
        family = str(scene_props.get("format_family") or scene_props.get("content_engine") or shot_props.get("visual_family") or "").upper()
        if "QUIZ" in family or "QUESTION" in shot_recipe or "COUNTDOWN" in shot_recipe or "ANSWER" in shot_recipe:
            caption_y = 1490
        else:
            caption_y = self.height - safe_bottom - 60
        if caption_text:
            font_cap = self._get_font(48)
            cleaned_caption = self._sanitize_unicode(caption_text)
            cap_lines = self._wrap_text(cleaned_caption, font_cap, content_width - 80)
            if cap_lines:
                line_height = 58
                box_height = len(cap_lines) * line_height + 28
                max_line_w = 0
                for line in cap_lines:
                    bbox = font_cap.getbbox(line)
                    lw = bbox[2] - bbox[0]
                    if lw > max_line_w:
                        max_line_w = lw
                box_width = min(content_width, max_line_w + 64)
                box_left = (self.width - box_width) // 2
                box_top = caption_y - (box_height // 2)

                draw.rounded_rectangle(
                    [box_left, box_top, box_left + box_width, box_top + box_height],
                    radius=16,
                    fill=(5, 10, 20, 225),
                    outline=(255, 255, 255, 60),
                    width=2,
                )
                start_text_y = box_top + 14 + (line_height // 2)
                for i, line in enumerate(cap_lines):
                    y_pos = start_text_y + (i * line_height)
                    draw.text((self.width // 2, y_pos), line, fill=(254, 240, 138, 255), font=font_cap, anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0, 255))

        # Global ShortForge Branding Watermark Layer (docs/design/global-brand.md)
        if not scene_props.get("transparent"):
            wm = self._get_watermark()
            if wm:
                img.paste(wm, (940, 1800), wm)

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
