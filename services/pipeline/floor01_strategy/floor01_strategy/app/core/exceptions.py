"""Typed exception hierarchy for Floor 01 (Strategy & Intelligence).

Provides clear error classification for deterministic validation errors,
topic duplicate rejections, confidence failures, and retryable vs non-retryable errors.
"""

from __future__ import annotations

from typing import Optional


class Floor01Error(Exception):
    """Base exception for all Floor 01 errors."""

    def __init__(self, message: str, detail: Optional[str] = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or message
        self.retryable = retryable


class Floor01ValidationError(Floor01Error):
    """Raised when Floor 01 input or configuration fails validation."""

    def __init__(self, message: str, detail: Optional[str] = None) -> None:
        super().__init__(message, detail=detail, retryable=False)


class UnsupportedPlatformError(Floor01ValidationError):
    """Raised when an requested platform is not supported by Floor 01 policy."""

    def __init__(self, platform: str, supported: list[str]) -> None:
        msg = f"Platform '{platform}' is not supported. Supported platforms: {supported}"
        super().__init__(msg, detail=msg)


class UnsupportedFormatError(Floor01ValidationError):
    """Raised when a requested content format is not supported."""

    def __init__(self, content_format: str, supported: list[str]) -> None:
        msg = f"Content format '{content_format}' is not supported. Supported formats: {supported}"
        super().__init__(msg, detail=msg)


class DuplicateTopicError(Floor01Error):
    """Raised when topic selection violates uniqueness rules (duplicate topic)."""

    def __init__(self, topic: str, matched_topic: str, similarity_score: float) -> None:
        msg = f"Topic '{topic}' rejected as duplicate of '{matched_topic}' (similarity: {similarity_score:.2f})"
        super().__init__(msg, detail=msg, retryable=False)
        self.topic = topic
        self.matched_topic = matched_topic
        self.similarity_score = similarity_score


class LowConfidenceError(Floor01Error):
    """Raised when strategic confidence falls below the required threshold."""

    def __init__(self, confidence: float, min_threshold: float) -> None:
        msg = f"Aggregate strategy confidence {confidence:.2f} is below minimum required threshold {min_threshold:.2f}"
        super().__init__(msg, detail=msg, retryable=True)
        self.confidence = confidence
        self.min_threshold = min_threshold


class StrategyPipelineError(Floor01Error):
    """Raised when unhandled error occurs during Floor 01 pipeline execution."""

    def __init__(self, message: str, detail: Optional[str] = None, retryable: bool = True) -> None:
        super().__init__(message, detail=detail, retryable=retryable)
