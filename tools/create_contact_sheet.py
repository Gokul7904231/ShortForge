"""
Generates a high-resolution visual contact sheet for QuizShow v1.1 QA inspection.
Automatically grids all PNG frames in frames_dir (e.g. 12 frames in a 4x3 layout).
"""

import os
import sys
import glob
from PIL import Image, ImageDraw, ImageFont

def get_font(size: int):
    for f in [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()

def main():
    if len(sys.argv) < 3:
        print("Usage: python create_contact_sheet.py <frames_dir> <output_png>")
        sys.exit(1)

    frames_dir = sys.argv[1]
    output_png = sys.argv[2]

    # Find and sort frame files
    all_files = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    if not all_files:
        print(f"No frames found in {frames_dir}!")
        sys.exit(1)

    num_frames = len(all_files)
    cols = 4 if num_frames >= 8 else 3
    rows = (num_frames + cols - 1) // cols

    thumb_w, thumb_h = 320, 568
    padding = 20
    header_h = 50
    sheet_w = padding * (cols + 1) + thumb_w * cols
    sheet_h = padding * (rows + 1) + (thumb_h + header_h) * rows + 80

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (8, 14, 26, 255))
    draw = ImageDraw.Draw(sheet)

    title = sys.argv[3] if len(sys.argv) > 3 else "SHORTFORGE QUIZSHOW V1.2 — CANONICAL VISUAL QA CONTACT SHEET"
    subtitle = sys.argv[4] if len(sys.argv) > 4 else "6-Question Universal Mobile Game-Show Template (quiz.universal.glass.v1) • 1080x1920 (9:16) • WCAG AA Verified"

    # Title Banner
    font_title = get_font(30)
    font_sub = get_font(18)
    draw.text((sheet_w // 2, 32), title, fill=(0, 220, 255, 255), font=font_title, anchor="mm")
    draw.text((sheet_w // 2, 65), subtitle, fill=(148, 163, 184, 255), font=font_sub, anchor="mm")

    font_label = get_font(16)

    for idx, filepath in enumerate(all_files):
        col = idx % cols
        row = idx // cols

        x = padding + col * (thumb_w + padding)
        y = 90 + row * (thumb_h + header_h + padding)

        base = os.path.basename(filepath).replace(".png", "")
        # Format label from filename: frame_01_intro_hook -> 01: Intro Hook
        parts = base.split("_", 2)
        if len(parts) >= 3:
            label = f"{parts[1]}. {parts[2].replace('_', ' ').title()}"
        else:
            label = base.replace("_", " ").title()

        try:
            im = Image.open(filepath).convert("RGBA")
            im_resized = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            sheet.paste(im_resized, (x, y + header_h))
            draw.rectangle([x - 1, y + header_h - 1, x + thumb_w + 1, y + header_h + thumb_h + 1], outline=(0, 170, 255, 180), width=2)
        except Exception:
            draw.rectangle([x, y + header_h, x + thumb_w, y + header_h + thumb_h], fill=(20, 25, 40, 255), outline=(239, 68, 68, 200), width=2)
            draw.text((x + thumb_w // 2, y + header_h + thumb_h // 2), "ERROR LOADING", fill=(239, 68, 68, 255), font=font_label, anchor="mm")

        # Label pill
        draw.rounded_rectangle([x, y + 8, x + thumb_w, y + header_h - 8], radius=8, fill=(15, 23, 42, 240), outline=(0, 170, 255, 120), width=1)
        draw.text((x + thumb_w // 2, y + 21), label, fill=(255, 255, 255, 255), font=font_label, anchor="mm")

    os.makedirs(os.path.dirname(output_png) or ".", exist_ok=True)
    sheet.save(output_png, format="PNG")
    print(f"Generated visual contact sheet with {num_frames} frames: {output_png}")

if __name__ == "__main__":
    main()
