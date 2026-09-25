"""Content Planning worker for Floor 01 v2."""

from __future__ import annotations

from floors.floor01_strategy.app.domain.handoff import (
    ContentPlanResult,
    EvidenceType,
    Floor01Input,
    ProvenanceEntry,
    StrategyResult,
    TopicIntelligenceResult,
)


class ContentPlannerWorker:
    """Build core objective, evidence-aware hook, outline, pacing and F02 requirements."""

    def run(
        self,
        inp: Floor01Input,
        topic_res: TopicIntelligenceResult,
        strat_res: StrategyResult,
    ) -> ContentPlanResult:
        topic = topic_res.selected_topic
        angle = strat_res.content_angle
        evidence_hook = (
            inp.research_context.recommended_hook
            if inp.research_context and inp.research_context.recommended_hook
            else None
        )

        core_obj = f"Master the fundamental concept of {topic} through a clear, actionable mental model."
        takeaways = [
            f"Understand the core mechanics of {topic}",
            f"Avoid common misconceptions about {topic}",
            f"Apply the {angle} perspective in real-world scenarios",
        ]
        if inp.research_context and inp.research_context.key_findings:
            takeaways.extend(inp.research_context.key_findings[:2])

        if strat_res.format == "quiz_short":
            hook_direction = (
                evidence_hook
                if evidence_hook
                else f"Challenge viewer knowledge on {topic} with a progressive difficulty quiz."
            )
            cta_direction = f"Comment your score on {topic}."
            outline = ["Hook Card", "Easy Question", "Medium Question", "Hard Question", "Outro & CTA Card"]
            total = max(15, strat_res.target_duration_seconds)
            hook_seconds = max(2, round(total * 0.08))
            outro_seconds = max(2, round(total * 0.08))
            question_seconds = max(3, (total - hook_seconds - outro_seconds) // 3)
            remainder = total - hook_seconds - outro_seconds - (question_seconds * 3)
            pacing = {
                "Hook Card": hook_seconds,
                "Easy Question": question_seconds,
                "Medium Question": question_seconds,
                "Hard Question": question_seconds + remainder,
                "Outro & CTA Card": outro_seconds,
            }
            downstream_reqs = {
                "requires_quiz_options": True,
                "question_count": 3,
                "include_explanations": True,
            }
        else:
            hook_direction = (
                evidence_hook
                if evidence_hook
                else f"Start with a concise curiosity gap grounded in the selected topic."
            )
            cta_direction = f"Invite the viewer to continue learning about {topic}."
            outline = [
                "Evidence-Grounded Hook",
                "Core Concept Breakdown",
                "Practical Example",
                "Key Summary & CTA",
            ]
            total = max(15, strat_res.target_duration_seconds)
            hook_seconds = max(2, round(total * 0.10))
            summary_seconds = max(2, round(total * 0.10))
            core_seconds = max(5, round(total * 0.45))
            example_seconds = max(4, total - hook_seconds - summary_seconds - core_seconds)

            pacing_parts = [
                hook_seconds,
                core_seconds,
                example_seconds,
                summary_seconds,
            ]
            delta = total - sum(pacing_parts)
            if delta != 0:
                example_seconds = max(1, example_seconds + delta)

            pacing = {
                "Evidence-Grounded Hook": hook_seconds,
                "Core Concept Breakdown": core_seconds,
                "Practical Example": example_seconds,
                "Key Summary & CTA": summary_seconds,
            }
            downstream_reqs = {
                "narrative_arc": "problem_solution",
                "max_words_per_scene": 25,
                "evidence_grounded_hook": bool(evidence_hook),
            }

        prov_entry = ProvenanceEntry(
            evidence_type=EvidenceType.UPSTREAM_RESEARCH if evidence_hook else EvidenceType.DETERMINISTIC_RULE,
            source_type="content_blueprint_engine",
            source_identifier="content_planner_policy_v2",
            method="evidence_aware_structure_and_pacing",
            confidence_score=0.92 if evidence_hook else 0.90,
            summary=f"Generated evidence-aware outline for topic '{topic}'.",
            raw_data={
                "core_objective": core_obj,
                "outline": outline,
                "pacing": pacing,
                "evidence_hook_used": bool(evidence_hook),
                "research_passport_id": (
                    inp.research_context.passport_id
                    if inp.research_context
                    else None
                ),
            },
        )

        return ContentPlanResult(
            core_objective=core_obj,
            key_takeaways=takeaways,
            hook_direction=hook_direction,
            cta_direction=cta_direction,
            structural_outline=outline,
            pacing_guidance=pacing,
            downstream_requirements=downstream_reqs,
            provenance=[prov_entry],
        )
