"""
Generates production-grade visual assets for the Three-Format Shorts:
- SF-F01 (Facts - Mariana Trench): procedural-film style technical blueprints, bathymetric profile, pressure dial, abyssal fauna.
- SF-H01 (History - Apollo 11): Paper-Cut style layered archival collage, AGC 1202 DSKY display, Steve Bales console, Lunar Module Eagle.
- SF-Q01 (Quiz - Solar System): Game-show illustrative graphics for Venus, Ganymede, and Vacuum Sound.
"""

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def get_font(size: int, bold: bool = False):
    try:
        font_name = "arialbd.ttf" if bold else "arial.ttf"
        return ImageFont.truetype(font_name, size)
    except Exception:
        try:
            font_name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
            return ImageFont.truetype(font_name, size)
        except Exception:
            return ImageFont.load_default()

# =============================================================================
# SF-F01 FACTS: MARIANA TRENCH & CHALLENGER DEEP (Procedural Film Blueprint)
# =============================================================================

def generate_mariana_depth_profile(out_path: str):
    """Bathymetric cross-section showing Challenger Deep 10,994m with technical blueprint grid."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (10, 20, 38, 255))
    draw = ImageDraw.Draw(im)

    # Blueprint Grid
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill=(0, 170, 255, 30), width=1)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill=(0, 170, 255, 30), width=1)

    # Frame border
    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 180), width=2)
    draw.text((30, 25), "BATHYMETRIC PROFILE: CHALLENGER DEEP", fill=(0, 220, 255, 255), font=get_font(24, True))
    draw.text((w - 220, 25), "GRID: 1:1000m EQUIV", fill=(148, 163, 184, 255), font=get_font(18))

    # Water gradient profile
    # Surface: y=80 (0m), Challenger Deep: y=580 (10,994m)
    trench_poly = [
        (80, 80),
        (260, 80),
        (380, 280),
        (440, 560),
        (480, 560),
        (540, 280),
        (660, 80),
        (840, 80),
        (840, 640),
        (80, 640)
    ]
    draw.polygon(trench_poly, fill=(5, 12, 28, 230), outline=(0, 170, 255, 200))

    # Water surface line
    draw.line([(80, 80), (840, 80)], fill=(56, 189, 248, 255), width=3)
    draw.text((90, 88), "SEA LEVEL (0 METERS)", fill=(56, 189, 248, 255), font=get_font(18, True))

    # Mt Everest inverted reference (8,848m)
    draw.line([(320, 480), (600, 480)], fill=(245, 158, 11, 160), width=2)
    draw.text((610, 472), "MT EVEREST PEAK (8,848m)", fill=(245, 158, 11, 240), font=get_font(18, True))

    # Challenger Deep floor (10,994m)
    draw.line([(420, 560), (500, 560)], fill=(239, 68, 68, 255), width=4)
    draw.rectangle([340, 580, 580, 630], fill=(239, 68, 68, 40), outline=(239, 68, 68, 220), width=2)
    draw.text((460, 605), "10,994 METERS", fill=(255, 255, 255, 255), font=get_font(26, True), anchor="mm")

    # Depth zones labels
    draw.text((100, 180), "EPIPELAGIC ZONE (0 - 200m)", fill=(100, 116, 139, 255), font=get_font(16))
    draw.text((100, 280), "MESOPELAGIC (TWILIGHT ZONE)", fill=(100, 116, 139, 255), font=get_font(16))
    draw.text((100, 380), "BATHYPELAGIC (MIDNIGHT ZONE)", fill=(100, 116, 139, 255), font=get_font(16))
    draw.text((100, 480), "HADAL ZONE (THE TRENCH ABYSS)", fill=(56, 189, 248, 255), font=get_font(18, True))

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_pressure_dial(out_path: str):
    """Technical oceanographic hydrostatic pressure dial: 1,086 BAR."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (10, 20, 38, 255))
    draw = ImageDraw.Draw(im)

    # Frame & Grid
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill=(0, 170, 255, 25), width=1)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill=(0, 170, 255, 25), width=1)
    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 180), width=2)

    cx, cy = w // 2, h // 2 + 30
    radius = 220

    # Dial outer ring
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(5, 12, 28, 240), outline=(56, 189, 248, 220), width=4)
    draw.ellipse([cx - radius + 15, cy - radius + 15, cx + radius - 15, cy + radius - 15], outline=(100, 116, 139, 120), width=1)

    # Scale marks
    for deg in range(135, 406, 15):
        rad = math.radians(deg)
        r1 = radius - 20
        r2 = radius - 35 if deg % 45 == 0 else radius - 26
        x1 = cx + int(math.cos(rad) * r1)
        y1 = cy + int(math.sin(rad) * r1)
        x2 = cx + int(math.cos(rad) * r2)
        y2 = cy + int(math.sin(rad) * r2)
        color = (239, 68, 68, 255) if deg > 340 else (56, 189, 248, 255)
        draw.line([(x1, y1), (x2, y2)], fill=color, width=2 if deg % 45 == 0 else 1)

    # Dial needle pointing to 1,086 bar (around 380 deg / critical red zone)
    needle_rad = math.radians(375)
    nx = cx + int(math.cos(needle_rad) * (radius - 40))
    ny = cy + int(math.sin(needle_rad) * (radius - 40))
    draw.line([(cx, cy), (nx, ny)], fill=(239, 68, 68, 255), width=5)
    draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(239, 68, 68, 255), outline=(255, 255, 255, 255), width=3)

    # Big Numerical Readout
    draw.text((cx, cy - 70), "HYDROSTATIC PRESSURE", fill=(148, 163, 184, 255), font=get_font(20, True), anchor="mm")
    draw.text((cx, cy + 90), "1,086 BAR", fill=(255, 255, 255, 255), font=get_font(52, True), anchor="mm")
    draw.text((cx, cy + 140), "15,750 PSI • 1,072 ATMOSPHERES", fill=(245, 158, 11, 255), font=get_font(22, True), anchor="mm")

    # Header & Footer banners
    draw.text((cx, 40), "CRITICAL OCEANOGRAPHIC SENSOR TELEMETRY", fill=(0, 220, 255, 255), font=get_font(22, True), anchor="mm")
    draw.rectangle([60, h - 55, w - 60, h - 20], fill=(239, 68, 68, 30), outline=(239, 68, 68, 180), width=1)
    draw.text((cx, h - 38), "EQUIVALENT FORCE: 1 TON PER SQUARE CENTIMETER", fill=(255, 200, 200, 255), font=get_font(18, True), anchor="mm")

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_mariana_snailfish(out_path: str):
    """Anatomical blueprint of Pseudoliparis swirei (Mariana Snailfish)."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (10, 20, 38, 255))
    draw = ImageDraw.Draw(im)

    # Blueprint Grid
    for x in range(0, w, 40):
        draw.line([(x, 0), (x, h)], fill=(0, 170, 255, 25), width=1)
    for y in range(0, h, 40):
        draw.line([(0, y), (w, y)], fill=(0, 170, 255, 25), width=1)
    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 180), width=2)

    draw.text((30, 25), "TAXONOMY: PSEUDOLIPARIS SWIREI (MARIANA SNAILFISH)", fill=(0, 220, 255, 255), font=get_font(22, True))
    draw.text((30, 52), "HABITAT DEPTH: 6,000m – 8,145m • TEMPERATURE: 1.5°C", fill=(148, 163, 184, 255), font=get_font(18))

    cx, cy = w // 2, h // 2

    # Draw stylized translucent snailfish body contour
    # Head at left (x=240), tail at right (x=700)
    body_poly = [
        (220, cy),
        (260, cy - 80),
        (360, cy - 100),
        (480, cy - 70),
        (600, cy - 35),
        (720, cy - 6),
        (760, cy - 35),
        (740, cy),
        (760, cy + 35),
        (720, cy + 6),
        (600, cy + 35),
        (480, cy + 70),
        (360, cy + 90),
        (260, cy + 70),
        (220, cy)
    ]
    draw.polygon(body_poly, fill=(56, 189, 248, 40), outline=(56, 189, 248, 220), width=3)

    # Eye (small, adapted to pitch black)
    draw.ellipse([270, cy - 30, 290, cy - 10], fill=(255, 255, 255, 200), outline=(0, 170, 255, 255), width=2)

    # Cartilaginous skeleton line
    draw.line([(250, cy), (730, cy)], fill=(255, 255, 255, 120), width=2)
    for sx in range(300, 700, 30):
        draw.line([(sx, cy - 25), (sx, cy + 25)], fill=(255, 255, 255, 70), width=1)

    # Adaptation callouts
    # 1. Flexible skull
    draw.line([(280, cy - 90), (280, cy - 140), (220, cy - 140)], fill=(0, 220, 255, 200), width=2)
    draw.text((210, cy - 150), "CARTILAGINOUS SKULL (NO BONE CRUSH)", fill=(0, 220, 255, 255), font=get_font(18, True), anchor="ra")

    # 2. TMAO osmolytes
    draw.line([(440, cy + 80), (440, cy + 130), (320, cy + 130)], fill=(245, 158, 11, 200), width=2)
    draw.text((310, cy + 120), "HIGH TMAO MOLECULES (STABILIZES PROTEINS)", fill=(245, 158, 11, 255), font=get_font(18, True), anchor="ra")

    # 3. Transparent skin
    draw.line([(580, cy - 50), (580, cy - 130), (680, cy - 130)], fill=(34, 197, 94, 200), width=2)
    draw.text((690, cy - 140), "PIGMENT-FREE GELATINOUS TISSUE", fill=(34, 197, 94, 255), font=get_font(18, True))

    # Bottom summary
    draw.rectangle([60, h - 60, w - 60, h - 20], fill=(0, 170, 255, 30), outline=(0, 170, 255, 140), width=1)
    draw.text((w // 2, h - 40), "APEX PREDATOR OF THE HADAL ZONE: 8,000 METERS BELOW SEA LEVEL", fill=(255, 255, 255, 255), font=get_font(18, True), anchor="mm")

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

# =============================================================================
# SF-H01 HISTORY: APOLLO 11 1202 ALARM (Paper-Cut Archival Style)
# =============================================================================

def generate_saturn_v_archival(out_path: str):
    """Archival paper-cut collage of Saturn V launch on July 16, 1969."""
    w, h = 920, 680
    # Warm ivory parchment background with subtle texture
    im = Image.new("RGBA", (w, h), (245, 240, 230, 255))
    draw = ImageDraw.Draw(im)

    # Torn paper shadow and inner card
    draw.rectangle([35, 35, w - 25, h - 25], fill=(0, 0, 0, 45)) # Directional shadow
    draw.rectangle([30, 30, w - 30, h - 30], fill=(252, 250, 245, 255), outline=(180, 160, 130, 255), width=2)

    # Archival Stamp
    draw.rectangle([w - 270, 50, w - 50, 110], outline=(185, 28, 28, 240), width=3)
    draw.text((w - 160, 70), "NASA ARCHIVES", fill=(185, 28, 28, 240), font=get_font(20, True), anchor="mm")
    draw.text((w - 160, 95), "DECLASSIFIED 1969", fill=(185, 28, 28, 200), font=get_font(14, True), anchor="mm")

    # Document Header
    draw.text((60, 55), "MISSION LOG: APOLLO 11 (AS-506)", fill=(40, 35, 30, 255), font=get_font(28, True))
    draw.text((60, 90), "LAUNCH DATE: JULY 16, 1969 • KENNEDY SPACE CENTER LC-39A", fill=(120, 100, 80, 255), font=get_font(18))
    draw.line([(60, 125), (w - 60, 125)], fill=(200, 180, 150, 255), width=2)

    # Central Rocket Silhouette & Plume
    rx = w // 2 - 80
    # Rocket body
    draw.rectangle([rx - 16, 170, rx + 16, 440], fill=(30, 41, 59, 255))
    # Command module cone
    draw.polygon([(rx - 16, 170), (rx + 16, 170), (rx, 140)], fill=(30, 41, 59, 255))
    # Escape tower
    draw.line([(rx, 140), (rx, 100)], fill=(30, 41, 59, 255), width=3)
    # Saturn V black/white roll pattern
    draw.rectangle([rx - 16, 230, rx, 290], fill=(245, 240, 230, 255))
    draw.rectangle([rx, 290, rx + 16, 350], fill=(245, 240, 230, 255))
    # Fins
    draw.polygon([(rx - 16, 420), (rx - 40, 440), (rx - 16, 440)], fill=(30, 41, 59, 255))
    draw.polygon([(rx + 16, 420), (rx + 40, 440), (rx + 16, 440)], fill=(30, 41, 59, 255))
    # Exhaust plume (layered paper cut style)
    draw.polygon([(rx - 25, 440), (rx + 25, 440), (rx + 50, 590), (rx - 50, 590)], fill=(245, 158, 11, 230))
    draw.polygon([(rx - 15, 440), (rx + 15, 440), (rx + 30, 560), (rx - 30, 560)], fill=(239, 68, 68, 240))
    draw.polygon([(rx - 8, 440), (rx + 8, 440), (rx + 15, 520), (rx - 15, 520)], fill=(255, 255, 255, 250))

    # Right side: Historical technical card
    card_x1, card_y1, card_x2, card_y2 = rx + 80, 170, w - 60, 580
    draw.rectangle([card_x1 + 4, card_y1 + 4, card_x2 + 4, card_y2 + 4], fill=(0, 0, 0, 30))
    draw.rectangle([card_x1, card_y1, card_x2, card_y2], fill=(240, 235, 220, 255), outline=(160, 140, 110, 255), width=2)

    draw.text((card_x1 + 25, card_y1 + 25), "VEHICLE SPECIFICATIONS", fill=(60, 50, 40, 255), font=get_font(20, True))
    specs = [
        ("Height:", "110.6 Meters (363 Feet)"),
        ("Gross Mass:", "2,970,000 Kilograms"),
        ("First Stage:", "5 × Rocketdyne F-1 Engines"),
        ("Thrust:", "34.5 Million Newtons (7.5M lbf)"),
        ("Target Orbit:", "Translunar Injection (TLI)"),
        ("Crew:", "Armstrong, Aldrin, Collins"),
    ]
    for idx, (label, val) in enumerate(specs):
        sy = card_y1 + 75 + idx * 50
        draw.text((card_x1 + 25, sy), label, fill=(120, 100, 80, 255), font=get_font(17, True))
        draw.text((card_x1 + 25, sy + 22), val, fill=(30, 41, 59, 255), font=get_font(18, True))

    # Bottom caption
    draw.rectangle([60, h - 65, w - 60, h - 30], fill=(40, 35, 30, 240))
    draw.text((w // 2, h - 48), "T-00:00:00 — ALL ENGINES RUNNING • LIFTOFF COMMENCED", fill=(255, 255, 255, 255), font=get_font(18, True), anchor="mm")

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_agc_1202_display(out_path: str):
    """Authentic Apollo Guidance Computer (AGC) DSKY showing flashing 1202 Program Alarm."""
    w, h = 920, 680
    # Dark control console background
    im = Image.new("RGBA", (w, h), (24, 24, 27, 255))
    draw = ImageDraw.Draw(im)

    # Outer panel casing with metallic rivets
    draw.rectangle([20, 20, w - 20, h - 20], fill=(39, 39, 42, 255), outline=(82, 82, 91, 255), width=4)

    # Rivets
    for rx in range(40, w - 20, 80):
        draw.ellipse([rx - 4, 30, rx + 4, 38], fill=(161, 161, 170, 255))
        draw.ellipse([rx - 4, h - 38, rx + 4, h - 30], fill=(161, 161, 170, 255))

    # Left: Status Indicator Matrix (Paper-Cut layered badges)
    ind_x, ind_y = 50, 60
    indicators = [
        ("UPLINK ACTY", False), ("NO ATT", False),
        ("STBY", False),        ("KEY REL", False),
        ("OPR ERR", False),     ("RESTART", False),
        ("PRIO DISP", True),    ("PROG", True),
        ("TRACKER", False),     ("ALT", False),
        ("VEL", False),         ("1202 ALARM", True),
    ]
    for i, (text, active) in enumerate(indicators):
        ix = ind_x + (i % 2) * 135
        iy = ind_y + (i // 2) * 58
        box_fill = (239, 68, 68, 240) if (active and "1202" in text) else ((245, 158, 11, 220) if active else (24, 24, 27, 255))
        text_fill = (255, 255, 255, 255) if active else (82, 82, 91, 255)
        border_col = (255, 255, 255, 200) if active else (63, 63, 70, 255)
        draw.rectangle([ix, iy, ix + 125, iy + 48], fill=box_fill, outline=border_col, width=2)
        draw.text((ix + 62, iy + 24), text, fill=text_fill, font=get_font(15, True), anchor="mm")

    # Right: DSKY Digital Electroluminescent Display
    disp_x, disp_y = 350, 60
    draw.rectangle([disp_x, disp_y, w - 50, h - 130], fill=(15, 23, 42, 255), outline=(0, 170, 255, 180), width=3)

    # Header labels: NOUN, VERB, PROG
    draw.text((disp_x + 90, disp_y + 35), "PROG", fill=(148, 163, 184, 255), font=get_font(20, True), anchor="mm")
    draw.text((disp_x + 240, disp_y + 35), "VERB", fill=(148, 163, 184, 255), font=get_font(20, True), anchor="mm")
    draw.text((disp_x + 390, disp_y + 35), "NOUN", fill=(148, 163, 184, 255), font=get_font(20, True), anchor="mm")

    # Values in phosphor green / amber digits
    draw.text((disp_x + 90, disp_y + 85), "63", fill=(34, 197, 94, 255), font=get_font(48, True), anchor="mm") # Program 63: Descent Braking
    draw.text((disp_x + 240, disp_y + 85), "35", fill=(34, 197, 94, 255), font=get_font(48, True), anchor="mm")
    draw.text((disp_x + 390, disp_y + 85), "00", fill=(34, 197, 94, 255), font=get_font(48, True), anchor="mm")

    draw.line([(disp_x + 20, disp_y + 130), (w - 70, disp_y + 130)], fill=(51, 65, 85, 255), width=2)

    # 1202 CRITICAL ALARM BANNER
    alarm_box = [disp_x + 30, disp_y + 160, w - 80, disp_y + 340]
    draw.rectangle(alarm_box, fill=(239, 68, 68, 40), outline=(239, 68, 68, 240), width=3)
    draw.text(((disp_x + 30 + w - 80) // 2, disp_y + 195), "⚠️ EXECUTIVE OVERFLOW ⚠️", fill=(239, 68, 68, 255), font=get_font(22, True), anchor="mm")
    draw.text(((disp_x + 30 + w - 80) // 2, disp_y + 250), "ALARM: 1202", fill=(255, 255, 255, 255), font=get_font(54, True), anchor="mm")
    draw.text(((disp_x + 30 + w - 80) // 2, disp_y + 305), "CORE RADAR STOLEN CYCLES • PRIORITY SCHEDULER ACTIVE", fill=(254, 240, 138, 255), font=get_font(16, True), anchor="mm")

    # Bottom transcript teletype banner
    draw.rectangle([50, h - 100, w - 50, h - 40], fill=(24, 24, 27, 255), outline=(148, 163, 184, 120), width=1)
    draw.text((70, h - 75), "ARMSTRONG: \"It's a 1202... Give us a reading on the 1202 Program Alarm!\"", fill=(248, 250, 252, 255), font=get_font(18, True))

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_steve_bales_console(out_path: str):
    """Mission Control GUIDO console note: Steve Bales & Jack Garman GO call."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (245, 240, 230, 255))
    draw = ImageDraw.Draw(im)

    # Drop shadow & document base
    draw.rectangle([35, 35, w - 25, h - 25], fill=(0, 0, 0, 40))
    draw.rectangle([30, 30, w - 30, h - 30], fill=(253, 251, 247, 255), outline=(190, 175, 150, 255), width=2)

    # Document Header
    draw.text((60, 50), "MISSION OPERATIONS CONTROL ROOM (MOCR)", fill=(40, 35, 30, 255), font=get_font(26, True))
    draw.text((60, 85), "FLIGHT DIRECTORS LOG • GENE KRANZ • POSITION: GUIDO (STEVE BALES)", fill=(120, 105, 85, 255), font=get_font(18))
    draw.line([(60, 120), (w - 60, 120)], fill=(200, 180, 150, 255), width=2)

    # Hand-annotated paper memo (Paper-Cut editorial card)
    memo_box = [80, 150, w - 80, 480]
    draw.rectangle([memo_box[0] + 5, memo_box[1] + 5, memo_box[2] + 5, memo_box[3] + 5], fill=(0, 0, 0, 25))
    draw.rectangle(memo_box, fill=(255, 255, 255, 255), outline=(210, 195, 170, 255), width=2)

    # Memo lines
    draw.text((110, 180), "MEMORANDUM: AGC EXECUTIVE CYCLE OVERLOAD (1201 / 1202)", fill=(185, 28, 28, 255), font=get_font(22, True))
    draw.text((110, 215), "ORIGINATOR: Jack Garman (Support Room) -> Steve Bales (GUIDO Console)", fill=(75, 85, 99, 255), font=get_font(17))

    content_lines = [
        "1. Rendezvous radar is in SLEW mode, bombarding computer with 15% extra interrupts.",
        "2. Halcombe Laning's priority scheduler is dropping low-priority telemetry tasks.",
        "3. Critical descent guidance equations, engine throttle, and thrusters are unaffected.",
        "4. As long as alarm does not become continuous, VEHICLE IS SAFE TO CONTINUE DESCENT."
    ]
    for idx, cl in enumerate(content_lines):
        draw.text((110, 260 + idx * 36), cl, fill=(30, 41, 59, 255), font=get_font(17))

    # Big Stamp: "WE'RE GO ON THAT ALARM!"
    stamp_box = [w // 2 - 220, 400, w // 2 + 220, 465]
    draw.rectangle(stamp_box, fill=(34, 197, 94, 25), outline=(34, 197, 94, 230), width=3)
    draw.text((w // 2, 432), "BALES TO FLIGHT: \"WE'RE GO ON THAT!\"", fill=(22, 101, 52, 255), font=get_font(24, True), anchor="mm")

    # Bottom Quote
    draw.rectangle([60, 510, w - 60, h - 50], fill=(243, 244, 246, 255), outline=(209, 213, 219, 255), width=2)
    draw.text((80, 530), "CAPCOM (DUKE): \"Roger, we got you. We're GO on that alarm.\"", fill=(17, 24, 39, 255), font=get_font(20, True))
    draw.text((80, 565), "HISTORICAL LEGACY: 26-year-old Steve Bales later awarded Presidential Medal of Freedom.", fill=(107, 114, 128, 255), font=get_font(16))

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_eagle_landing(out_path: str):
    """Archival paper-cut illustration of Lunar Module Eagle landing at Tranquility Base."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (15, 23, 42, 255))
    draw = ImageDraw.Draw(im)

    # Starfield background
    import random
    rng = random.Random(42)
    for _ in range(80):
        sx, sy = rng.randint(20, w - 20), rng.randint(20, 380)
        draw.point((sx, sy), fill=(255, 255, 255, rng.randint(120, 255)))

    # Earth in distant sky
    draw.ellipse([80, 60, 160, 140], fill=(59, 130, 246, 255), outline=(255, 255, 255, 180), width=2)
    draw.arc([80, 60, 160, 140], 45, 225, fill=(255, 255, 255, 200), width=4)

    # Lunar Surface Horizon
    lunar_poly = [
        (0, 420),
        (180, 410),
        (340, 435),
        (520, 415),
        (720, 430),
        (w, 410),
        (w, h),
        (0, h)
    ]
    draw.polygon(lunar_poly, fill=(71, 85, 105, 255))
    # Crater details
    draw.ellipse([200, 480, 360, 520], fill=(51, 65, 85, 255), outline=(100, 116, 139, 255), width=2)
    draw.ellipse([580, 520, 780, 570], fill=(51, 65, 85, 255), outline=(100, 116, 139, 255), width=2)

    # Lunar Module Eagle Silhouette (Descending)
    lx, ly = w // 2, 280
    # Ascent stage cabin
    draw.rectangle([lx - 45, ly - 50, lx + 45, ly], fill=(226, 232, 240, 255), outline=(255, 255, 255, 255), width=2)
    draw.polygon([(lx - 45, ly - 50), (lx - 20, ly - 75), (lx + 20, ly - 75), (lx + 45, ly - 50)], fill=(226, 232, 240, 255))
    # Descent stage (gold kapton foil)
    draw.rectangle([lx - 55, ly, lx + 55, ly + 40], fill=(217, 119, 6, 255), outline=(245, 158, 11, 255), width=2)
    # Landing gear legs
    draw.line([(lx - 45, ly + 35), (lx - 90, ly + 95)], fill=(203, 213, 225, 255), width=3)
    draw.line([(lx + 45, ly + 35), (lx + 90, ly + 95)], fill=(203, 213, 225, 255), width=3)
    # Footpads
    draw.line([(lx - 105, ly + 95), (lx - 75, ly + 95)], fill=(255, 255, 255, 255), width=4)
    draw.line([(lx + 75, ly + 95), (lx + 105, ly + 95)], fill=(255, 255, 255, 255), width=4)

    # Descent engine thruster plume
    draw.polygon([(lx - 18, ly + 40), (lx + 18, ly + 40), (lx + 30, ly + 110), (lx - 30, ly + 110)], fill=(56, 189, 248, 180))

    # Archival Mission Timestamp Header
    draw.rectangle([40, 30, 420, 80], fill=(15, 23, 42, 220), outline=(0, 170, 255, 180), width=2)
    draw.text((60, 45), "MISSION TIME: T+102:45:40", fill=(0, 220, 255, 255), font=get_font(18, True))
    draw.text((60, 65), "TRANQUILITY BASE TOUCHDOWN IMMINENT", fill=(148, 163, 184, 255), font=get_font(14))

    # Armstrong's Historic Transmission Box
    quote_box = [50, h - 110, w - 50, h - 35]
    draw.rectangle(quote_box, fill=(15, 23, 42, 230), outline=(34, 197, 94, 220), width=2)
    draw.text((w // 2, h - 85), "ARMSTRONG: \"Houston, Tranquility Base here. The Eagle has landed.\"", fill=(255, 255, 255, 255), font=get_font(22, True), anchor="mm")
    draw.text((w // 2, h - 55), "DUKE: \"Roger, Tranquility. We copy you on the ground. You got a bunch of guys about to turn blue!\"", fill=(148, 163, 184, 255), font=get_font(16), anchor="mm")

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

# =============================================================================
# SF-Q01 QUIZ: SOLAR SYSTEM EXTREMES (Dynamic Game-Show Visuals)
# =============================================================================

def generate_venus_diagram(out_path: str):
    """Visual explanation for Venus: 465°C runaway greenhouse atmosphere."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (11, 18, 32, 255))
    draw = ImageDraw.Draw(im)

    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 140), width=2)
    draw.text((w // 2, 40), "QUESTION 1 REVEAL: PLANETARY TEMPERATURE EXTREME", fill=(0, 220, 255, 255), font=get_font(22, True), anchor="mm")

    cx, cy = w // 2 - 120, h // 2 + 20
    radius = 180

    # Venus Planet Body (volcanic orange / toxic yellow atmosphere)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(217, 119, 6, 255), outline=(245, 158, 11, 255), width=3)
    # Swirling cloud bands
    for offset in range(-120, 130, 40):
        draw.arc([cx - radius, cy + offset - 40, cx + radius, cy + offset + 40], 190, 350, fill=(254, 240, 138, 140), width=6)

    # Right Side Fact Cards
    fx1 = w // 2 + 100
    cards = [
        ("SURFACE TEMP", "465°C (870°F)", "Hot enough to melt solid lead"),
        ("ATMOSPHERE", "96.5% CO2", "Dense supercritical greenhouse trap"),
        ("PRESSURE", "92 ATMOSPHERES", "Crushing surface pressure equal to 900m deep in ocean"),
    ]
    for idx, (head, val, sub) in enumerate(cards):
        cy_card = 130 + idx * 160
        draw.rectangle([fx1, cy_card, w - 40, cy_card + 130], fill=(15, 23, 42, 230), outline=(34, 197, 94, 200), width=2)
        draw.text((fx1 + 20, cy_card + 20), head, fill=(34, 197, 94, 255), font=get_font(18, True))
        draw.text((fx1 + 20, cy_card + 50), val, fill=(255, 255, 255, 255), font=get_font(28, True))
        draw.text((fx1 + 20, cy_card + 95), sub, fill=(148, 163, 184, 255), font=get_font(15))

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_ganymede_diagram(out_path: str):
    """Visual explanation for Ganymede: internal ocean 6x Earth ocean volume."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (11, 18, 32, 255))
    draw = ImageDraw.Draw(im)

    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 140), width=2)
    draw.text((w // 2, 40), "QUESTION 2 REVEAL: SOLAR SYSTEM WATER RESERVOIRS", fill=(0, 220, 255, 255), font=get_font(22, True), anchor="mm")

    cx, cy = w // 2 - 120, h // 2 + 20
    # Outer Ice Crust
    draw.ellipse([cx - 180, cy - 180, cx + 180, cy + 180], fill=(148, 163, 184, 255), outline=(226, 232, 240, 255), width=3)
    # Subsurface Ocean (Deep Blue)
    draw.ellipse([cx - 150, cy - 150, cx + 150, cy + 150], fill=(2, 132, 199, 255), outline=(56, 189, 248, 255), width=3)
    # Silicate / Iron Core
    draw.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=(71, 85, 105, 255), outline=(100, 116, 139, 255), width=2)

    # Right Side Fact Cards
    fx1 = w // 2 + 100
    cards = [
        ("INTERNAL OCEAN", "6X EARTH OCEANS", "Deepest liquid reservoir in solar system"),
        ("ICE SHELL DEPTH", "100 KM CRUST", "High-pressure ice phases surround ocean"),
        ("MAGNETIC FIELD", "ONLY MOON WITH ONE", "Generated by liquid iron-rich core dynamo"),
    ]
    for idx, (head, val, sub) in enumerate(cards):
        cy_card = 130 + idx * 160
        draw.rectangle([fx1, cy_card, w - 40, cy_card + 130], fill=(15, 23, 42, 230), outline=(34, 197, 94, 200), width=2)
        draw.text((fx1 + 20, cy_card + 20), head, fill=(34, 197, 94, 255), font=get_font(18, True))
        draw.text((fx1 + 20, cy_card + 50), val, fill=(255, 255, 255, 255), font=get_font(28, True))
        draw.text((fx1 + 20, cy_card + 95), sub, fill=(148, 163, 184, 255), font=get_font(15))

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def generate_sound_vacuum_diagram(out_path: str):
    """Visual explanation for Sound in Vacuum: 0 m/s."""
    w, h = 920, 680
    im = Image.new("RGBA", (w, h), (11, 18, 32, 255))
    draw = ImageDraw.Draw(im)

    draw.rectangle([10, 10, w - 10, h - 10], outline=(0, 170, 255, 140), width=2)
    draw.text((w // 2, 40), "QUESTION 3 REVEAL: ACOUSTIC PROPAGATION IN VACUUM", fill=(0, 220, 255, 255), font=get_font(22, True), anchor="mm")

    # Split screen comparison: Left Atmosphere vs Right Vacuum
    mid_x = w // 2
    draw.line([(mid_x, 80), (mid_x, h - 50)], fill=(0, 170, 255, 120), width=2)

    # Left: Atmosphere
    draw.text((mid_x // 2, 100), "ATMOSPHERE (AIR)", fill=(56, 189, 248, 255), font=get_font(22, True), anchor="mm")
    # Acoustic wave ripples
    for r in range(40, 170, 30):
        draw.arc([mid_x // 2 - r, 260 - r, mid_x // 2 + r, 260 + r], 0, 360, fill=(56, 189, 248, 160), width=3)
    draw.text((mid_x // 2, 420), "343 METERS / SEC", fill=(255, 255, 255, 255), font=get_font(32, True), anchor="mm")
    draw.text((mid_x // 2, 470), "Mechanical waves compress molecules", fill=(148, 163, 184, 255), font=get_font(16), anchor="mm")

    # Right: Vacuum of Space
    draw.text((mid_x + mid_x // 2, 100), "VACUUM OF SPACE", fill=(239, 68, 68, 255), font=get_font(22, True), anchor="mm")
    # Zero waves / X symbol
    draw.line([(mid_x + mid_x // 2 - 60, 200), (mid_x + mid_x // 2 + 60, 320)], fill=(239, 68, 68, 240), width=6)
    draw.line([(mid_x + mid_x // 2 + 60, 200), (mid_x + mid_x // 2 - 60, 320)], fill=(239, 68, 68, 240), width=6)
    draw.text((mid_x + mid_x // 2, 420), "0 METERS / SEC", fill=(34, 197, 94, 255), font=get_font(40, True), anchor="mm")
    draw.text((mid_x + mid_x // 2, 470), "Zero molecules -> Zero acoustic wave propagation", fill=(148, 163, 184, 255), font=get_font(16), anchor="mm")

    # Bottom verdict
    draw.rectangle([60, h - 100, w - 60, h - 40], fill=(15, 23, 42, 230), outline=(34, 197, 94, 220), width=2)
    draw.text((w // 2, h - 70), "IN THE VACUUM OF SPACE, NO ONE CAN HEAR YOU SCREAM: SOUND = 0 M/S", fill=(255, 255, 255, 255), font=get_font(18, True), anchor="mm")

    im.save(out_path, format="PNG")
    print(f"Generated: {out_path}")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    facts_dir = os.path.join(root, "assets", "facts", "mariana-trench")
    history_dir = os.path.join(root, "assets", "history", "apollo-11")
    quiz_dir = os.path.join(root, "assets", "quiz", "solar-system")

    os.makedirs(facts_dir, exist_ok=True)
    os.makedirs(history_dir, exist_ok=True)
    os.makedirs(quiz_dir, exist_ok=True)

    print("Generating SF-F01 Facts assets...")
    generate_mariana_depth_profile(os.path.join(facts_dir, "mariana_depth_profile.png"))
    generate_pressure_dial(os.path.join(facts_dir, "pressure_dial_1086bar.png"))
    generate_mariana_snailfish(os.path.join(facts_dir, "mariana_snailfish_abyss.png"))

    print("Generating SF-H01 History assets...")
    generate_saturn_v_archival(os.path.join(history_dir, "saturn_v_launch_archival.png"))
    generate_agc_1202_display(os.path.join(history_dir, "agc_dsky_1202_display.png"))
    generate_steve_bales_console(os.path.join(history_dir, "steve_bales_mission_control.png"))
    generate_eagle_landing(os.path.join(history_dir, "eagle_lunar_landing.png"))

    print("Generating SF-Q01 Quiz assets...")
    generate_venus_diagram(os.path.join(quiz_dir, "venus_atmosphere_diagram.png"))
    generate_ganymede_diagram(os.path.join(quiz_dir, "ganymede_internal_ocean.png"))
    generate_sound_vacuum_diagram(os.path.join(quiz_dir, "vacuum_sound_wave.png"))

    print("All production assets successfully created!")

if __name__ == "__main__":
    main()

