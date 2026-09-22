"""
Command Line Interface for FactoryOS Render Engine.
Usage:
    factoryos-render doctor
    factoryos-render render <project.json>
    factoryos-render preview <project.json>
    factoryos-render inspect <project.json>
    factoryos-render validate <output.mp4>
    factoryos-render clean-cache
    factoryos-render version
    factoryos-render --adapter
"""

import sys
import os
import json
import argparse
from .version import __version__
from .engine.renderer import Renderer
from .contracts.render_intent import RenderIntent
from .diagnostics.doctor import SystemDoctor
from .adapters.json_stdin import JsonAdapter

def main():
    if "--adapter" in sys.argv:
        renderer = Renderer()
        adapter = JsonAdapter(renderer)
        adapter.process_stdin()
        return

    parser = argparse.ArgumentParser(
        prog="factoryos-render",
        description="FactoryOS V3 Deterministic Video Execution Engine"
    )
    parser.add_argument("--version", action="store_true", help="Print version and exit")
    parser.add_argument("--ffmpeg", help="Explicit path to ffmpeg binary")

    subparsers = parser.add_subparsers(dest="command")

    # doctor
    subparsers.add_parser("doctor", help="Run system diagnostics")

    # render
    render_parser = subparsers.add_parser("render", help="Render video from RenderIntent JSON file")
    render_parser.add_argument("file", help="Path to RenderIntent JSON file")
    render_parser.add_argument("--run-id", help="Optional run ID for resuming")

    # preview
    preview_parser = subparsers.add_parser("preview", help="Render static preview image")
    preview_parser.add_argument("file", help="Path to RenderIntent JSON file")
    preview_parser.add_argument("--output", default="preview.png", help="Preview output path")

    # inspect
    inspect_parser = subparsers.add_parser("inspect", help="Inspect and compile RenderIntent without rendering")
    inspect_parser.add_argument("file", help="Path to RenderIntent JSON file")

    # validate
    validate_parser = subparsers.add_parser("validate", help="Validate physical MP4 output")
    validate_parser.add_argument("file", help="Path to MP4 file to validate")

    # clean-cache
    subparsers.add_parser("clean-cache", help="Clear intermediate render cache")

    # version command
    subparsers.add_parser("version", help="Print version")

    args = parser.parse_args()

    if args.version or args.command == "version":
        print(f"factoryos-render {__version__}")
        return

    renderer = Renderer(ffmpeg_path=args.ffmpeg)

    if args.command == "doctor":
        doc = SystemDoctor(ffmpeg_path=args.ffmpeg)
        diag = doc.run_diagnostics()
        print(f"\n=== FactoryOS Render Engine Diagnostics (v{__version__}) ===")
        print(f"OS: {diag['os']} ({diag['arch']})")
        print(f"Python: {diag['pythonVersion']} ({diag['pythonPath']})")
        print(f"FFmpeg: {diag['checks']['ffmpeg']['version']}")
        print(f"Pillow: {diag['checks']['pillow']['version']}")
        print(f"Disk: {diag['checks']['diskSpace']['details']}")
        print("\nChecks:")
        for name, chk in diag["checks"].items():
            status = chk["status"]
            print(f"  [{status}] {name}: {chk.get('details', '')}")
        print(f"\nOverall Health: {'OPERATIONAL' if diag['allHealthy'] else 'ATTENTION REQUIRED'}\n")
        sys.exit(0 if diag["allHealthy"] else 1)

    elif args.command == "render":
        if not os.path.exists(args.file):
            print(f"Error: File not found '{args.file}'", file=sys.stderr)
            sys.exit(1)
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
        intent = RenderIntent.from_dict(data)
        print(f"Starting render for project '{intent.project_id}'...")
        receipt = renderer.render(
            intent=intent,
            run_id=args.run_id,
            progress_callback=lambda msg, cur, tot: print(f"[{cur}/{tot}] {msg}")
        )
        print(f"\nSUCCESS: Output committed to {receipt.output_path}")
        print(f"  Duration: {receipt.duration_seconds:.2f}s | Resolution: {receipt.width}x{receipt.height} | FPS: {receipt.fps}")
        print(f"  SHA-256: {receipt.output_sha256}")
        print(f"  Render Time: {receipt.render_time_ms}ms | Cache Hits: {receipt.cache_hits}")
        sys.exit(0)

    elif args.command == "preview":
        if not os.path.exists(args.file):
            print(f"Error: File not found '{args.file}'", file=sys.stderr)
            sys.exit(1)
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
        intent = RenderIntent.from_dict(data)
        comp = renderer.compile_composition(intent)
        from .engine.frame_engine import FrameEngine
        fe = FrameEngine(comp.width, comp.height, comp.fps)
        raw = fe.render_scene_frame(comp.scenes[0], 0, intent.safe_area.top, intent.safe_area.bottom)
        from PIL import Image
        img = Image.frombytes("RGBA", (comp.width, comp.height), raw)
        img.save(args.output)
        print(f"Preview frame saved to {args.output}")
        sys.exit(0)

    elif args.command == "inspect":
        if not os.path.exists(args.file):
            print(f"Error: File not found '{args.file}'", file=sys.stderr)
            sys.exit(1)
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
        intent = RenderIntent.from_dict(data)
        comp = renderer.compile_composition(intent)
        print(f"\n=== Composition IR Inspection ===")
        print(f"Composition ID: {comp.composition_id}")
        print(f"Resolution: {comp.width}x{comp.height} @ {comp.fps}fps")
        print(f"Total Frames: {comp.total_frames} ({comp.total_duration_seconds:.2f}s)")
        print(f"Total Scenes: {len(comp.scenes)}")
        for i, s in enumerate(comp.scenes):
            print(f"  Scene {i+1}: {s.scene_id} [{s.template_id}] ({s.duration_seconds:.2f}s, {s.duration_frames} frames)")
            for sh in s.shots:
                print(f"    - Shot: {sh.shot_id} [{sh.recipe_id}] ({sh.duration_frames} frames)")
        sys.exit(0)

    elif args.command == "validate":
        res = renderer.ffmpeg.validate_mp4(args.file)
        print(f"\n=== MP4 Validation: {args.file} ===")
        print(f"Valid: {res.is_valid}")
        print(f"File Size: {res.file_size_bytes} bytes")
        print(f"Duration: {res.duration_seconds:.2f}s")
        print(f"Dimensions: {res.width}x{res.height}")
        print(f"Video Stream: {res.has_video_stream} ({res.codec})")
        print(f"Audio Stream: {res.has_audio_stream}")
        if res.errors:
            print(f"Errors: {', '.join(res.errors)}")
        sys.exit(0 if res.is_valid else 1)

    elif args.command == "clean-cache":
        cleared = renderer.cache.clear()
        print(f"Cleared {cleared} cached render artifacts.")
        sys.exit(0)

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
