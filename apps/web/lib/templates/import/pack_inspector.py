"""
FactoryOS Secure Template Pack Inspector (Python 3)
Enforces strict sandboxing, zip bomb protection, path traversal protection,
MIME magic byte verification, and Pillow dimension checks.
"""

import sys
import os
import json
import hashlib
import zipfile
from typing import Dict, Any, List
from PIL import Image

MAX_ZIP_SIZE = 50 * 1024 * 1024       # 50 MB
MAX_FILE_COUNT = 50                    # Max 50 files
MAX_DECOMPRESSED_SIZE = 150 * 1024 * 1024  # 150 MB
MAX_COMPRESSION_RATIO = 100.0          # Zip bomb threshold

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
GIF_MAGIC = b"GIF8"

def inspect_and_extract(zip_path: str, output_dir: str) -> Dict[str, Any]:
    if not os.path.exists(zip_path):
        return {"success": False, "error": f"ZIP file not found: {zip_path}"}

    file_size = os.path.getsize(zip_path)
    if file_size > MAX_ZIP_SIZE:
        return {"success": False, "error": f"ZIP file exceeds maximum allowed size ({file_size} > {MAX_ZIP_SIZE})"}

    if not zipfile.is_zipfile(zip_path):
        return {"success": False, "error": "File is not a valid ZIP archive"}

    total_uncompressed = 0
    extracted_files: List[Dict[str, Any]] = []

    with zipfile.ZipFile(zip_path, "r") as zf:
        infolist = zf.infolist()

        if len(infolist) > MAX_FILE_COUNT:
            return {"success": False, "error": f"Archive contains too many entries ({len(infolist)} > {MAX_FILE_COUNT})"}

        # 1. Structural security audit before extraction
        for info in infolist:
            # Check for directory traversal
            norm = os.path.normpath(info.filename)
            if norm.startswith("..") or os.path.isabs(norm) or norm.startswith("/") or norm.startswith("\\"):
                return {"success": False, "error": f"Security violation: path traversal detected in member '{info.filename}'"}

            # Check for windows drive letters
            if len(norm) > 1 and norm[1] == ":":
                return {"success": False, "error": f"Security violation: absolute drive path detected in member '{info.filename}'"}

            # Check for symlinks (UNIX mode 0o120000)
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                return {"success": False, "error": f"Security violation: symlink detected in member '{info.filename}'"}

            total_uncompressed += info.file_size
            if total_uncompressed > MAX_DECOMPRESSED_SIZE:
                return {"success": False, "error": f"Security violation: decompressed size exceeds limit ({total_uncompressed} > {MAX_DECOMPRESSED_SIZE})"}

            if info.compress_size > 0:
                ratio = info.file_size / float(info.compress_size)
                if ratio > MAX_COMPRESSION_RATIO:
                    return {"success": False, "error": f"Security violation: zip bomb ratio detected ({ratio:.1f}x > {MAX_COMPRESSION_RATIO}x)"}

        # 2. Safe extraction
        os.makedirs(output_dir, exist_ok=True)
        manifest_data = None

        for info in infolist:
            if info.is_dir():
                continue

            norm = os.path.normpath(info.filename)
            # Strip leading folder prefixes if user zipped root folder
            # e.g. "shortforge-quiz-template/manifest.json" -> "manifest.json"
            parts = norm.replace("\\", "/").split("/")
            if len(parts) > 1 and parts[0].endswith("-template") or parts[0] == "package":
                rel_path = "/".join(parts[1:])
            else:
                rel_path = "/".join(parts)

            target_file = os.path.join(output_dir, *rel_path.split("/"))
            os.makedirs(os.path.dirname(target_file), exist_ok=True)

            with zf.open(info) as src, open(target_file, "wb") as dst:
                content = src.read()
                dst.write(content)

            sha256 = hashlib.sha256(content).hexdigest()
            byte_length = len(content)

            # Check MIME type and magic bytes
            mime_type = "application/octet-stream"
            dimensions = None

            if rel_path.endswith(".json"):
                mime_type = "application/json"
                if rel_path == "manifest.json" or os.path.basename(rel_path) == "manifest.json":
                    try:
                        manifest_data = json.loads(content.decode("utf-8"))
                    except Exception as e:
                        return {"success": False, "error": f"Invalid JSON in manifest.json: {str(e)}"}
            elif rel_path.endswith(".png"):
                if not content.startswith(PNG_MAGIC):
                    return {"success": False, "error": f"Security violation: '{rel_path}' has PNG extension but invalid magic bytes"}
                mime_type = "image/png"
                try:
                    with Image.open(target_file) as img:
                        dimensions = {"width": img.width, "height": img.height}
                except Exception as e:
                    return {"success": False, "error": f"Invalid PNG image '{rel_path}': {str(e)}"}
            elif rel_path.endswith(".jpg") or rel_path.endswith(".jpeg"):
                if not content.startswith(JPEG_MAGIC):
                    return {"success": False, "error": f"Security violation: '{rel_path}' has JPEG extension but invalid magic bytes"}
                mime_type = "image/jpeg"
                try:
                    with Image.open(target_file) as img:
                        dimensions = {"width": img.width, "height": img.height}
                except Exception as e:
                    return {"success": False, "error": f"Invalid JPEG image '{rel_path}': {str(e)}"}
            elif rel_path.endswith(".mp4"):
                if b"ftyp" not in content[:32]:
                    return {"success": False, "error": f"Security violation: '{rel_path}' has MP4 extension but missing ftyp atom"}
                mime_type = "video/mp4"

            extracted_files.append({
                "relativePath": rel_path,
                "absolutePath": os.path.abspath(target_file),
                "sha256": sha256,
                "byteLength": byte_length,
                "mimeType": mime_type,
                "dimensions": dimensions
            })

    if not manifest_data:
        return {"success": False, "error": "Archive missing required root 'manifest.json'"}

    return {
        "success": True,
        "manifest": manifest_data,
        "files": extracted_files,
        "totalUncompressedBytes": total_uncompressed
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: python pack_inspector.py <zip_path> <output_dir>"}))
        sys.exit(1)

    zip_arg = sys.argv[1]
    out_arg = sys.argv[2]
    result = inspect_and_extract(zip_arg, out_arg)
    print(json.dumps(result, ensure_ascii=False))
    if not result.get("success"):
        sys.exit(1)
