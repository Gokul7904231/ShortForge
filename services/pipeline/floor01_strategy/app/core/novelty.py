"""Hybrid deterministic novelty scoring for F01."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Iterable, List, Set, Tuple


def normalize_text(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_keywords(text: str) -> List[str]:
    stopwords: Set[str] = {
        "the", "a", "an", "and", "or", "to", "of", "in", "on", "for",
        "with", "how", "why", "when", "is", "are", "be", "it", "this",
        "that", "your", "you", "we", "i", "most", "what", "can", "does",
        "do", "explain", "explained",
    }
    return [w for w in normalize_text(text).split() if len(w) >= 3 and w not in stopwords]


def jaccard(tokens_a: Iterable[str], tokens_b: Iterable[str]) -> float:
    a, b = set(tokens_a), set(tokens_b)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def character_bigram_jaccard(text_a: str, text_b: str) -> float:
    def grams(text: str) -> Set[str]:
        normalized = normalize_text(text).replace(" ", "")
        return {normalized[i:i + 2] for i in range(max(0, len(normalized) - 1))}

    return jaccard(grams(text_a), grams(text_b))


def hybrid_similarity(text_a: str, text_b: str) -> Tuple[float, dict]:
    a = normalize_text(text_a)
    b = normalize_text(text_b)
    token_score = jaccard(extract_keywords(a), extract_keywords(b))
    sequence_score = SequenceMatcher(None, a, b).ratio()
    char_score = character_bigram_jaccard(a, b)
    score = 0.55 * token_score + 0.25 * sequence_score + 0.20 * char_score
    return round(score, 4), {
        "token_jaccard": round(token_score, 4),
        "sequence_similarity": round(sequence_score, 4),
        "character_bigram_jaccard": round(char_score, 4),
    }
