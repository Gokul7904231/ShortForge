import os
import math
from PIL import Image, ImageDraw, ImageFont

def get_font(size):
    for font_path in [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

W, H = 1280, 720

def create_jupiter():
    img = Image.new("RGBA", (W, H), (10, 8, 25, 255))
    draw = ImageDraw.Draw(img)
    # Background space grid & stars
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    # Jupiter planet disk
    cx, cy, r = W // 2, H // 2, 230
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(194, 115, 66, 255))
    # Atmospheric bands
    bands = [
        (-180, -140, (140, 70, 35, 255)),
        (-140, -90, (230, 180, 130, 255)),
        (-90, -40, (180, 95, 45, 255)),
        (-40, 20, (240, 205, 160, 255)),
        (20, 80, (155, 75, 40, 255)),
        (80, 130, (225, 175, 125, 255)),
        (130, 180, (130, 60, 30, 255)),
    ]
    mask = Image.new("L", (W, H), 0)
    dmask = ImageDraw.Draw(mask)
    dmask.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    
    band_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dband = ImageDraw.Draw(band_layer)
    for y1, y2, col in bands:
        dband.rectangle([cx - r - 20, cy + y1, cx + r + 20, cy + y2], fill=col)
    # Great Red Spot
    dband.ellipse([cx + 60, cy + 50, cx + 150, cy + 110], fill=(185, 40, 25, 255), outline=(220, 100, 70, 255), width=3)
    img.paste(band_layer, (0, 0), mask)
    
    # Rotation vector & telemetry
    draw.arc([cx - r - 30, cy - 60, cx + r + 30, cy + 60], 190, 350, fill=(56, 189, 248, 255), width=4)
    # Arrowhead
    draw.polygon([(cx + r + 26, cy - 25), (cx + r + 36, cy - 5), (cx + r + 15, cy - 10)], fill=(56, 189, 248, 255))
    
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    # Telemetry card
    draw.rounded_rectangle([70, 70, 480, 200], radius=14, fill=(15, 23, 42, 220), outline=(56, 189, 248, 200), width=2)
    draw.text((95, 88), "PLANETARY ROTATIONAL VELOCITY", fill=(148, 163, 184, 255), font=f_tag)
    draw.text((95, 122), "T = 9 HOURS 55 MINUTES", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Fastest day in the Solar System • Equatorial: 45,300 km/h", fill=(56, 189, 248, 255), font=f_sub)
    
    img.save("assets/quiz/science/jupiter_rotation.png")
    print("Saved jupiter_rotation.png")

def create_pyramids():
    img = Image.new("RGBA", (W, H), (20, 16, 12, 255))
    draw = ImageDraw.Draw(img)
    # Architectural blueprint grid
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(217, 119, 6, 25), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(217, 119, 6, 25), width=1)
    # Ground plane
    draw.line([(60, 560), (W - 60, 560)], fill=(217, 119, 6, 200), width=3)
    # Great Pyramid triangle
    apex = (W // 2, 170)
    p_left = (240, 560)
    p_right = (W - 240, 560)
    draw.polygon([apex, p_left, p_right], fill=(69, 36, 12, 180), outline=(245, 158, 11, 255))
    # Shading on west face
    draw.polygon([apex, (W // 2 - 30, 560), p_left], fill=(45, 22, 8, 200))
    # Height dimension line
    draw.line([(W // 2, 170), (W // 2, 560)], fill=(56, 189, 248, 180), width=2)
    
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    # Annotation
    draw.rounded_rectangle([70, 70, 520, 200], radius=14, fill=(28, 25, 23, 230), outline=(245, 158, 11, 200), width=2)
    draw.text((95, 88), "ARCHAEOLOGICAL MONUMENT PROFILE", fill=(214, 211, 209, 255), font=f_tag)
    draw.text((95, 122), "GREAT PYRAMID OF GIZA (KHUFU)", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Old Kingdom Fourth Dynasty • Commissioned c. 2560 BCE", fill=(245, 158, 11, 255), font=f_sub)
    
    img.save("assets/quiz/history/pyramid_giza.png")
    print("Saved pyramid_giza.png")

def create_transformer():
    img = Image.new("RGBA", (W, H), (8, 15, 30, 255))
    draw = ImageDraw.Draw(img)
    # Circuit matrix grid
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(99, 102, 241, 20), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(99, 102, 241, 20), width=1)
    
    # 8x8 Attention heatmap matrix
    mx, my, cw = 440, 160, 50
    labels = ["The", "animal", "didn't", "cross", "the", "street", "because", "it"]
    f_lbl = get_font(18)
    f_mat = get_font(16)
    for i, tok in enumerate(labels):
        draw.text((mx - 20, my + i * cw + cw // 2), tok, fill=(148, 163, 184, 255), font=f_lbl, anchor="rm")
        draw.text((mx + i * cw + cw // 2, my - 15), tok, fill=(148, 163, 184, 255), font=f_lbl, anchor="mb")
        for j in range(len(labels)):
            val = 0.92 if (i == 7 and j == 1) else (0.45 if (i == j) else ((i * 3 + j * 7) % 30) / 100.0)
            alpha = int(val * 240)
            col = (99, 102, 241, alpha) if (i == 7 and j == 1) else (14, 165, 233, alpha)
            draw.rectangle([mx + j * cw, my + i * cw, mx + (j + 1) * cw - 2, my + (i + 1) * cw - 2], fill=col, outline=(255, 255, 255, 40), width=1)
            draw.text((mx + j * cw + cw // 2, my + i * cw + cw // 2), f"{val:.2f}", fill=(255, 255, 255, 220), font=f_mat, anchor="mm")
            
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    # Header card
    draw.rounded_rectangle([70, 70, 550, 200], radius=14, fill=(15, 23, 42, 230), outline=(99, 102, 241, 200), width=2)
    draw.text((95, 88), "DEEP LEARNING ARCHITECTURE", fill=(165, 180, 252, 255), font=f_tag)
    draw.text((95, 122), "MULTI-HEAD SELF-ATTENTION", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Attention Is All You Need (Vaswani et al. NeurIPS 2017)", fill=(56, 189, 248, 255), font=f_sub)
    
    img.save("assets/quiz/ai/transformer_attention.png")
    print("Saved transformer_attention.png")

def create_speed_of_light():
    img = Image.new("RGBA", (W, H), (12, 10, 30, 255))
    draw = ImageDraw.Draw(img)
    # Coordinate axes (Space-time)
    cx, cy = W // 2 + 100, H // 2 + 40
    draw.line([(cx - 380, cy), (cx + 380, cy)], fill=(148, 163, 184, 120), width=2) # Space x
    draw.line([(cx, cy - 260), (cx, cy + 260)], fill=(148, 163, 184, 120), width=2) # Time ct
    # Light cone lines (45 deg)
    draw.line([(cx - 240, cy + 240), (cx + 240, cy - 240)], fill=(234, 179, 8, 255), width=3)
    draw.line([(cx - 240, cy - 240), (cx + 240, cy + 240)], fill=(234, 179, 8, 255), width=3)
    # Sine wave oscillation
    points_e = []
    points_b = []
    for px in range(-320, 320, 4):
        x_val = cx + px
        rad = px * 0.04
        y_e = cy - math.sin(rad) * 60
        points_e.append((x_val, y_e))
    draw.line(points_e, fill=(56, 189, 248, 255), width=3)
    
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    draw.rounded_rectangle([70, 70, 560, 200], radius=14, fill=(15, 23, 42, 230), outline=(234, 179, 8, 200), width=2)
    draw.text((95, 88), "FUNDAMENTAL PHYSICAL CONSTANT", fill=(253, 224, 71, 255), font=f_tag)
    draw.text((95, 122), "c = 299,792,458 METERS / SEC", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Speed of light propagating in physical vacuum (NIST)", fill=(56, 189, 248, 255), font=f_sub)
    
    img.save("assets/quiz/science/speed_of_light.png")
    print("Saved speed_of_light.png")

def create_freshwater_lakes():
    img = Image.new("RGBA", (W, H), (8, 22, 38, 255))
    draw = ImageDraw.Draw(img)
    # Hydrographic topography lines
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(14, 165, 233, 20), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(14, 165, 233, 20), width=1)
    
    # Great Lakes stylized contours
    cx, cy = W // 2 + 120, H // 2 + 50
    # Lake Superior contour
    draw.polygon([(cx - 240, cy - 90), (cx - 140, cy - 130), (cx + 20, cy - 90), (cx + 80, cy - 20), (cx - 40, cy + 30), (cx - 160, cy + 10)], fill=(14, 116, 144, 200), outline=(56, 189, 248, 255), width=2)
    # Lake Michigan / Huron
    draw.polygon([(cx - 80, cy + 20), (cx - 20, cy + 100), (cx + 60, cy + 110), (cx + 50, cy + 20)], fill=(14, 116, 144, 180), outline=(56, 189, 248, 220), width=2)
    
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    draw.rounded_rectangle([70, 70, 560, 200], radius=14, fill=(15, 23, 42, 230), outline=(14, 165, 233, 200), width=2)
    draw.text((95, 88), "GLOBAL HYDROGRAPHIC SURVEY", fill=(147, 197, 253, 255), font=f_tag)
    draw.text((95, 122), "CANADA: OVER 2,000,000 LAKES", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Contains more freshwater lake area than all nations combined", fill=(56, 189, 248, 255), font=f_sub)
    
    img.save("assets/quiz/geography/freshwater_lakes.png")
    print("Saved freshwater_lakes.png")

def create_gpu():
    img = Image.new("RGBA", (W, H), (10, 14, 28, 255))
    draw = ImageDraw.Draw(img)
    # Silicon die grid
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(34, 197, 94, 20), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(34, 197, 94, 20), width=1)
    
    # Chip die layout
    cx, cy = W // 2 + 100, H // 2 + 50
    draw.rectangle([cx - 260, cy - 200, cx + 260, cy + 200], fill=(15, 23, 42, 255), outline=(34, 197, 94, 255), width=3)
    # Streaming Multiprocessors (SM blocks)
    for row in range(4):
        for col in range(6):
            bx = cx - 240 + col * 80
            by = cy - 180 + row * 88
            draw.rounded_rectangle([bx, by, bx + 70, by + 76], radius=6, fill=(22, 101, 52, 160), outline=(74, 222, 128, 200), width=1)
            # Tensor core inner dot
            draw.rectangle([bx + 10, by + 10, bx + 60, by + 30], fill=(34, 197, 94, 220))
            
    f_tag = get_font(26)
    f_val = get_font(38)
    f_sub = get_font(22)
    draw.rounded_rectangle([70, 70, 560, 200], radius=14, fill=(15, 23, 42, 230), outline=(34, 197, 94, 200), width=2)
    draw.text((95, 88), "AI COMPUTE HARDWARE DIE ARCHITECTURE", fill=(134, 239, 172, 255), font=f_tag)
    draw.text((95, 122), "GPU (GRAPHICS PROCESSING UNIT)", fill=(255, 255, 255, 255), font=f_val)
    draw.text((95, 166), "Parallel Streaming Multiprocessors + Tensor Core Accelerators", fill=(74, 222, 128, 255), font=f_sub)
    
    img.save("assets/quiz/ai/gpu_architecture.png")
    print("Saved gpu_architecture.png")

if __name__ == "__main__":
    create_jupiter()
    create_pyramids()
    create_transformer()
    create_speed_of_light()
    create_freshwater_lakes()
    create_gpu()
    print("All 8 domain assets successfully created!")

