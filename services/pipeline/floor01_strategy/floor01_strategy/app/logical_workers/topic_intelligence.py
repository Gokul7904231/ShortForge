"""Topic Intelligence worker for Floor 01 v2."""

from __future__ import annotations

from typing import Dict, List, Optional, Set

from floor01_strategy.app.core.config import get_settings
from floor01_strategy.app.core.exceptions import UnsupportedFormatError, UnsupportedPlatformError
from floor01_strategy.app.core.novelty import extract_keywords, hybrid_similarity, normalize_text
from floor01_strategy.app.core.security import sanitize_input_text
from floor01_strategy.app.domain.handoff import (
    EvidenceType,
    Floor01Input,
    ProvenanceEntry,
    TopicIntelligenceResult,
    UniquenessVerdict,
)

_STOPWORDS: Set[str] = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with",
    "how", "why", "when", "is", "are", "be", "it", "this", "that", "your",
    "you", "we", "i", "most", "what", "can", "does", "do", "explain", "explained",
}


def calculate_jaccard_similarity(tokens_a: List[str], tokens_b: List[str]) -> float:
    """Backward-compatible Jaccard helper retained for callers/tests."""
    set_a = set(tokens_a)
    set_b = set(tokens_b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a.intersection(set_b)) / len(set_a.union(set_b))


class TopicIntelligenceWorker:
    """Normalizes, classifies and deduplicates a topic against strategy memory."""

    def __init__(self, memory_store=None) -> None:
        self.memory_store = memory_store

    def run(self, inp: Floor01Input) -> TopicIntelligenceResult:
        settings = get_settings()
        if inp.platform not in settings.supported_platforms:
            raise UnsupportedPlatformError(inp.platform, settings.supported_platforms)
        if inp.content_format not in settings.supported_formats:
            raise UnsupportedFormatError(inp.content_format, settings.supported_formats)

        sanitized_query = sanitize_input_text(inp.topic_query)
        normalized = normalize_text(sanitized_query)
        query_keywords = extract_keywords(sanitized_query)

        if self.memory_store is None:
            from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
            self.memory_store = StrategyMemoryStore()

        memory_topics = self.memory_store.get_all_topics()
        max_similarity = 0.0
        most_similar_topic: Optional[str] = None
        best_similarity_details: Dict[str, float] = {}

        for mem_topic in memory_topics:
            sim, details = hybrid_similarity(sanitized_query, mem_topic)
            if sim > max_similarity:
                max_similarity = sim
                most_similar_topic = mem_topic
                best_similarity_details = details

        if max_similarity >= settings.similarity_rejection_threshold:
            verdict = UniquenessVerdict.DUPLICATE_IN_MEMORY
            reason = (
                f"Topic is duplicate of memory record: '{most_similar_topic}' "
                f"(hybrid similarity: {max_similarity:.2f})"
            )
        elif max_similarity >= settings.similarity_warning_threshold:
            verdict = UniquenessVerdict.SIMILAR_TO_MEMORY
            reason = (
                f"Topic shares similarity with memory record: '{most_similar_topic}' "
                f"(hybrid similarity: {max_similarity:.2f})"
            )
        else:
            verdict = UniquenessVerdict.MEMORY_UNSEEN
            reason = (
                f"No similar topic found in strategy memory pool "
                f"(max hybrid similarity: {max_similarity:.2f})"
            )

        category = "general_education"
        niche = inp.niche_context or "general"

        if any(k in normalized for k in ["python", "java", "coding", "algorithm", "variable", "function", "sql"]):
            category = "computer_science"
            if "niche" not in inp.constraints:
                niche = "programming_tutorials"
        elif any(k in normalized for k in ["history", "war", "ancient", "century", "empire"]):
            category = "history"
            niche = "historical_facts"
        elif any(k in normalized for k in ["space", "planet", "star", "galaxy", "physics", "science"]):
            category = "science"
            niche = "space_and_physics"

        prov_memory = ProvenanceEntry(
            evidence_type=EvidenceType.MEMORY_LOOKUP,
            source_type="hybrid_similarity_memory",
            source_identifier="strategy_memory_store",
            method="hybrid_similarity",
            confidence_score=max(0.1, 1.0 - max_similarity),
            summary=reason,
            raw_data={
                "max_similarity": round(max_similarity, 4),
                "matched_topic": most_similar_topic,
                "similarity_components": best_similarity_details,
                "keywords": query_keywords,
                "verdict": verdict.value,
            },
        )
        prov_classification = ProvenanceEntry(
            evidence_type=EvidenceType.DETERMINISTIC_RULE,
            source_type="keyword_rule_classifier",
            source_identifier="topic_category_rules",
            method="keyword_matching",
            confidence_score=0.95,
            summary=f"Categorized '{sanitized_query}' into '{category}' (niche: {niche}).",
            raw_data={"category": category, "niche": niche},
        )

        return TopicIntelligenceResult(
            selected_topic=sanitized_query,
            normalized_topic=normalized,
            category=category,
            niche=niche,
            selection_reason=reason,
            similarity_risk_score=round(max_similarity, 4),
            uniqueness_verdict=verdict,
            provenance=[prov_memory, prov_classification],
        )
