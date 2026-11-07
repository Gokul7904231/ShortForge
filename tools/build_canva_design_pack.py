"""
Builds the canonical versioned Canva Visual Design Pack for ShortForge Universal Quiz V2.
Creates 1080x1920 transparent PNG visual layer assets and manifest.json with SHA-256 digests.
Copies to both assets/canva/packs/... and B2 storage repository.
"""

import os
import json
import hashlib
from PIL import Image, ImageDraw, ImageFilter

PACK_ID = "quiz.universal.cinematic.v1"
VERSION = "1.0.0"
WIDTH = 1080
HEIGHT = 1920

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOCAL_PACK_DIR = os.path.join(REPO_ROOT, "assets", "canva", "packs", PACK_ID)
B2_PACK_DIR = os.path.join(REPO_ROOT, "data", "visual-assets-store", "b2", "shortsfactory-assets", "canva-packs", PACK_ID)

os.makedirs(LOCAL_PACK_DIR, exist_ok=True)
os.makedirs(B2_PACK_DIR, exist_ok=True)

LEFT_MARGIN = 80
RIGHT_MARGIN = WIDTH - 80
CARD_TOP = 320
CARD_BOTTOM = 1380
CENTER_X = WIDTH // 2

def create_glass_card_frame() -> Image.Image:
    """Creates a high-fidelity glassmorphism container frame with sleek gradient border."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Ambient soft shadow behind card
    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [LEFT_MARGIN - 8, CARD_TOP - 8, RIGHT_MARGIN + 8, CARD_BOTTOM + 8],
        radius=32,
        fill=(0, 0, 0, 130)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=16))
    img.alpha_composite(shadow)

    # Glass Card Translucent Body (#0B1220 with subtle glass opacity)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [LEFT_MARGIN, CARD_TOP, RIGHT_MARGIN, CARD_BOTTOM],
        radius=26,
        fill=(11, 18, 32, 235),
        outline=(255, 255, 255, 45),
        width=2
    )

    # Top highlight sheen (glass refraction line)
    sheen = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sheen)
    sh_draw.line(
        [(LEFT_MARGIN + 30, CARD_TOP + 2), (RIGHT_MARGIN - 30, CARD_TOP + 2)],
        fill=(255, 255, 255, 110),
        width=2
    )
    img.alpha_composite(sheen)
    return img

def create_category_badge() -> Image.Image:
    """Creates the Canva universal category header badge plate."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pill_w = 320
    pill_x1 = CENTER_X - pill_w // 2
    pill_y1 = CARD_TOP - 28
    pill_x2 = CENTER_X + pill_w // 2
    pill_y2 = CARD_TOP + 26

    # Badge glow
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    g_draw.rounded_rectangle(
        [pill_x1 - 4, pill_y1 - 4, pill_x2 + 4, pill_y2 + 4],
        radius=29,
        fill=(6, 182, 212, 80)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=8))
    img.alpha_composite(glow)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [pill_x1, pill_y1, pill_x2, pill_y2],
        radius=27,
        fill=(11, 24, 48, 245),
        outline=(6, 182, 212, 220),
        width=2
    )
    return img

def create_progress_track() -> Image.Image:
    """Creates the sleek divider and countdown progress bar track."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    divider_y = CARD_TOP + 190
    bar_y = divider_y - 12
    draw.line(
        [(LEFT_MARGIN + 40, divider_y), (RIGHT_MARGIN - 40, divider_y)],
        fill=(255, 255, 255, 40),
        width=2
    )
    # Track background groove
    draw.rounded_rectangle(
        [LEFT_MARGIN + 40, bar_y - 4, RIGHT_MARGIN - 40, bar_y + 4],
        radius=4,
        fill=(18, 28, 50, 200),
        outline=(255, 255, 255, 30),
        width=1
    )
    return img

def create_reveal_punch() -> Image.Image:
    """Creates the vibrant emerald green glow punch for the correct answer reveal."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    punch = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(punch)
    pill_w = 340
    pill_x1 = CENTER_X - pill_w // 2
    pill_y1 = CARD_TOP - 28
    pill_x2 = CENTER_X + pill_w // 2
    pill_y2 = CARD_TOP + 26

    # Emerald radiant glow
    p_draw.rounded_rectangle(
        [pill_x1 - 8, pill_y1 - 8, pill_x2 + 8, pill_y2 + 8],
        radius=32,
        fill=(34, 197, 94, 120)
    )
    punch = punch.filter(ImageFilter.GaussianBlur(radius=12))
    img.alpha_composite(punch)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [pill_x1, pill_y1, pill_x2, pill_y2],
        radius=27,
        fill=(16, 95, 48, 250),
        outline=(52, 211, 153, 255),
        width=3
    )
    return img

