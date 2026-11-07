#!/usr/bin/env python3
"""
Consolidates and structures all repository visual assets into a canonical global `assets/` tree.
Preserves existing references and ensures Next.js public assets remain in sync.
"""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

def setup_global_assets():
    print(f"Setting up Global Assets Architecture at {ASSETS}...")
    
    # 1. Define Directories
    branding_dir = ASSETS / "branding"
    icons_dir = ASSETS / "icons"
    backgrounds_dir = ASSETS / "backgrounds"
    avatars_dir = ASSETS / "avatars" / "overseer"
    samples_dir = ASSETS / "samples"
    
    for d in [branding_dir, icons_dir, backgrounds_dir, avatars_dir, samples_dir]:
        d.mkdir(parents=True, exist_ok=True)
        
    # 2. Copy Branding & Favicons from apps/web/public
    web_public = ROOT / "apps" / "web" / "public"
    branding_files = ["favicon.ico", "favicon-black.png", "favicon-white.png"]
    for bf in branding_files:
        src = web_public / bf
        if src.exists():
            shutil.copy2(src, branding_dir / bf)
            print(f"  Copied {bf} -> assets/branding/")
            
    # Also create canonical logo.png
    if (web_public / "favicon-white.png").exists():
        shutil.copy2(web_public / "favicon-white.png", branding_dir / "logo.png")
        print("  Created assets/branding/logo.png")

    # 3. Copy Icons from apps/web/public
    icon_files = ["file.svg", "globe.svg", "next.svg", "vercel.svg", "window.svg"]
    for ic in icon_files:
        src = web_public / ic
        if src.exists():
            shutil.copy2(src, icons_dir / ic)
            print(f"  Copied {ic} -> assets/icons/")

    # 4. Copy Backgrounds from services/rendering-engine/assets/backgrounds
    bg_src_dir = ROOT / "services" / "rendering-engine" / "assets" / "backgrounds"
    if bg_src_dir.exists():
        for bg in bg_src_dir.glob("*.png"):
            shutil.copy2(bg, backgrounds_dir / bg.name)
            print(f"  Copied {bg.name} -> assets/backgrounds/")

    # 5. Normalize and Copy Overseer Avatars
    overseer_src = ROOT / "data" / "overseer imgs"
    avatar_mapping = {
        "alert face.png": "alert-face.png",
        "CONCERNED  face.png": "concerned-face.png",
        "dark theme base face.png": "dark-theme-base.png",
        "experssion ref sheet.png": "expression-ref-sheet.png",
        "happy face.png": "happy-face.png",
        "light theme base face.png": "light-theme-base.png",
        "neutral face.png": "neutral-face.png",
        "PLAYFUL LAUGHING face.png": "playful-laughing-face.png",
        "suprised face.png": "surprised-face.png",
        "thinking face.png": "thinking-face.png",
    }
    if overseer_src.exists():
        for old_name, new_name in avatar_mapping.items():
            src = overseer_src / old_name
            if src.exists():
                shutil.copy2(src, avatars_dir / new_name)
                print(f"  Copied & normalized {old_name} -> assets/avatars/overseer/{new_name}")

    # 6. Copy Sample Media
    sample_files = ["german-quiz-frame0.jpg", "german-quiz-poster.jpg", "german-quiz.mp4"]
    for sf in sample_files:
        src = web_public / sf
        if src.exists():
            shutil.copy2(src, samples_dir / sf)
            print(f"  Copied {sf} -> assets/samples/")

    print("Global assets consolidation completed successfully.")

if __name__ == "__main__":
    setup_global_assets()

