"""Physical Media Output Validator enforcing path, container, metadata and integrity rules."""

from __future__ import annotations

import hashlib
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Optional, Tuple

import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError

logger = structlog.get_logger(__name__)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
PNG_IEND = b"IEND"
JPEG_SOI = b"\xff\xd8\xff"
JPEG_EOI = b"\xff\xd9"
RIFF_MAGIC = b"RIFF"
WAVE_MAGIC = b"WAVE"
ID3_MAGIC = b"ID3"
MP3_SYNC_MAGIC = (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")

MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
MAX_AUDIO_FILE_SIZE_BYTES = 15 * 1024 * 1024


class PhysicalMediaValidator:
    """Validate physical artifacts using actual bytes and, where required, ffprobe."""

    @classmethod
    def calculate_sha256(cls, file_path: str) -> str:
        p = Path(file_path).resolve()
        if not p.exists():
            raise GuardianValidationError(f"File not found for checksum calculation: '{file_path}'")
        hasher = hashlib.sha256()
        with open(p, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    @classmethod
    def _verify_path_security(cls, file_path: str, storage_root: str) -> Path:
        root_path = Path(storage_root).resolve()
        file_path_obj = Path(file_path)
        resolved_file = file_path_obj.resolve(strict=False)

        try:
            resolved_file.relative_to(root_path)
        except ValueError as exc:
            raise GuardianValidationError(
                f"Security Violation: File path '{file_path}' escapes storage root '{storage_root}'."
            ) from exc

        if file_path_obj.is_symlink():
            target = file_path_obj.readlink().resolve()
            try:
                target.relative_to(root_path)
            except ValueError as exc:
                raise GuardianValidationError(
                    f"Security Violation: Symlink '{file_path}' targets outside storage root."
                ) from exc

        if not resolved_file.exists():
            raise GuardianValidationError(f"Physical Media File Not Found: '{file_path}'")

        return resolved_file

    @classmethod
    def _png_dimensions(cls, path: Path) -> Tuple[int, int]:
        with open(path, "rb") as f:
            if f.read(8) != PNG_MAGIC:
                raise GuardianValidationError(f"Decoder Failure: invalid PNG signature in '{path}'")
            length_raw = f.read(4)
            chunk_type = f.read(4)
            if len(length_raw) != 4 or len(chunk_type) != 4:
                raise GuardianValidationError(f"Decoder Failure: truncated PNG IHDR in '{path}'")
            length = struct.unpack(">I", length_raw)[0]
            if chunk_type != b"IHDR" or length < 8:
                raise GuardianValidationError(f"Decoder Failure: missing PNG IHDR in '{path}'")
            ihdr = f.read(length)
            if len(ihdr) != length:
                raise GuardianValidationError(f"Decoder Failure: truncated PNG IHDR data in '{path}'")
            return struct.unpack(">II", ihdr[:8])

    @classmethod
    def _wav_metadata(cls, path: Path) -> Tuple[int, int, float]:
        with open(path, "rb") as f:
            header = f.read(12)
            if len(header) != 12 or header[:4] != RIFF_MAGIC or header[8:12] != WAVE_MAGIC:
                raise GuardianValidationError(f"Decoder Failure: invalid RIFF/WAVE header in '{path}'")

            channels = sample_rate = bits_per_sample = byte_rate = 0
            data_size = 0

            while True:
                chunk = f.read(8)
                if len(chunk) != 8:
                    break
                chunk_id = chunk[:4]
                chunk_size = struct.unpack("<I", chunk[4:])[0]
                body = f.read(chunk_size)
                if len(body) != chunk_size:
                    raise GuardianValidationError(f"Decoder Failure: truncated WAV chunk in '{path}'")
                if chunk_id == b"fmt " and len(body) >= 16:
                    audio_format, channels, sample_rate, byte_rate, _block_align, bits_per_sample = struct.unpack(
                        "<HHIIHH", body[:16]
                    )
                    if audio_format != 1:
                        raise GuardianValidationError(f"Decoder Failure: WAV codec must be PCM in '{path}'")
                elif chunk_id == b"data":
                    data_size = chunk_size
                    if byte_rate > 0:
                        break

            if channels <= 0 or sample_rate <= 0 or bits_per_sample <= 0 or byte_rate <= 0 or data_size <= 0:
                raise GuardianValidationError(f"Decoder Failure: incomplete WAV metadata in '{path}'")

            return channels, sample_rate, data_size / byte_rate

    @classmethod
    def _ffprobe_audio_duration(cls, path: Path) -> float:
        ffprobe = shutil.which("ffprobe")
        if not ffprobe:
            raise GuardianValidationError(
                f"Decoder Failure: ffprobe is required to validate non-WAV audio duration for '{path}'."
            )

        proc = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-show_entries", "format=duration:stream=channels:stream=codec_name",
                "-of", "json", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if proc.returncode != 0:
            raise GuardianValidationError(f"Decoder Failure: ffprobe rejected '{path}': {proc.stderr[:400]}")

        import json
        payload = json.loads(proc.stdout)
        duration = float((payload.get("format") or {}).get("duration") or 0.0)
        streams = payload.get("streams") or []
        audio = next((s for s in streams if s.get("codec_name")), None)
        if duration <= 0 or not audio:
            raise GuardianValidationError(f"Decoder Failure: ffprobe returned incomplete audio metadata for '{path}'")
        return duration

    @classmethod
    def _jpeg_dimensions(cls, path: Path) -> Tuple[int, int]:
        data = path.read_bytes()
        if not data.startswith(b"\xff\xd8") or not data.endswith(JPEG_EOI):
            raise GuardianValidationError(f"Decoder Failure: malformed JPEG framing in '{path}'")

        i = 2
        sof_markers = {
            0xC0, 0xC1, 0xC2, 0xC3,
            0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB,
            0xCD, 0xCE, 0xCF,
        }

        while i + 3 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue

            while i < len(data) and data[i] == 0xFF:
                i += 1
            if i >= len(data):
                break

            marker = data[i]
            i += 1

            if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
                continue

            if i + 1 >= len(data):
                break
            length = int.from_bytes(data[i:i + 2], "big")
            if length < 2 or i + length > len(data):
                raise GuardianValidationError(f"Decoder Failure: truncated JPEG segment in '{path}'")

            if marker in sof_markers:
                if length < 7:
                    raise GuardianValidationError(f"Decoder Failure: malformed JPEG SOF segment in '{path}'")
                height = int.from_bytes(data[i + 3:i + 5], "big")
                width = int.from_bytes(data[i + 5:i + 7], "big")
                if width <= 0 or height <= 0:
                    raise GuardianValidationError(f"Decoder Failure: invalid JPEG dimensions in '{path}'")
                return width, height

            i += length

        raise GuardianValidationError(f"Decoder Failure: JPEG SOF dimensions not found in '{path}'")

    @classmethod
    def validate_image_asset(
        cls,
        file_path: str,
        required_width: int,
        required_height: int,
        storage_root: str,
        expected_mime: Optional[str] = None,
    ) -> Tuple[str, str, int]:
        if required_width <= 0 or required_height <= 0:
            raise GuardianValidationError(
                f"Contract Requirement Violation: invalid target dimensions {required_width}x{required_height}"
            )

        p = cls._verify_path_security(file_path, storage_root)
        file_size = p.stat().st_size
        if file_size <= 0:
            raise GuardianValidationError(f"Validation Violation: image file is empty: '{file_path}'")
        if file_size > MAX_IMAGE_FILE_SIZE_BYTES:
            raise GuardianValidationError(f"Security Violation: image exceeds {MAX_IMAGE_FILE_SIZE_BYTES} bytes")

        data = p.read_bytes()
        if data.startswith(PNG_MAGIC):
            mime_type = "image/png"
            width, height = cls._png_dimensions(p)
            if width != required_width or height != required_height:
                raise GuardianValidationError(
                    f"Contract Requirement Violation: physical PNG dimensions {width}x{height} do not match "
                    f"requested {required_width}x{required_height}"
                )
            if PNG_IEND not in data:
                raise GuardianValidationError(f"Decoder Failure: PNG missing IEND in '{file_path}'")
        elif data.startswith(JPEG_SOI):
            mime_type = "image/jpeg"
            width, height = cls._jpeg_dimensions(p)
            if width != required_width or height != required_height:
                raise GuardianValidationError(
                    f"Contract Requirement Violation: physical JPEG dimensions {width}x{height} do not match "
                    f"requested {required_width}x{required_height}"
                )
        else:
            raise GuardianValidationError(f"Physical Media Validation Failed: unsupported image magic bytes: '{file_path}'")

        if expected_mime and expected_mime != mime_type:
            raise GuardianValidationError(
                f"Provider Trust Violation: provider MIME '{expected_mime}' != physical MIME '{mime_type}'"
            )

        return mime_type, cls.calculate_sha256(str(p)), file_size

    @classmethod
    def validate_audio_asset(
        cls,
        file_path: str,
        required_duration_seconds: float,
        storage_root: str,
        expected_mime: Optional[str] = None,
    ) -> Tuple[str, str, int, float]:
        if required_duration_seconds <= 0:
            raise GuardianValidationError(
                f"Contract Requirement Violation: invalid required duration {required_duration_seconds}s"
            )

        p = cls._verify_path_security(file_path, storage_root)
        file_size = p.stat().st_size
        if file_size <= 0:
            raise GuardianValidationError(f"Validation Violation: audio file is empty: '{file_path}'")
        if file_size > MAX_AUDIO_FILE_SIZE_BYTES:
            raise GuardianValidationError(f"Security Violation: audio exceeds {MAX_AUDIO_FILE_SIZE_BYTES} bytes")

        header = p.read_bytes()[:16]
        if header.startswith(ID3_MAGIC) or any(header.startswith(m) for m in MP3_SYNC_MAGIC):
            mime_type = "audio/mpeg"
            duration = cls._ffprobe_audio_duration(p)
        elif header.startswith(RIFF_MAGIC):
            mime_type = "audio/wav"
            _channels, _sample_rate, duration = cls._wav_metadata(p)
        else:
            raise GuardianValidationError(f"Physical Media Validation Failed: unsupported audio header: '{file_path}'")

        if expected_mime and expected_mime != mime_type:
            raise GuardianValidationError(
                f"Provider Trust Violation: provider MIME '{expected_mime}' != physical MIME '{mime_type}'"
            )

        if duration + 1e-3 < required_duration_seconds:
            raise GuardianValidationError(
                f"Contract Requirement Violation: physical audio duration {duration:.3f}s is shorter than "
                f"required {required_duration_seconds:.3f}s"
            )

        return mime_type, cls.calculate_sha256(str(p)), file_size, duration
