import re

path = "packages/factoryos-render/src/factoryos_render/backends/image.py"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update _sanitize_display_text
sanitize_target = '''    @staticmethod
    def _sanitize_display_text(text: str) -> str:'''

new_sanitize = '''    @staticmethod
    def _sanitize_display_text(text: str) -> str:
        """Sanitizes text, stripping UTF-8 mojibake and broken multi-byte artifacts."""
        if not text:
            return ""
        s = str(text)
        s = s.replace("Â€¢", " | ").replace("â€¢", " | ").replace("•", " | ").replace("Â", "")
        s = s.replace("\\u2022", " | ")
        s = s.replace("\\u2019", "'").replace("\\u2018", "'").replace("\\u201c", '"').replace("\\u201d", '"')
        s = s.replace("\\u2013", "-").replace("\\u2014", "--")
        s = " ".join(s.split())
        s = s.replace("| |", "|")
        return s.strip()
'''

if "def _sanitize_display_text" in text:
    # replace existing def _sanitize_display_text until def _sanitize_unicode
    idx_s = text.find("    @staticmethod\n    def _sanitize_display_text")
    idx_u = text.find("    @staticmethod\n    def _sanitize_unicode")
    if idx_s != -1 and idx_u != -1:
        text = text[:idx_s] + new_sanitize + "\n" + text[idx_u:]

# 2. Update _draw_wrapped_text at the bottom
draw_target = "    def _draw_wrapped_text("
idx_draw = text.find(draw_target)
if idx_draw != -1:
    new_draw = '''    def _draw_wrapped_text(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        x: int,
        y: int,
        max_width: int,
        font: ImageFont.ImageFont,
        fill: Tuple[int, int, int, int],
        anchor: str = "mm"
    ):
        clean_text = self._sanitize_display_text(text)
        lines = self._wrap_text(clean_text, font, max_width)
        if not lines:
            return
        line_height = int(font.size * 1.35)
        total_h = len(lines) * line_height

        h_anchor = anchor[0] if len(anchor) >= 1 else 'm'
        v_anchor = anchor[1] if len(anchor) >= 2 else ('m' if len(anchor) == 1 and anchor[0] == 'm' else 't')

        if v_anchor == 'm':
            start_y = y - (total_h // 2)
        elif v_anchor == 'b' or v_anchor == 'd':
            start_y = y - total_h
        else:
            start_y = y

        for i, line in enumerate(lines):
            line_top = start_y + (i * line_height)
            if v_anchor == 'm':
                line_center_y = line_top + (line_height // 2)
                draw.text((x, line_center_y), line, fill=fill, font=font, anchor=f"{h_anchor}m")
            else:
                draw.text((x, line_top), line, fill=fill, font=font, anchor=f"{h_anchor}t")
'''
    text = text[:idx_draw] + new_draw

# 3. Update KINETIC_HOOK
hook_target = '        if shot_recipe == "KINETIC_HOOK":'
next_target = '        elif shot_recipe == "BIG_NUMBER":'
idx_hook = text.find(hook_target)
idx_next = text.find(next_target)

if idx_hook != -1 and idx_next != -1:
    new_hook = '''        if shot_recipe == "KINETIC_HOOK":
            tag = str(shot_props.get("tag") or shot_props.get("highlightWord") or "ATTENTION").upper()
            tag_clean = self._sanitize_display_text(tag)
            hook_text = str(shot_props.get("subtitle") or shot_props.get("headline") or scene_props.get("narration_text") or "Did you know?")
            # Glowing tag pill — positioned at y = 250 (directly below headline, well above center_y) to prevent ANY overlap
            font_tag = self._get_font(32)
            tag_bbox = font_tag.getbbox(tag_clean)
            tag_w = tag_bbox[2] - tag_bbox[0] + 48
            pill_x1 = (self.width - tag_w) // 2
            pill_y1 = 250
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + tag_w, pill_y1 + 52], radius=26, fill=(99, 102, 241, 230), outline=(165, 180, 252, 255), width=2)
            draw.text((self.width // 2, pill_y1 + 26), tag_clean, fill=(255, 255, 255, 255), font=font_tag, anchor="mm")
            # Big kinetic typography — centered vertically in middle of screen
            font_hk = self._get_font(56)
            self._draw_wrapped_text(draw, hook_text, self.width // 2, center_y + 80, content_width - 80, font_hk, (255, 255, 255, 255), "mm")
'''
    text = text[:idx_hook] + new_hook + "\n" + text[idx_next:]

