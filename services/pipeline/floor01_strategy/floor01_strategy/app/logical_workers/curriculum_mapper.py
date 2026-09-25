"""Curriculum Mapping Logical Worker for Floor 01.

Maps difficulty level, prerequisites, learning objectives, Bloom's Taxonomy,
concept dependency graphs, knowledge gap hypotheses, and assessment opportunities.
"""

from __future__ import annotations

from typing import List, Tuple

from floor01_strategy.app.domain.handoff import (
    BloomLevel,
    CurriculumMapResult,
    EvidenceType,
    Floor01Input,
    ProvenanceEntry,
    TopicIntelligenceResult,
)


def build_concept_dependency_tree(topic: str, category: str) -> Tuple[List[str], List[str], List[str]]:
    """Derive ordered concept dependency tree, prerequisites, and hypothesized knowledge gaps dynamically."""
    norm_topic = topic.lower()

    if "decorator" in norm_topic or "wrapper" in norm_topic:
        dependencies = [
            "Functions as First-Class Objects",
            "Higher-Order Functions",
            "Lexical Scope & Closures",
            "Decorator @ Syntax",
            "Parameterized Decorators",
        ]
        prerequisites = ["Basic Function Syntax", "Return Values"]
        gaps = ["Preserving Function Metadata with @wraps", "Class Decorators"]
    elif "variable" in norm_topic or "memory" in norm_topic or "garbage" in norm_topic:
        dependencies = [
            "Memory Address Allocation",
            "Variable Binding & Assignment",
            "Reference Counting",
            "Garbage Collection Cycles",
        ]
        prerequisites = ["Basic Programming Logic"]
        gaps = ["Weak References", "Memory Profiling"]
    elif "space" in norm_topic or "hole" in norm_topic or "planet" in norm_topic:
        dependencies = [
            "Gravitational Pull",
            "Stellar Collapse",
            "Event Horizon Boundary",
            "Singularity Relativity",
        ]
        prerequisites = ["Basic Astronomy Concept"]
        gaps = ["Hawking Radiation Details"]
    else:
        dependencies = [
            f"{category.title()} Fundamentals",
            f"{topic} Concept Definition",
            f"{topic} Application Example",
        ]
        prerequisites = [f"Introductory {category.title()} knowledge"]
        gaps = ["Advanced real-world edge cases"]

    return dependencies, prerequisites, gaps


class CurriculumMapperWorker:
    """Logical worker for educational alignment & Bloom's taxonomy mapping."""

    def run(self, inp: Floor01Input, topic_res: TopicIntelligenceResult) -> CurriculumMapResult:
        level = inp.learning_level.lower()
        topic = topic_res.selected_topic
        category = topic_res.category

        dependencies, prerequisites, gaps = build_concept_dependency_tree(topic, category)

        if level == "intermediate":
            bloom = BloomLevel.APPLY
            assessments = ["Multiple-choice concept check", "Code syntax identification"]
        elif level == "advanced":
            bloom = BloomLevel.ANALYZE
            assessments = ["Refactoring challenge", "Bottleneck identification"]
        else:
            level = "beginner"
            bloom = BloomLevel.UNDERSTAND
            assessments = ["Concept recall quiz", "True/False validation"]

        objectives = [
            f"Define key terminology of {topic}",
            f"Demonstrate comprehension of {dependencies[0]}",
            f"Apply core principles of {topic} in practical scenarios",
        ]

        # ── Provenance Item 1: Bloom Classification (EDUCATIONAL_FRAMEWORK) ────────
        prov_bloom = ProvenanceEntry(
            evidence_type=EvidenceType.EDUCATIONAL_FRAMEWORK,
            source_type="educational_framework_taxonomy",
            source_identifier="blooms_revised_taxonomy_v2",
            method="classify_learning_level",
            confidence_score=0.94,
            summary=f"Mapped learning level '{level}' to Bloom's taxonomy level '{bloom.value}'.",
            raw_data={
                "level": level,
                "bloom_level": bloom.value,
                "framework": "Bloom's Revised Taxonomy",
            },
        )

        # ── Provenance Item 2: Concept Dependencies (DETERMINISTIC_RULE) ──────────
        prov_dependencies = ProvenanceEntry(
            evidence_type=EvidenceType.DETERMINISTIC_RULE,
            source_type="domain_concept_dependency_matrix",
            source_identifier="curriculum_dependency_rules",
            method="derive_concept_dependency_tree",
            confidence_score=0.92,
            summary=f"Derived {len(dependencies)}-step concept dependency graph for '{topic}'.",
            raw_data={
                "dependencies": dependencies,
                "prerequisites": prerequisites,
                "knowledge_gap_hypothesis": gaps,
            },
        )

        return CurriculumMapResult(
            difficulty_level=level,
            prerequisites=prerequisites,
            learning_objectives=objectives,
            bloom_taxonomy_level=bloom,
            concept_dependencies=dependencies,
            knowledge_gap_hypothesis=gaps,
            assessment_opportunities=assessments,
            suggested_sequence_order=1,
            provenance=[prov_bloom, prov_dependencies],
        )
