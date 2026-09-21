"""
High-Level Python API for FactoryOS Render Engine.
"""

from typing import Optional, Dict, Any
from .engine.renderer import Renderer
from .contracts.render_intent import RenderIntent
from .contracts.receipt import RenderReceipt
from .diagnostics.doctor import SystemDoctor

def render(intent: RenderIntent, ffmpeg_path: Optional[str] = None) -> RenderReceipt:
    renderer = Renderer(ffmpeg_path)
    return renderer.render(intent)

def doctor(ffmpeg_path: Optional[str] = None) -> Dict[str, Any]:
    doc = SystemDoctor(ffmpeg_path)
    return doc.run_diagnostics()
