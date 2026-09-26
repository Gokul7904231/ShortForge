"""Reusable physical-media fixtures for Floor 04 tests."""

from __future__ import annotations

import hashlib
import struct
import wave
import zlib
from pathlib import Path


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_SOI = b"\xff\xd8\xff"
JPEG_EOI = b"\xff\xd9"


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    crc = zlib.crc32(kind)
    crc = zlib.crc32(payload, crc) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)


def write_png(path: Path, width: int = 1080, height: int = 1920, pad_to: int | None = None) -> Path:
    digest = hashlib.sha256(f"{path}:{width}:{height}".encode()).digest()
    pixel = bytes((digest[0], digest[1], digest[2], 255))
    row = b"\x00" + pixel * width
    raw = row * height
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    payload = (
        PNG_MAGIC
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(raw, 6))
        + _png_chunk(b"IEND", b"")
    )
    if pad_to is not None and len(payload) < pad_to:
        payload += b"\x00" * (pad_to - len(payload))
    path.write_bytes(payload)
    return path


def write_wav(path: Path, duration_seconds: float = 1.0, sample_rate: int = 44100, pad_to: int | None = None) -> Path:
    frame_count = max(1, int(round(duration_seconds * sample_rate)))
    frames = bytearray()
    for index in range(frame_count):
        sample = int(32767 * 0.08 * (1 if (index // 220) % 2 == 0 else -1))
        frames.extend(struct.pack("<h", sample))

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(bytes(frames))

    if pad_to is not None:
        raw = path.read_bytes()
        if len(raw) < pad_to:
            path.write_bytes(raw + b"\x00" * (pad_to - len(raw)))
    return path


def write_jpeg_header_fixture(path: Path, width: int = 1080, height: int = 1920) -> Path:
    """Minimal SOF0-bearing JPEG header fixture for dimension parser tests."""
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x02\x00\x00\x01\x00\x01\x00\x00"
    sof0_body = (
        b"\x08"
        + struct.pack(">H", height)
        + struct.pack(">H", width)
        + b"\x03"
        + b"\x01\x11\x00"
        + b"\x02\x11\x01"
        + b"\x03\x11\x01"
    )
    sof0 = b"\xff\xc0" + struct.pack(">H", len(sof0_body) + 2) + sof0_body
    path.write_bytes(b"\xff\xd8" + app0 + sof0 + JPEG_EOI)
    return path