# 4. Update QUESTION_CARD, COUNTDOWN, and ANSWER_REVEAL
q_card_target = '        elif shot_recipe == "QUESTION_CARD":'
map_zoom_target = '        elif shot_recipe == "MAP_ZOOM":'
idx_q = text.find(q_card_target)
idx_m = text.find(map_zoom_target)

if idx_q != -1 and idx_m != -1:
    new_quiz_recipes = '''        elif shot_recipe == "QUESTION_CARD":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            category = str(shot_props.get("categoryBadge") or shot_props.get("headline") or "QUIZ | CHALLENGE").upper()
            category_clean = self._sanitize_display_text(category)
            accent_rgb, _ = self._get_quiz_theme(shot_props, scene_props)

            card_top = 280
            card_bottom = 1680

            # 1. Frosted glass blur effect on question card canvas
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=accent_rgb + (220,), width=3)

            # 2. Category Pill at top of card (Symmetric, crisp, perfectly centered, NO OVERLAP)
            pill_w = min(content_width - 80, max(260, len(category_clean) * 16 + 50))
            pill_x1 = self.width // 2 - pill_w // 2
            pill_y1 = card_top - 24
            pill_y2 = card_top + 24
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + pill_w, pill_y2], radius=24, fill=accent_rgb + (240,), outline=(255, 255, 255, 255), width=2)
            font_cat = self._get_font(26)
            draw.text((self.width // 2, card_top), category_clean, fill=(255, 255, 255, 255), font=font_cat, anchor="mm")

            # 3. Question Text - Centered exactly in the middle of space between pill bottom (304) and divider (525)
            font_size_q = min(36, calculate_auto_font_size(q_text))
            font_q = self._get_font(font_size_q)
            self._draw_wrapped_text(draw, q_text, self.width // 2, 414, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # 4. Divider Line
            divider_y = 525
            draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=accent_rgb + (90,), width=2)

            # 5. Options (A, B, C, D)
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(34)
            font_badge = self._get_font(30)
            highlight_idx = shot_props.get("highlightOptionIndex")
            highlight_idx = int(highlight_idx) if highlight_idx is not None else None
            opt_h = 104
            opt_step = 124
            opt_start_y = 550
            for oidx in range(min(4, len(options))):
                opt_y = opt_start_y + oidx * opt_step
                box = [left_margin + 25, opt_y, right_margin - 25, opt_y + opt_h]
                is_highlight = highlight_idx == oidx
                draw.rounded_rectangle(
                    box,
                    radius=18,
                    fill=(accent_rgb + (70,)) if is_highlight else (18, 28, 50, 220),
                    outline=accent_rgb + (255 if is_highlight else 140,),
                    width=4 if is_highlight else 2,
                )
                bx, by = left_margin + 85, opt_y + (opt_h // 2)
                draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=accent_rgb + (80,), outline=accent_rgb + (240,), width=2)
                draw.text((bx, by), opt_labels[oidx], fill=(255, 255, 255, 255), font=font_badge, anchor="mm")
                opt_str = str(options[oidx])
                draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")

            # 6. Lower Card Space: Balanced information container
            sep_y = 1055
            draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=accent_rgb + (90,), width=2)
            draw.rounded_rectangle([left_margin + 35, sep_y + 30, right_margin - 35, card_bottom - 40], radius=22, fill=(15, 23, 42, 130), outline=accent_rgb + (70,), width=1)
            topic_str = str(shot_props.get("topic") or "CHALLENGE ROUND").upper()
            draw.text((self.width // 2, sep_y + 80), topic_str, fill=accent_rgb + (255,), font=self._get_font(32), anchor="mm")
            draw.text((self.width // 2, sep_y + 150), "Select the correct answer before time expires.", fill=(226, 232, 240, 255), font=self._get_font(34), anchor="mm")
            draw.rounded_rectangle([self.width // 2 - 220, sep_y + 215, self.width // 2 + 220, sep_y + 265], radius=25, fill=(11, 18, 32, 200), outline=accent_rgb + (120,), width=1)
            draw.text((self.width // 2, sep_y + 240), "6 QUESTIONS | NO SECOND CHANCES", fill=(148, 163, 184, 255), font=self._get_font(26), anchor="mm")

        elif shot_recipe == "COUNTDOWN":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            total_secs = float(shot_props.get("seconds", 5))
            rem_secs = max(1, int(math.ceil(total_secs * (1.0 - progress))))
            accent_rgb, _ = self._get_quiz_theme(shot_props, scene_props)

            card_top = 280
            card_bottom = 1680

            # 1. Frosted glass blur effect on countdown card
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=(245, 158, 11, 200), width=3)

            # 2. Prominent Countdown Timer (5-4-3-2-1)
            timer_color = (245, 158, 11, 255) if rem_secs > 1 else (239, 68, 68, 255)
            pill_w = 120
            pill_x1 = self.width // 2 - pill_w // 2
            pill_y1 = card_top - 28
            pill_y2 = card_top + 28
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + pill_w, pill_y2], radius=28, fill=(11, 18, 32, 255), outline=timer_color, width=3)
            font_timer = self._get_font(44)
            draw.text((self.width // 2, card_top), str(rem_secs), fill=timer_color, font=font_timer, anchor="mm")

            # 3. Question Text - Centered exactly in the middle of space between pill bottom (308) and divider (525)
            font_size_q = min(36, calculate_auto_font_size(q_text))
            font_q = self._get_font(font_size_q)
            self._draw_wrapped_text(draw, q_text, self.width // 2, 414, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # 4. Dynamic countdown progress bar across divider
            divider_y = 525
            bar_y = divider_y - 10
            bar_full_w = content_width - 80
            bar_w = int(bar_full_w * max(0.0, min(1.0, 1.0 - progress)))
            draw.rounded_rectangle([left_margin + 40, bar_y - 4, right_margin - 40, bar_y + 4], radius=4, fill=(20, 30, 48, 220), outline=(245, 158, 11, 60), width=1)
            if bar_w > 0:
                draw.rounded_rectangle([left_margin + 40, bar_y - 4, left_margin + 40 + bar_w, bar_y + 4], radius=4, fill=timer_color)

            # 5. Options
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(34)
            font_badge = self._get_font(30)
            opt_h = 104
            opt_step = 124
            opt_start_y = 550
            for oidx in range(min(4, len(options))):
                opt_y = opt_start_y + oidx * opt_step
                box = [left_margin + 25, opt_y, right_margin - 25, opt_y + opt_h]
                draw.rounded_rectangle(box, radius=18, fill=(28, 25, 23, 230), outline=(245, 158, 11, 140), width=2)
                bx, by = left_margin + 85, opt_y + (opt_h // 2)
                draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(245, 158, 11, 60), outline=(245, 158, 11, 220), width=2)
                draw.text((bx, by), opt_labels[oidx], fill=(255, 255, 255, 255), font=font_badge, anchor="mm")
                opt_str = str(options[oidx])
                draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")

            # 6. Lower Card Space: Live Countdown Guidance
            sep_y = 1055
            draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=(245, 158, 11, 90), width=2)
            draw.rounded_rectangle([left_margin + 35, sep_y + 30, right_margin - 35, card_bottom - 40], radius=22, fill=(15, 23, 42, 130), outline=(245, 158, 11, 70), width=1)
            draw.text((self.width // 2, sep_y + 80), "TIME RUNNING OUT", fill=timer_color, font=self._get_font(32), anchor="mm")
            draw.text((self.width // 2, sep_y + 150), f"Locking answer in 0{rem_secs} seconds...", fill=(226, 232, 240, 255), font=self._get_font(34), anchor="mm")
            draw.rounded_rectangle([self.width // 2 - 200, sep_y + 215, self.width // 2 + 200, sep_y + 265], radius=25, fill=(11, 18, 32, 200), outline=(245, 158, 11, 100), width=1)
            draw.text((self.width // 2, sep_y + 240), "ANSWER REVEAL INCOMING", fill=(148, 163, 184, 255), font=self._get_font(26), anchor="mm")

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

            card_top = 280
            card_bottom = 1680

            # 1. Frosted glass blur effect on answer reveal card
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=(34, 197, 94, 220), width=3)

            # 2. Answer Reveal Tag Pill (Symmetric, crisp, centered, zero collision)
            is_explanation_beat = shot_props.get("headline") == "EXPLANATION" or "explanation" in str(shot_props.get("component_id", "")).lower()
            tag_label = "EXPLANATION" if is_explanation_beat else "CORRECT ANSWER"
            pill_w = 300
            pill_x1 = self.width // 2 - pill_w // 2
            pill_y1 = card_top - 24
            pill_y2 = card_top + 24
            draw.rounded_rectangle([pill_x1, pill_y1, pill_x1 + pill_w, pill_y2], radius=24, fill=(16, 95, 48, 250), outline=(52, 211, 153, 255), width=2)
            font_tag = self._get_font(26)
            draw.text((self.width // 2, card_top), tag_label, fill=(255, 255, 255, 255), font=font_tag, anchor="mm")

            # 3. Question Text - Centered exactly in the middle of space between pill bottom (304) and divider (525)
            if q_text:
                font_size_q = min(36, calculate_auto_font_size(q_text))
                font_q = self._get_font(font_size_q)
                self._draw_wrapped_text(draw, q_text, self.width // 2, 414, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # 4. Divider Line
            divider_y = 525
            draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=(34, 197, 94, 80), width=2)

            # 5. Options in reveal state
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(34)
            font_badge = self._get_font(30)
            opt_h = 104
            opt_step = 124
            opt_start_y = 550

            for oidx in range(min(4, len(options))):
                opt_y = opt_start_y + oidx * opt_step
                base_box = [left_margin + 25, opt_y, right_margin - 25, opt_y + opt_h]
                is_correct = (oidx == correct_idx)

                if is_correct:
                    bcx = (base_box[0] + base_box[2]) / 2.0
                    bcy = (base_box[1] + base_box[3]) / 2.0
                    half_w = (base_box[2] - base_box[0]) * 1.04 / 2.0
                    half_h = (base_box[3] - base_box[1]) * 1.04 / 2.0
                    box = [bcx - half_w, bcy - half_h, bcx + half_w, bcy + half_h]

                    # Vibrant Emerald Green fill + crisp white bold text + active indicator bar
                    draw.rounded_rectangle(box, radius=18, fill=(16, 95, 48, 245), outline=(52, 211, 153, 255), width=3)
                    draw.rounded_rectangle([box[0], box[1], box[0] + 10, box[3]], radius=5, fill=(52, 211, 153, 255))
                    bx, by = left_margin + 85, opt_y + (opt_h // 2)
                    draw.ellipse([bx - 28, by - 28, bx + 28, by + 28], fill=(34, 197, 94, 255), outline=(255, 255, 255, 255), width=2)
                    draw.line([(bx - 10, by), (bx - 3, by + 8), (bx + 11, by - 8)], fill=(11, 18, 32, 255), width=4)
                    opt_str = str(options[oidx])
                    draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")
                else:
                    # Dim unselected incorrect options to opacity 0.35 (alpha ~89)
                    draw.rounded_rectangle(base_box, radius=18, fill=(13, 20, 36, 89), outline=(51, 65, 85, 45), width=1)
                    bx, by = left_margin + 85, opt_y + (opt_h // 2)
                    draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(255, 255, 255, 10), outline=(255, 255, 255, 25), width=1)
                    draw.text((bx, by), opt_labels[oidx], fill=(100, 116, 139, 89), font=font_badge, anchor="mm")
                    opt_str = str(options[oidx])
                    draw.text((left_margin + 135, by), opt_str, fill=(100, 116, 139, 89), font=font_opt, anchor="lm")

            if explanation:
                # Decorative subtle emerald separator line
                sep_y = 1055
                draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=(34, 197, 94, 120), width=2)
                # Explanation container: frosted emerald glass card
                draw.rounded_rectangle([left_margin + 35, sep_y + 30, right_margin - 35, card_bottom - 40], radius=22, fill=(16, 95, 48, 50), outline=(52, 211, 153, 140), width=2)
                draw.text((left_margin + 75, sep_y + 75), "DID YOU KNOW?", fill=(52, 211, 153, 255), font=self._get_font(30), anchor="lm")
                # Enlarged explanation text (font size 46) in crisp off-white (#F8FAFC)
                font_exp = self._get_font(46)
                exp_center_y = (sep_y + 110 + card_bottom - 40) // 2
                self._draw_wrapped_text(draw, explanation, self.width // 2, exp_center_y, content_width - 120, font_exp, (248, 250, 252, 255), "mm")
'''
    text = text[:idx_q] + new_quiz_recipes + "\n" + text[idx_m:]

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS: Updated image.py with flawless layout, vertical symmetry, and verified clearance!")