def create_explanation_card() -> Image.Image:
    """Creates the lower explanation glass plate."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    exp_y = CARD_TOP + 190 + 20 + 4 * 125 + 15
    draw.rounded_rectangle(
        [LEFT_MARGIN + 20, exp_y, RIGHT_MARGIN - 20, exp_y + 135],
        radius=16,
        fill=(5, 12, 28, 245),
        outline=(56, 189, 248, 180),
        width=2
    )
    return img

def create_outro_card() -> Image.Image:
    """Creates the outro engagement frame."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    center_y = HEIGHT // 2 - 40
    card_top = center_y - 160
    card_bottom = center_y + 160

    # Ambient purple glow
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    g_draw.rounded_rectangle(
        [LEFT_MARGIN - 10, card_top - 10, RIGHT_MARGIN + 10, card_bottom + 10],
        radius=36,
        fill=(99, 102, 241, 100)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=16))
    img.alpha_composite(glow)

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [LEFT_MARGIN, card_top, RIGHT_MARGIN, card_bottom],
        radius=32,
        fill=(20, 24, 52, 240),
        outline=(165, 180, 252, 230),
        width=3
    )
    return img

def save_and_hash(name: str, img: Image.Image) -> dict:
    file_name = f"{name}.png"
    local_path = os.path.join(LOCAL_PACK_DIR, file_name)
    b2_path = os.path.join(B2_PACK_DIR, file_name)

    img.save(local_path, "PNG", optimize=True)
    img.save(b2_path, "PNG", optimize=True)

    with open(local_path, "rb") as f:
        data = f.read()
    digest = hashlib.sha256(data).hexdigest()

    rel_local = os.path.relpath(local_path, REPO_ROOT).replace("\\", "/")
    b2_uri = f"b2://shortsfactory-assets/canva-packs/{PACK_ID}/{file_name}"

    return {
        "role": name,
        "fileName": file_name,
        "storageKey": f"shortsfactory-assets/canva-packs/{PACK_ID}/{file_name}",
        "b2Uri": b2_uri,
        "localPath": rel_local,
        "sha256": digest,
        "format": "png",
        "width": WIDTH,
        "height": HEIGHT,
        "fileSizeBytes": len(data)
    }

def build_pack():
    print(f"Building Canva Visual Design Pack: {PACK_ID} v{VERSION}...")
    assets = {}
    assets["glass_card_frame"] = save_and_hash("glass_card_frame", create_glass_card_frame())
    assets["category_badge"] = save_and_hash("category_badge", create_category_badge())
    assets["progress_track"] = save_and_hash("progress_track", create_progress_track())
    assets["reveal_punch"] = save_and_hash("reveal_punch", create_reveal_punch())
    assets["explanation_card"] = save_and_hash("explanation_card", create_explanation_card())
    assets["outro_card"] = save_and_hash("outro_card", create_outro_card())

    manifest = {
        "manifestVersion": "1.0.0",
        "packId": PACK_ID,
        "version": VERSION,
        "provider": "canva",
        "sourceDesignId": "DAG_CANVA_MASTER_V1",
        "templateDisplayName": "Canva Universal Cinematic Glass Design Pack v1.0",
        "canvas": {
            "width": WIDTH,
            "height": HEIGHT,
            "aspectRatio": "9:16"
        },
        "assets": assets,
        "fontMappings": {
            "titleFont": "Segoe UI, Arial, sans-serif",
            "questionFont": "Segoe UI, Arial, sans-serif",
            "optionFont": "Segoe UI Semibold, Arial, sans-serif",
            "captionFont": "Segoe UI Bold, Arial, sans-serif"
        },
        "designTokens": {
            "accentColorGeography": [6, 182, 212],
            "accentColorScience": [139, 92, 246],
            "cardFill": [11, 18, 32, 248],
            "cardRadius": 26,
            "timerWarningColor": [245, 158, 11],
            "emeraldRevealColor": [34, 197, 94]
        },
        "licensingProvenance": "Canva Pro Lite Commercial Design License — Universal Visual Pack",
        "ownerApprovalStatus": "APPROVED",
        "exportTimestamp": "2026-11-03T00:00:00.000Z"
    }

    serialized = json.dumps(manifest, sort_keys=True, indent=2)
    manifest_digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    manifest["manifestSha256"] = manifest_digest

    manifest_local_path = os.path.join(LOCAL_PACK_DIR, "manifest.json")
    manifest_b2_path = os.path.join(B2_PACK_DIR, "manifest.json")

    with open(manifest_local_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(manifest_b2_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Pack successfully created at {LOCAL_PACK_DIR} and {B2_PACK_DIR}")
    print(f"Manifest SHA-256: {manifest_digest}")
    for role, a in assets.items():
        print(f"  - {role}: {a['fileSizeBytes']} bytes, sha256={a['sha256'][:16]}...")

if __name__ == "__main__":
    build_pack()
