import re

path = "packages/factoryos-render/src/factoryos_render/backends/image.py"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Replace QUESTION_CARD, COUNTDOWN, and ANSWER_REVEAL blocks in image.py
old_block_start = '        elif shot_recipe == "QUESTION_CARD":'
old_block_end = '        elif shot_recipe == "MAP_ZOOM":'

start_idx = text.find(old_block_start)
end_idx = text.find(old_block_end)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR: Could not find block indices: start={start_idx}, end={end_idx}")
    exit(1)

new_block = '''        elif shot_recipe == "QUESTION_CARD":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            category = str(shot_props.get("categoryBadge") or shot_props.get("headline") or "QUIZ CHALLENGE").upper()
            accent_rgb, _ = self._get_quiz_theme(shot_props, scene_props)

            card_top = 280
            card_bottom = 1680
            divider_y = card_top + 210

            # Frosted glass blur effect on question card
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=accent_rgb + (200,), width=3)

            # Category Pill at top
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

            # Question Text - Crisp pure white sitting directly on card canvas
            font_size_q = calculate_auto_font_size(q_text)
            font_q = self._get_font(font_size_q)
            self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 105, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Divider / Track
            track_layer = self._get_design_pack_layer(pack_id, "progress_track")
            if track_layer:
                img.alpha_composite(track_layer)
                draw = ImageDraw.Draw(img)
            else:
                draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=accent_rgb + (80,), width=2)

            # Options (A, B, C, D) - Evenly distributed across upper card
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)
            highlight_idx = shot_props.get("highlightOptionIndex")
            highlight_idx = int(highlight_idx) if highlight_idx is not None else None
            opt_h = 108
            opt_step = 130
            for oidx in range(min(4, len(options))):
                opt_y = divider_y + 25 + oidx * opt_step
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

            # Lower Card Space: Balanced information container
            sep_y = divider_y + 25 + 4 * opt_step + 15
            draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=accent_rgb + (90,), width=2)
            draw.rounded_rectangle([left_margin + 35, sep_y + 35, right_margin - 35, card_bottom - 45], radius=22, fill=(15, 23, 42, 130), outline=accent_rgb + (70,), width=1)
            topic_str = str(shot_props.get("topic") or "CHALLENGE ROUND").upper()
            draw.text((self.width // 2, sep_y + 85), topic_str, fill=accent_rgb + (255,), font=self._get_font(32), anchor="mm")
            draw.text((self.width // 2, sep_y + 155), "Select the correct answer before time expires.", fill=(226, 232, 240, 255), font=self._get_font(34), anchor="mm")
            draw.rounded_rectangle([self.width // 2 - 200, sep_y + 215, self.width // 2 + 200, sep_y + 265], radius=25, fill=(11, 18, 32, 200), outline=accent_rgb + (120,), width=1)
            draw.text((self.width // 2, sep_y + 240), "6 QUESTIONS • NO SECOND CHANCES", fill=(148, 163, 184, 255), font=self._get_font(26), anchor="mm")

        elif shot_recipe == "COUNTDOWN":
            q_text = str(shot_props.get("question") or scene_props.get("narration_text") or "")
            options = shot_props.get("options") or ["Option A", "Option B", "Option C", "Option D"]
            total_secs = float(shot_props.get("seconds", 5))
            rem_secs = max(1, int(math.ceil(total_secs * (1.0 - progress))))
            accent_rgb, _ = self._get_quiz_theme(shot_props, scene_props)

            card_top = 280
            card_bottom = 1680
            divider_y = card_top + 210

            # Frosted glass blur effect on countdown card
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=(245, 158, 11, 200), width=3)

            # Prominent Countdown Timer (5-4-3-2-1)
            timer_color = (245, 158, 11, 255) if rem_secs > 1 else (239, 68, 68, 255)
            pill_w = 120
            draw.rounded_rectangle([self.width // 2 - pill_w // 2, card_top - 34, self.width // 2 + pill_w // 2, card_top + 34], radius=34, fill=(11, 18, 32, 255), outline=timer_color, width=3)
            font_timer = self._get_font(46)
            draw.text((self.width // 2, card_top), str(rem_secs), fill=timer_color, font=font_timer, anchor="mm")

            # Question Text - Crisp pure white
            font_size_q = calculate_auto_font_size(q_text)
            font_q = self._get_font(font_size_q)
            self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 105, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Dynamic countdown progress bar across divider
            bar_y = divider_y - 12
            bar_full_w = content_width - 80
            bar_w = int(bar_full_w * max(0.0, min(1.0, 1.0 - progress)))
            draw.rounded_rectangle([left_margin + 40, bar_y - 4, right_margin - 40, bar_y + 4], radius=4, fill=(20, 30, 48, 220), outline=(245, 158, 11, 60), width=1)
            if bar_w > 0:
                draw.rounded_rectangle([left_margin + 40, bar_y - 4, left_margin + 40 + bar_w, bar_y + 4], radius=4, fill=timer_color)

            # Options
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)
            opt_h = 108
            opt_step = 130
            for oidx in range(min(4, len(options))):
                opt_y = divider_y + 25 + oidx * opt_step
                box = [left_margin + 25, opt_y, right_margin - 25, opt_y + opt_h]
                draw.rounded_rectangle(box, radius=18, fill=(28, 25, 23, 230), outline=(245, 158, 11, 140), width=2)
                bx, by = left_margin + 85, opt_y + (opt_h // 2)
                draw.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=(245, 158, 11, 60), outline=(245, 158, 11, 220), width=2)
                draw.text((bx, by), opt_labels[oidx], fill=(255, 255, 255, 255), font=font_badge, anchor="mm")
                opt_str = str(options[oidx])
                draw.text((left_margin + 135, by), opt_str, fill=(255, 255, 255, 255), font=font_opt, anchor="lm")

            # Lower Card Space: Live Countdown Guidance
            sep_y = divider_y + 25 + 4 * opt_step + 15
            draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=(245, 158, 11, 90), width=2)
            draw.rounded_rectangle([left_margin + 35, sep_y + 35, right_margin - 35, card_bottom - 45], radius=22, fill=(15, 23, 42, 130), outline=(245, 158, 11, 70), width=1)
            draw.text((self.width // 2, sep_y + 85), "TIME RUNNING OUT", fill=timer_color, font=self._get_font(32), anchor="mm")
            draw.text((self.width // 2, sep_y + 155), f"Locking answer in 0{rem_secs} seconds...", fill=(226, 232, 240, 255), font=self._get_font(34), anchor="mm")
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
            divider_y = card_top + 210

            # Frosted glass blur effect on answer reveal card
            card_region = img.crop((left_margin, card_top, right_margin, card_bottom))
            card_blurred = card_region.filter(ImageFilter.GaussianBlur(radius=28))
            frost_overlay = Image.new("RGBA", card_blurred.size, (11, 18, 32, 140))
            card_blurred.alpha_composite(frost_overlay)
            img.paste(card_blurred, (left_margin, card_top))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([left_margin, card_top, right_margin, card_bottom], radius=26, fill=None, outline=(34, 197, 94, 220), width=3)

            # Answer Reveal Tag Pill
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
                font_size_q = calculate_auto_font_size(q_text)
                font_q = self._get_font(font_size_q)
                self._draw_wrapped_text(draw, q_text, self.width // 2, card_top + 105, content_width - 80, font_q, (255, 255, 255, 255), "mm")

            # Divider
            draw.line([(left_margin + 40, divider_y), (right_margin - 40, divider_y)], fill=(34, 197, 94, 80), width=2)

            # Options in reveal state
            opt_labels = ["A", "B", "C", "D"]
            font_opt = self._get_font(36)
            font_badge = self._get_font(32)
            opt_h = 108
            opt_step = 130

            for oidx in range(min(4, len(options))):
                opt_y = divider_y + 25 + oidx * opt_step
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
                sep_y = divider_y + 25 + 4 * opt_step + 15
                draw.line([(left_margin + 60, sep_y), (right_margin - 60, sep_y)], fill=(34, 197, 94, 120), width=2)
                # Explanation container: frosted emerald glass card
                draw.rounded_rectangle([left_margin + 35, sep_y + 35, right_margin - 35, card_bottom - 45], radius=22, fill=(16, 95, 48, 50), outline=(52, 211, 153, 140), width=2)
                draw.text((left_margin + 75, sep_y + 80), "DID YOU KNOW?", fill=(52, 211, 153, 255), font=self._get_font(30), anchor="lm")
                # Enlarged explanation text (font size 46) in crisp off-white (#F8FAFC)
                font_exp = self._get_font(46)
                exp_center_y = (sep_y + 115 + card_bottom - 45) // 2
                self._draw_wrapped_text(draw, explanation, self.width // 2, exp_center_y, content_width - 120, font_exp, (248, 250, 252, 255), "mm")
'''

text = text[:start_idx] + new_block + "\n" + text[end_idx:]

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS: Updated image.py QUESTION_CARD, COUNTDOWN, and ANSWER_REVEAL blocks")

