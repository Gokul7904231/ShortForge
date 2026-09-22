from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

@dataclass
class SafeArea:
    top: int = 160
    bottom: int = 320
    left: int = 60
    right: int = 120

@dataclass
class OutputSettings:
    width: int = 1080
    height: int = 1920
    fps: int = 30
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    pixel_format: str = "yuv420p"
    crf: int = 20
    preset: str = "fast"

@dataclass
class ShotIntent:
    id: str
    recipe_id: str
    start_seconds: float
    duration_seconds: float
    props: Dict[str, Any] = field(default_factory=dict)
    motion: Dict[str, Any] = field(default_factory=dict)
    assets: List[Dict[str, Any]] = field(default_factory=list)

@dataclass
class CaptionWord:
    word: str
    start: float
    end: float

@dataclass
class CaptionSegment:
    text: str
    start_seconds: float
    duration_seconds: float
    words: List[CaptionWord] = field(default_factory=list)
    style: str = "TiktokBouncy"

@dataclass
class AudioTrack:
    track_id: str
    audio_path: str
    start_seconds: float = 0.0
    duration_seconds: Optional[float] = None
    volume: float = 1.0
    is_narration: bool = True

@dataclass
class SceneIntent:
    scene_id: str
    template_id: str
    narration_text: str
    audio_track: Optional[AudioTrack] = None
    shots: List[ShotIntent] = field(default_factory=list)
    captions: List[CaptionSegment] = field(default_factory=list)
    duration_seconds: float = 3.0
    is_locked: bool = False

@dataclass
class RenderIntent:
    project_id: str
    title: str
    output_path: str
    scenes: List[SceneIntent]
    output: OutputSettings = field(default_factory=OutputSettings)
    safe_area: SafeArea = field(default_factory=SafeArea)
    background_music: Optional[AudioTrack] = None
    render_mode: str = "LOCAL_NATIVE"  # LOCAL_NATIVE | LOCAL_BROWSER | LOCAL_HYBRID
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'RenderIntent':
        output_data = data.get("output", {})
        output = OutputSettings(
            width=output_data.get("width", 1080),
            height=output_data.get("height", 1920),
            fps=output_data.get("fps", 30),
            video_codec=output_data.get("video_codec", "libx264"),
            audio_codec=output_data.get("audio_codec", "aac"),
            pixel_format=output_data.get("pixel_format", "yuv420p"),
            crf=output_data.get("crf", 20),
            preset=output_data.get("preset", "fast"),
        )
        safe_area_data = data.get("safe_area", {})
        safe_area = SafeArea(
            top=safe_area_data.get("top", 160),
            bottom=safe_area_data.get("bottom", 320),
            left=safe_area_data.get("left", 60),
            right=safe_area_data.get("right", 120),
        )

        scenes: List[SceneIntent] = []
        for s in data.get("scenes", []):
            audio = None
            if "audio_track" in s and s["audio_track"]:
                at = s["audio_track"]
                audio = AudioTrack(
                    track_id=at.get("track_id", "narration"),
                    audio_path=at.get("audio_path", ""),
                    start_seconds=at.get("start_seconds", 0.0),
                    duration_seconds=at.get("duration_seconds"),
                    volume=at.get("volume", 1.0),
                    is_narration=at.get("is_narration", True),
                )

            shots: List[ShotIntent] = []
            for sh in s.get("shots", []):
                shots.append(
                    ShotIntent(
                        id=sh.get("id", "shot_1"),
                        recipe_id=sh.get("recipe_id", "IMAGE_WITH_CAPTION"),
                        start_seconds=sh.get("start_seconds", 0.0),
                        duration_seconds=sh.get("duration_seconds", 3.0),
                        props=sh.get("props", {}),
                        motion=sh.get("motion", {}),
                        assets=sh.get("assets", []),
                    )
                )

            captions: List[CaptionSegment] = []
            for c in s.get("captions", []):
                words = [
                    CaptionWord(word=w.get("word", ""), start=w.get("start", 0.0), end=w.get("end", 0.0))
                    for w in c.get("words", [])
                ]
                captions.append(
                    CaptionSegment(
                        text=c.get("text", ""),
                        start_seconds=c.get("start_seconds", 0.0),
                        duration_seconds=c.get("duration_seconds", 3.0),
                        words=words,
                        style=c.get("style", "TiktokBouncy"),
                    )
                )

            scenes.append(
                SceneIntent(
                    scene_id=s.get("scene_id", f"scene_{len(scenes)+1}"),
                    template_id=s.get("template_id", "default"),
                    narration_text=s.get("narration_text", ""),
                    audio_track=audio,
                    shots=shots,
                    captions=captions,
                    duration_seconds=s.get("duration_seconds", 3.0),
                    is_locked=s.get("is_locked", False),
                )
            )

        bgm = None
        if "background_music" in data and data["background_music"]:
            bm = data["background_music"]
            bgm = AudioTrack(
                track_id=bm.get("track_id", "bgm"),
                audio_path=bm.get("audio_path", ""),
                start_seconds=bm.get("start_seconds", 0.0),
                duration_seconds=bm.get("duration_seconds"),
                volume=bm.get("volume", 0.2),
                is_narration=False,
            )

        return cls(
            project_id=data.get("project_id", "factoryos_project"),
            title=data.get("title", "Untitled Short"),
            output_path=data.get("output_path", "output.mp4"),
            scenes=scenes,
            output=output,
            safe_area=safe_area,
            background_music=bgm,
            render_mode=data.get("render_mode", "LOCAL_NATIVE"),
            metadata=data.get("metadata", {}),
        )
