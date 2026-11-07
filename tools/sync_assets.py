#!/usr/bin/env python3
"""
Synchronizes canonical global assets from `assets/` into `apps/web/public/`
ensuring zero configuration drift between repository truth and Next.js public serving.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
WEB_PUBLIC = ROOT / "apps" / "web" / "public"

def sync_assets():
    print(f"Syncing assets from {ASSETS} -> {WEB_PUBLIC}...")
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    
    # Sync branding
    branding_dir = ASSETS / "branding"
    if branding_dir.exists():
        for f in branding_dir.glob("*.*"):
            shutil.copy2(f, WEB_PUBLIC / f.name)
            print(f"  Synced {f.name}")
            
    # Sync icons
    icons_dir = ASSETS / "icons"
    if icons_dir.exists():
        for f in icons_dir.glob("*.svg"):
            shutil.copy2(f, WEB_PUBLIC / f.name)
            print(f"  Synced {f.name}")
            
    # Sync root App Router favicon
    app_favicon = ROOT / "apps" / "web" / "app" / "favicon.ico"
    if (branding_dir / "favicon.ico").exists():
        shutil.copy2(branding_dir / "favicon.ico", app_favicon)
        print("  Synced apps/web/app/favicon.ico")

    print("Asset synchronization completed successfully.")

if __name__ == "__main__":
    sync_assets()

