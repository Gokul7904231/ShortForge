import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

out_dir = "data/visual-assets-store/b2/shortsfactory-assets/quiz-v2"
os.makedirs(out_dir, exist_ok=True)

W, H = 1080, 1920

def get_font(size):
    for font_path in [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

def create_kanchenjunga():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Sky gradient: deep Himalayan sapphire to cold morning gold
    for y in range(H):
        r = y / float(H)
        cr = int(12 * (1 - r) + 45 * r)
        cg = int(28 * (1 - r) + 75 * r)
        cb = int(68 * (1 - r) + 120 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Distant peaks
    distant = [(0, 750), (220, 560), (450, 680), (680, 480), (900, 620), (1080, 520), (1080, 1920), (0, 1920)]
    draw.polygon(distant, fill=(35, 55, 90, 255))
    
    # Snow highlights on distant peaks
    draw.polygon([(220, 560), (280, 640), (180, 640)], fill=(220, 235, 255, 230))
    draw.polygon([(680, 480), (740, 580), (620, 580)], fill=(235, 245, 255, 240))
    
    # Main Kanchenjunga Massif (Dramatic sharp pyramid peak)
    peak = [(0, 1100), (180, 920), (420, 650), (540, 420), (680, 720), (880, 890), (1080, 1050), (1080, 1920), (0, 1920)]
    draw.polygon(peak, fill=(20, 32, 54, 255))
    
    # Massive Snow Cap & Glacial Ridges
    snow_cap = [
        (540, 420), (570, 510), (620, 580), (590, 660), (680, 720),
        (540, 690), (460, 620), (420, 650), (470, 540), (510, 480)
    ]
    draw.polygon(snow_cap, fill=(240, 248, 255, 255))
    # Sunlit golden ridge
    draw.line([(540, 420), (420, 650), (180, 920)], fill=(255, 245, 215, 255), width=4)
    draw.line([(540, 420), (680, 720), (880, 890)], fill=(180, 210, 240, 255), width=3)
    
    # Sub-ridges and rocky faces
    draw.polygon([(540, 420), (510, 480), (540, 690), (570, 510)], fill=(255, 255, 255, 220))
    draw.polygon([(420, 650), (320, 780), (460, 820), (460, 620)], fill=(210, 230, 250, 190))
    
    # Alpine Valley & Conifer Silhouettes in Foreground
    for y in range(1200, H):
        r = (y - 1200) / float(H - 1200)
        c = int(10 + 15 * r)
        draw.line([(0, y), (W, y)], fill=(c, c + 8, c + 15, 255))
    
    out_path = os.path.join(out_dir, "india_kanchenjunga_himalayas.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

def create_ganga():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Dawn atmospheric sky over Varanasi: Deep rose, ochre, radiant gold
    for y in range(1100):
        r = y / 1100.0
        cr = int(35 * (1 - r) + 245 * r)
        cg = int(20 * (1 - r) + 140 * r)
        cb = int(60 * (1 - r) + 65 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Golden Morning Sun
    draw.ellipse([W // 2 - 140, 620, W // 2 + 140, 900], fill=(255, 245, 180, 240))
    draw.ellipse([W // 2 - 200, 560, W // 2 + 200, 960], fill=(255, 200, 100, 60))
    
    # Varanasi Ancient Ghat Temple Architecture Silhouettes on Left Bank
    ghat_outline = [
        (0, 850), (80, 850), (95, 780), (120, 780), (135, 710), (145, 680), (155, 710),
        (170, 780), (190, 850), (250, 850), (270, 740), (290, 660), (300, 630), (310, 660),
        (330, 740), (350, 850), (450, 870), (520, 920), (520, 1150), (0, 1150)
    ]
    draw.polygon(ghat_outline, fill=(45, 20, 18, 255))
    
    # Sacred River Ganga Water Surface
    for y in range(950, H):
        r = (y - 950) / float(H - 950)
        cr = int(180 * (1 - r) + 15 * r)
        cg = int(105 * (1 - r) + 25 * r)
        cb = int(50 * (1 - r) + 40 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Golden shimmering sun reflections across river water
    for y in range(960, H, 12):
        w_spread = int(70 + (y - 960) * 0.45)
        alpha = max(20, int(200 * (1 - (y - 960) / float(H - 960))))
        cx = W // 2 + int(math.sin(y * 0.05) * 15)
        draw.line([(cx - w_spread, y), (cx + w_spread, y)], fill=(255, 230, 140, alpha), width=3)
    
    out_path = os.path.join(out_dir, "india_ganga_river_varanasi.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

def create_wular_lake():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Misty Kashmir Alpine Sky
    for y in range(900):
        r = y / 900.0
        cr = int(25 * (1 - r) + 70 * r)
        cg = int(45 * (1 - r) + 110 * r)
        cb = int(85 * (1 - r) + 145 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Pir Panjal snow-capped mountains ringing the lake
    mountains = [
        (0, 680), (150, 520), (320, 620), (520, 440), (720, 580),
        (890, 480), (1080, 630), (1080, 950), (0, 950)
    ]
    draw.polygon(mountains, fill=(30, 50, 75, 255))
    draw.polygon([(520, 440), (580, 530), (460, 530)], fill=(230, 242, 255, 230))
    draw.polygon([(890, 480), (940, 560), (840, 560)], fill=(230, 242, 255, 230))
    
    # Expansive Freshwater Lake Surface with calm turquoise reflection
    for y in range(880, H):
        r = (y - 880) / float(H - 880)
        cr = int(25 * (1 - r) + 8 * r)
        cg = int(80 * (1 - r) + 24 * r)
        cb = int(115 * (1 - r) + 42 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Mountain water reflections
    for y in range(890, 1300, 8):
        alpha = max(10, int(90 * (1 - (y - 890) / 410.0)))
        draw.line([(180, y), (880, y)], fill=(30, 55, 80, alpha), width=3)
    
    # Traditional Kashmiri Shikara silhouette gliding peacefully
    draw.polygon([(460, 1420), (580, 1420), (595, 1410), (445, 1410)], fill=(15, 20, 25, 255))
    draw.line([(510, 1410), (510, 1375), (550, 1375), (550, 1410)], fill=(15, 20, 25, 255), width=2)
    
    out_path = os.path.join(out_dir, "india_wular_lake_kashmir.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

def create_indira_point():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Tropical Indian Ocean Sky: Deep Twilight to Azure
    for y in range(950):
        r = y / 950.0
        cr = int(14 * (1 - r) + 40 * r)
        cg = int(32 * (1 - r) + 120 * r)
        cb = int(75 * (1 - r) + 185 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Vast Open Indian Ocean (Southernmost frontier)
    for y in range(900, H):
        r = (y - 900) / float(H - 900)
        cr = int(6 * (1 - r) + 2 * r)
        cg = int(65 * (1 - r) + 20 * r)
        cb = int(110 * (1 - r) + 38 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Crashing surf wave foam lines
    for y in range(1250, H, 24):
        offset = int(math.sin(y * 0.04) * 40)
        draw.arc([100 + offset, y - 10, 980 + offset, y + 10], 0, 180, fill=(160, 225, 240, 75), width=2)
    
    # Promontory headland of Great Nicobar with historic red/white lighthouse tower
    draw.polygon([(680, 1150), (1080, 1050), (1080, 1600), (620, 1600)], fill=(20, 30, 22, 255))
    # Lighthouse tower
    draw.polygon([(780, 1050), (810, 1050), (805, 840), (785, 840)], fill=(240, 240, 240, 255))
    # Red bands
    draw.polygon([(782, 970), (808, 970), (806, 920), (784, 920)], fill=(210, 45, 45, 255))
    draw.polygon([(784, 880), (806, 880), (805, 840), (785, 840)], fill=(210, 45, 45, 255))
    # Light beam across ocean
    draw.polygon([(795, 840), (0, 720), (0, 820)], fill=(255, 255, 200, 40))
    
    out_path = os.path.join(out_dir, "india_indira_point_nicobar.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

def create_barren_island():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Atmospheric volcanic sky: dark volcanic haze, ash violet to deep ocean navy
    for y in range(950):
        r = y / 950.0
        cr = int(32 * (1 - r) + 85 * r)
        cg = int(22 * (1 - r) + 45 * r)
        cb = int(48 * (1 - r) + 65 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Volcanic steam and plume rising from crater into atmosphere
    for i in range(12):
        py = 550 - i * 35
        pr = 40 + i * 18
        draw.ellipse([W // 2 - pr, py - pr // 2, W // 2 + pr, py + pr // 2], fill=(120, 105, 125, max(15, 60 - i * 4)))
    
    # Volcanic Island Mass (Black basalt cone rising dramatically from Andaman Sea)
    volcano = [
        (120, 1050), (320, 890), (480, 680), (510, 650), (570, 650), (600, 680),
        (760, 880), (960, 1050), (1080, 1080), (1080, 1920), (0, 1920)
    ]
    draw.polygon(volcano, fill=(18, 16, 20, 255))
    
    # Crater vent glow
    draw.ellipse([W // 2 - 45, 642, W // 2 + 45, 658], fill=(245, 90, 20, 255))
    # Lava flow fissure trails down cone
    draw.line([(W // 2, 650), (510, 780), (470, 920)], fill=(220, 70, 15, 220), width=3)
    draw.line([(W // 2 + 10, 650), (570, 760), (620, 890)], fill=(245, 110, 25, 200), width=2)
    
    # Deep Andaman Sea surrounding island
    for y in range(1020, H):
        r = (y - 1020) / float(H - 1020)
        cr = int(12 * (1 - r) + 4 * r)
        cg = int(35 * (1 - r) + 12 * r)
        cb = int(68 * (1 - r) + 24 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    out_path = os.path.join(out_dir, "india_barren_island_volcano.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

def create_thar_desert():
    img = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(img)
    # Radiant Rajasthan Desert Sunset Sky: Amber, peach, warm golden yellow
    for y in range(900):
        r = y / 900.0
        cr = int(80 * (1 - r) + 250 * r)
        cg = int(45 * (1 - r) + 160 * r)
        cb = int(30 * (1 - r) + 50 * r)
        draw.line([(0, y), (W, y)], fill=(cr, cg, cb, 255))
    
    # Glowing Desert Sunset Sun
    draw.ellipse([W // 2 - 120, 480, W // 2 + 120, 720], fill=(255, 240, 180, 255))
    
    # Distant dune ridges
    dune1 = [(0, 780), (320, 700), (680, 750), (1080, 690), (1080, 1920), (0, 1920)]
    draw.polygon(dune1, fill=(185, 115, 45, 255))
    
    # Mid-ground sweeping sand dunes
    dune2 = [(0, 920), (450, 780), (820, 940), (1080, 860), (1080, 1920), (0, 1920)]
    draw.polygon(dune2, fill=(215, 140, 55, 255))
    
    # Sharp wind-carved dune crest with light and shadow
    dune3 = [(0, 1020), (350, 860), (700, 1040), (1080, 980), (1080, 1920), (0, 1920)]
    draw.polygon(dune3, fill=(235, 160, 65, 255))
    # Shadow side of the crest
    shadow_side = [(350, 860), (700, 1040), (450, 1300), (200, 1200)]
    draw.polygon(shadow_side, fill=(160, 90, 35, 240))
    
    # Fine wind ripples across the foreground sand dunes
    for y in range(1060, H, 14):
        offset = int(math.sin(y * 0.05) * 60)
        draw.arc([50 + offset, y - 8, 950 + offset, y + 8], 0, 180, fill=(175, 105, 40, 80), width=2)
    
    out_path = os.path.join(out_dir, "india_thar_desert_dunes.png")
    img.save(out_path, "PNG")
    print(f"Generated: {out_path}")

create_kanchenjunga()
create_ganga()
create_wular_lake()
create_indira_point()
create_barren_island()
create_thar_desert()
print("All 6 India Geography backdrops generated successfully!")

