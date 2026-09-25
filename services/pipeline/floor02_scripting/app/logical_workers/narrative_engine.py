"""Cognitive narrative engine for production Floor 02.

This module combines hierarchical planning, causal/event state, viewer-state
tracking, parallel critics, bounded revision, deterministic compilation, and
impact-aware scene regeneration. It deliberately keeps model output
non-authoritative: only the compiler can produce the canonical ScriptIR.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, Iterable, List, Optional
from uuid import uuid4

from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.app.core.security import sanitize_output_text
from floors.floor02_scripting.app.domain.handoff import (
    EvidenceType,
    ExecutionMode,
    Floor02HandoffPayload,
    Floor02Input,
    ProvenanceEntry,
)
from floors.floor02_scripting.app.domain.script_ir import (
    BeatType,
    CausalEvent,
    ClaimRef,
    CritiqueFinding,
    CritiqueReport,
    CritiqueSeverity,
    NarrativeBeat,
    NarrativeCandidate,
    NarrativeState,
    QualityDimensionScore,
    ScriptIR,
    ScriptQualityReport,
    ViewerState,
)
from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor02_scripting.app.infrastructure.llm_narrative_adapter import LLMNarrativeAdapter
from floors.floor02_scripting.app.logical_workers.dialogue_scriptwriter import count_words


def _words_per_duration(seconds: int, minimum: int, maximum: int) -> tuple[int, int]:
    low = max(1, round(seconds * minimum / 60.0))
    high = max(low, round(seconds * maximum / 60.0))
    return low, high


def _sentence_trim(text: str, max_words: int) -> str:
    words = re.findall(r"\S+", text)
    if len(words) <= max_words:
        return text.strip()
    trimmed = " ".join(words[:max_words]).rstrip(".,;:!?")
    return trimmed + "."


class NarrativeCritics:
    """Independent deterministic critics. They are read-only and parallel-safe."""

    def evidence(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        findings: List[CritiqueFinding] = []
        if inp.floor01_payload:
            upstream_refs = {
                p.evidence_id
                for p in (
                    inp.floor01_payload.topic.provenance
                    + inp.floor01_payload.strategy.provenance
                    + inp.floor01_payload.content_plan.provenance
                    + inp.floor01_payload.curriculum.provenance
                )
            }
            if not upstream_refs:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()),
                        critic_id="F02-C01",
                        severity=CritiqueSeverity.ERROR,
                        category="evidence",
                        message="Floor 01 provided no provenance references for production grounding.",
                        remediation="Reject production execution until upstream provenance exists.",
                    )
                )
            missing = [s.scene_id for s in candidate.scenes if not getattr(s, "evidence_refs", [])]
            if missing:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()),
                        critic_id="F02-C01",
                        severity=CritiqueSeverity.WARNING,
                        category="evidence",
                        message="Scenes contain narrative content without explicit evidence lineage.",
                        scene_ids=missing,
                        remediation="Attach upstream evidence IDs to the scene claim lineage.",
                    )
                )
        score = 1.0 if not findings else 0.65
        return CritiqueReport(critic_id="F02-C01", passed=not any(f.severity == CritiqueSeverity.ERROR for f in findings), score=score, findings=findings)

    def narrative(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        findings: List[CritiqueFinding] = []
        if len(candidate.beats) < 3:
            findings.append(
                CritiqueFinding(
                    finding_id=str(uuid4()), critic_id="F02-C02", severity=CritiqueSeverity.ERROR,
                    category="narrative_coherence", message="Narrative must contain at least Hook, Retain and Payoff beats.",
                    remediation="Compile the candidate into the canonical three-stage retention trajectory.",
                )
            )
        beat_types = [b.beat_type for b in candidate.beats]
        if BeatType.HOOK not in beat_types or BeatType.PAYOFF not in beat_types:
            findings.append(
                CritiqueFinding(
                    finding_id=str(uuid4()), critic_id="F02-C02", severity=CritiqueSeverity.ERROR,
                    category="narrative_coherence", message="Missing hook or payoff beat.", remediation="Add the missing structural beat."
                )
            )
        if candidate.beats and candidate.beats[-1].beat_type not in {BeatType.PAYOFF, BeatType.CTA}:
            findings.append(
                CritiqueFinding(
                    finding_id=str(uuid4()), critic_id="F02-C02", severity=CritiqueSeverity.WARNING,
                    category="narrative_coherence", message="The narrative does not end with a closure-oriented beat.",
                    remediation="Move or create the payoff before CTA.",
                )
            )
        for scene in candidate.scenes:
            if not scene.scene_goal:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()), critic_id="F02-C02", severity=CritiqueSeverity.ERROR,
                        category="scene_purpose", message="Scene has no explicit purpose.", scene_ids=[scene.scene_id],
                        remediation="Define why the scene exists and what viewer state it changes.",
                    )
                )
        score = max(0.0, 1.0 - 0.15 * len(findings))
        return CritiqueReport(critic_id="F02-C02", passed=not any(f.severity == CritiqueSeverity.ERROR for f in findings), score=score, findings=findings)

    def hook(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        findings: List[CritiqueFinding] = []
        if not candidate.scenes:
            findings.append(
                CritiqueFinding(
                    finding_id=str(uuid4()), critic_id="F02-C03", severity=CritiqueSeverity.ERROR,
                    category="hook", message="Candidate contains no scenes.", remediation="Create a hook scene."
                )
            )
        else:
            hook = candidate.scenes[0]
            if hook.target_duration_seconds > settings.HOOK_MAX_SECONDS:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()), critic_id="F02-C03", severity=CritiqueSeverity.WARNING,
                        category="hook", message=f"Hook exceeds {settings.HOOK_MAX_SECONDS}s.",
                        scene_ids=[hook.scene_id], remediation="Compress the hook or move exposition later."
                    )
                )
            text = hook.narration_text.lower()
            curiosity = any(token in text for token in ("?", "did you", "most people", "here is why", "the part"))
            if not curiosity:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()), critic_id="F02-C03", severity=CritiqueSeverity.WARNING,
                        category="hook", message="Hook does not contain a detectable curiosity/open-loop signal.",
                        scene_ids=[hook.scene_id], remediation="Introduce a concrete question, contrast, or promised reveal."
                    )
                )
        score = max(0.0, 1.0 - 0.2 * len(findings))
        return CritiqueReport(critic_id="F02-C03", passed=not any(f.severity == CritiqueSeverity.ERROR for f in findings), score=score, findings=findings)

    def continuity(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        findings: List[CritiqueFinding] = []
        scene_ids = {s.scene_id for s in candidate.scenes}
        for scene in candidate.scenes:
            for dep in scene.depends_on_scene_ids:
                if dep not in scene_ids:
                    findings.append(
                        CritiqueFinding(
                            finding_id=str(uuid4()), critic_id="F02-C04", severity=CritiqueSeverity.ERROR,
                            category="continuity", message=f"Unknown scene dependency '{dep}'.",
                            scene_ids=[scene.scene_id], remediation="Remove the invalid edge or create the referenced scene."
                        )
                    )
        event_ids = {e.event_id for e in candidate.causal_events}
        for scene in candidate.scenes:
            for event_id in scene.causal_event_ids:
                if event_id not in event_ids:
                    findings.append(
                        CritiqueFinding(
                            finding_id=str(uuid4()), critic_id="F02-C04", severity=CritiqueSeverity.ERROR,
                            category="causal_graph", message=f"Unknown causal event '{event_id}'.",
                            scene_ids=[scene.scene_id], remediation="Restore the missing causal event reference."
                        )
                    )
        score = max(0.0, 1.0 - 0.2 * len(findings))
        return CritiqueReport(critic_id="F02-C04", passed=not any(f.severity == CritiqueSeverity.ERROR for f in findings), score=score, findings=findings)

    def pacing(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        total_words = sum(s.word_count for s in candidate.scenes)
        low, high = _words_per_duration(
            inp.target_duration_seconds,
            settings.MIN_WORDS_PER_MINUTE,
            settings.MAX_WORDS_PER_MINUTE,
        )
        findings: List[CritiqueFinding] = []
        if not low <= total_words <= high:
            findings.append(
                CritiqueFinding(
                    finding_id=str(uuid4()), critic_id="F02-C05", severity=CritiqueSeverity.ERROR,
                    category="pacing", message=f"Script has {total_words} words; required range is {low}-{high}.",
                    remediation="Run the pacing normalizer before compilation."
                )
            )
        score = 1.0 if not findings else max(0.0, 1.0 - (abs(total_words - ((low + high) / 2)) / max(high, 1)))
        return CritiqueReport(critic_id="F02-C05", passed=not findings, score=score, findings=findings)

    def feasibility(self, candidate: NarrativeCandidate, inp: Floor02Input) -> CritiqueReport:
        findings: List[CritiqueFinding] = []
        for scene in candidate.scenes:
            if not scene.visual_intent.strip():
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()), critic_id="F02-C06", severity=CritiqueSeverity.ERROR,
                        category="visualizability", message="Scene lacks visual intent.", scene_ids=[scene.scene_id],
                        remediation="Add semantic visual intent; F03 will handle physical asset planning.",
                    )
                )
            if not scene.voice_intent:
                findings.append(
                    CritiqueFinding(
                        finding_id=str(uuid4()), critic_id="F02-C06", severity=CritiqueSeverity.WARNING,
                        category="voice_feasibility", message="Scene lacks explicit voice delivery intent.", scene_ids=[scene.scene_id],
                        remediation="Attach a voice delivery profile for F04.",
                    )
                )
        score = max(0.0, 1.0 - 0.15 * len(findings))
        return CritiqueReport(critic_id="F02-C06", passed=not any(f.severity == CritiqueSeverity.ERROR for f in findings), score=score, findings=findings)


class NarrativeCompiler:
    """Turns a candidate into an authoritative ScriptIR after deterministic validation."""

    def __init__(self, adapter: Optional[LLMNarrativeAdapter] = None) -> None:
        self.adapter = adapter or LLMNarrativeAdapter()
        self.critics = NarrativeCritics()

    @staticmethod
    def _upstream_provenance(inp: Floor02Input) -> List[str]:
        if not inp.floor01_payload:
            return []
        entries: Iterable[ProvenanceEntry] = (
            inp.floor01_payload.topic.provenance
            + inp.floor01_payload.strategy.provenance
            + inp.floor01_payload.content_plan.provenance
            + inp.floor01_payload.curriculum.provenance
        )
        return [e.evidence_id for e in entries]

    @staticmethod
    def _topic(inp: Floor02Input) -> str:
        return inp.floor01_payload.topic.selected_topic if inp.floor01_payload else inp.topic_query

    def _make_claims(self, inp: Floor02Input) -> List[ClaimRef]:
        refs = self._upstream_provenance(inp)
        if not inp.floor01_payload:
            return []
        cp = inp.floor01_payload.content_plan
        claims = [ClaimRef(claim_id="objective", text=cp.core_objective, evidence_refs=refs)]
        for idx, takeaway in enumerate(cp.key_takeaways, start=1):
            claims.append(ClaimRef(claim_id=f"takeaway-{idx}", text=takeaway, evidence_refs=refs))
        return claims

    def _visual_structured(self, scene: SceneSpecification) -> Dict[str, Any]:
        return {
            "semantic_goal": scene.scene_goal or scene.section_type,
            "subject": self._topic_context(scene),
            "action": "communicate",
            "environment": "educational_context",
            "emotional_state": "curious",
            "shot_type": "medium",
            "camera_intent": "subtle push-in" if scene.section_type == "HOOK" else "steady",
            "lighting_intent": "clear",
            "transition_intent": "cut",
            "character_anchor_refs": scene.character_references,
            "scene_anchor_refs": [scene.scene_id],
            "forbidden_changes": [],
        }

    @staticmethod
    def _topic_context(scene: SceneSpecification) -> str:
        return scene.visual_intent.split(" for ")[-1].rstrip(".") if " for " in scene.visual_intent else scene.visual_intent[:80]

    def _build_candidate(self, raw: Dict[str, Any], inp: Floor02Input, index: int) -> NarrativeCandidate:
        upstream_refs = self._upstream_provenance(inp)
        raw_scenes = raw.get("scenes", [])
        scene_models: List[SceneSpecification] = []
        causal_events: List[CausalEvent] = []
        beats: List[NarrativeBeat] = []
        previous_scene_id: Optional[str] = None

        section_to_beat = {
            "HOOK": BeatType.HOOK,
            "RETAIN": BeatType.RETAIN,
            "PROBLEM": BeatType.PROBLEM,
            "EXPLANATION": BeatType.EXPLANATION,
            "EXAMPLE": BeatType.EXAMPLE,
            "PAYOFF": BeatType.PAYOFF,
            "CTA": BeatType.CTA,
        }

        for seq, raw_scene in enumerate(raw_scenes, start=1):
            scene_id = str(raw_scene.get("scene_id") or f"scene-{index}-{seq}")
            section = str(raw_scene.get("section_type") or "RETAIN").upper()
            beat_type = section_to_beat.get(section, BeatType.RETAIN)
            narration = sanitize_output_text(str(raw_scene.get("narration_text") or raw_scene.get("text") or "").strip())
            if not narration:
                narration = f"The key idea about {self._topic(inp)} is worth understanding."
            target_duration = max(3, min(60, int(raw_scene.get("target_duration_seconds") or 10)))
            wc = count_words(narration)
            speech = round(wc / inp.words_per_second, 1)
            event_id = f"event-{index}-{seq}"
            causal_events.append(
                CausalEvent(
                    event_id=event_id,
                    description=str(raw_scene.get("scene_goal") or section),
                    actor="narrator",
                    cause_event_ids=[causal_events[-1].event_id] if causal_events else [],
                    effect_event_ids=[],
                    state_before={"viewer_scene_index": seq - 1},
                    state_after={"viewer_scene_index": seq},
                    evidence_refs=upstream_refs,
                )
            )
            if causal_events and len(causal_events) > 1:
                causal_events[-2].effect_event_ids.append(event_id)
            beat_id = f"beat-{index}-{seq}"
            beats.append(
                NarrativeBeat(
                    beat_id=beat_id,
                    beat_type=beat_type,
                    objective=str(raw_scene.get("scene_goal") or section),
                    scene_ids=[scene_id],
                    causal_event_ids=[event_id],
                    viewer_effect=("open_loop" if beat_type == BeatType.HOOK else "closure" if beat_type == BeatType.PAYOFF else "progress"),
                    payoff_for_question="opening question" if beat_type == BeatType.PAYOFF else None,
                )
            )
            scene = SceneSpecification(
                scene_id=scene_id,
                scene_version=1,
                sequence_index=seq,
                section_type=section,
                beat_id=beat_id,
                scene_goal=str(raw_scene.get("scene_goal") or section),
                narration_text=narration,
                on_screen_text=sanitize_output_text(str(raw_scene.get("on_screen_text") or "")),
                visual_intent=sanitize_output_text(str(raw_scene.get("visual_intent") or f"Cinematic educational visual for {self._topic(inp)}.")),
                voice_intent={
                    "delivery_style": "engaging_educational",
                    "emphasis_terms": [],
                    "target_words_per_second": inp.words_per_second,
                },
                target_duration_seconds=target_duration,
                word_count=wc,
                estimated_speech_duration_seconds=speech,
                character_references=list(raw_scene.get("character_references") or []),
                continuity_rules=dict(raw_scene.get("continuity_rules") or {}),
                depends_on_scene_ids=[previous_scene_id] if previous_scene_id else [],
                causal_event_ids=[event_id],
                evidence_refs=upstream_refs,
                viewer_state_before={},
                viewer_state_after={},
            )
            scene.visual_intent_structured = self._visual_structured(scene)
            scene_models.append(scene)
            previous_scene_id = scene_id

        candidate = NarrativeCandidate(
            candidate_id=str(raw.get("candidate_id") or f"candidate-{index}"),
            title=sanitize_output_text(str(raw.get("title") or f"{self._topic(inp)} — explained")),
            logline=sanitize_output_text(str(raw.get("logline") or f"A clear short-form explanation of {self._topic(inp)}.")),
            strategy_variant=str(raw.get("strategy_variant") or "canonical"),
            beats=beats,
            causal_events=causal_events,
            narrative_state=NarrativeState(
                viewer_state=ViewerState(
                    known_facts=[],
                    current_question="What is the key idea and why does it matter?",
                    expectation="A concise, useful payoff",
                    emotional_state="curious",
                    unresolved_promises=["opening promise"],
                )
            ),
            claims=self._make_claims(inp),
            scenes=scene_models,
            evidence_lineage=upstream_refs,
        )
        return self._normalize_pacing(candidate, inp)

    @staticmethod
    def _expand_sentence(topic: str, objective: str, takeaway: str) -> str:
        return (
            f"Here is the practical way to think about {topic}: {objective}. "
            f"The useful takeaway is {takeaway}. "
            f"Notice how this connects the idea to an action you can actually apply."
        )

    def _normalize_pacing(self, candidate: NarrativeCandidate, inp: Floor02Input) -> NarrativeCandidate:
        low, high = _words_per_duration(inp.target_duration_seconds, settings.MIN_WORDS_PER_MINUTE, settings.MAX_WORDS_PER_MINUTE)
        total = sum(s.word_count for s in candidate.scenes)
        topic = self._topic(inp)
        objective = inp.floor01_payload.content_plan.core_objective if inp.floor01_payload else f"understand {topic}"
        takeaways = inp.floor01_payload.content_plan.key_takeaways if inp.floor01_payload else [f"apply {topic} in practice"]
        idx = 1
        while total < low and candidate.scenes:
            target = candidate.scenes[min(2, len(candidate.scenes) - 1)]
            sentence = self._expand_sentence(topic, objective, takeaways[idx % len(takeaways)])
            target.narration_text = (target.narration_text.rstrip(".!?") + ". " + sentence).strip()
            target.word_count = count_words(target.narration_text)
            target.estimated_speech_duration_seconds = round(target.word_count / inp.words_per_second, 1)
            total = sum(s.word_count for s in candidate.scenes)
            idx += 1
            if idx > 12:
                break
        if total > high:
            # Trim non-hook scenes first while preserving closure.
            for scene in reversed(candidate.scenes[1:]):
                if total <= high:
                    break
                allowed = max(5, scene.word_count - (total - high))
                scene.narration_text = _sentence_trim(scene.narration_text, allowed)
                scene.word_count = count_words(scene.narration_text)
                scene.estimated_speech_duration_seconds = round(scene.word_count / inp.words_per_second, 1)
                total = sum(s.word_count for s in candidate.scenes)
        return candidate

    def _run_critics(self, candidate: NarrativeCandidate, inp: Floor02Input) -> List[CritiqueReport]:
        functions: List[Callable[[NarrativeCandidate, Floor02Input], CritiqueReport]] = [
            self.critics.evidence,
            self.critics.narrative,
            self.critics.hook,
            self.critics.continuity,
            self.critics.pacing,
            self.critics.feasibility,
        ]
        reports: List[CritiqueReport] = []
        with ThreadPoolExecutor(max_workers=len(functions), thread_name_prefix="f02-critic") as pool:
            futures = [pool.submit(fn, candidate, inp) for fn in functions]
            for future in as_completed(futures):
                reports.append(future.result())
        return sorted(reports, key=lambda r: r.critic_id)

    def compile(self, candidate: NarrativeCandidate, inp: Floor02Input, revision_count: int = 0) -> ScriptIR:
        critiques = self._run_critics(candidate, inp)
        hard_gates = {
            r.critic_id: r.passed
            for r in critiques
        }
        overall = sum(r.score for r in critiques) / max(1, len(critiques))
        dimensions = QualityDimensionScore(
            hook_strength=next(r.score for r in critiques if r.critic_id == "F02-C03"),
            narrative_coherence=next(r.score for r in critiques if r.critic_id == "F02-C02"),
            causal_soundness=next(r.score for r in critiques if r.critic_id == "F02-C04"),
            evidence_fidelity=next(r.score for r in critiques if r.critic_id == "F02-C01"),
            continuity=next(r.score for r in critiques if r.critic_id == "F02-C04"),
            pacing=next(r.score for r in critiques if r.critic_id == "F02-C05"),
            visualizability=next(r.score for r in critiques if r.critic_id == "F02-C06"),
            production_feasibility=next(r.score for r in critiques if r.critic_id == "F02-C06"),
        )
        accepted = all(hard_gates.values()) and overall >= 0.80
        quality = ScriptQualityReport(
            overall_score=round(overall, 4),
            dimensions=dimensions,
            critiques=critiques,
            hard_gates=hard_gates,
            accepted=accepted,
            revision_count=revision_count,
        )

        script_id = str(uuid4())
        plan_id = inp.floor01_payload.plan_id if inp.floor01_payload else str(uuid4())
        ir = ScriptIR(
            script_id=script_id,
            script_version=1,
            plan_id=plan_id,
            request_id=inp.request_id,
            objective=inp.floor01_payload.content_plan.core_objective if inp.floor01_payload else f"Explain {self._topic(inp)}",
            audience=inp.floor01_payload.strategy.target_audience if inp.floor01_payload else "general_learners",
            platform=inp.floor01_payload.strategy.platform if inp.floor01_payload else "youtube_shorts",
            tone=inp.floor01_payload.strategy.tone if inp.floor01_payload else "engaging_educational",
            claims=candidate.claims,
            beats=candidate.beats,
            causal_events=candidate.causal_events,
            narrative_state=candidate.narrative_state,
            scenes=candidate.scenes,
            retention={
                "hook_scene_id": candidate.scenes[0].scene_id if candidate.scenes else None,
                "open_loop": candidate.narrative_state.viewer_state.current_question,
                "payoff_scene_id": next((s.scene_id for s in candidate.scenes if s.section_type == "PAYOFF"), None),
                "cta_scene_id": next((s.scene_id for s in reversed(candidate.scenes) if s.section_type == "CTA"), None),
            },
            quality=quality,
            provenance_refs=candidate.evidence_lineage,
            compile_warnings=[] if accepted else ["Candidate required revision before authoritative production handoff."],
        )
        return ir

    def generate(self, inp: Floor02Input, strict: bool = True) -> tuple[NarrativeCandidate, ScriptIR, ExecutionMode, Optional[str], List[NarrativeCandidate]]:
        topic = self._topic(inp)
        if inp.floor01_payload is None and inp.strict_upstream and strict:
            raise ValueError("F02 production execution requires a validated Floor 01 handoff")

        objective = inp.floor01_payload.content_plan.core_objective if inp.floor01_payload else f"Explain the core concept of {topic}"
        audience = inp.floor01_payload.strategy.target_audience if inp.floor01_payload else "general_learners"
        platform = inp.floor01_payload.strategy.platform if inp.floor01_payload else "youtube_shorts"
        hook_direction = inp.floor01_payload.content_plan.hook_direction if inp.floor01_payload else "curiosity gap"
        key_takeaways = inp.floor01_payload.content_plan.key_takeaways if inp.floor01_payload else [f"Understand {topic} fundamentals", f"Apply {topic} in practice"]

        raw_candidates, mode, model = self.adapter.generate_candidates(
            topic=topic,
            format_type=inp.narrative_format,
            target_duration_seconds=inp.target_duration_seconds,
            objective=objective,
            audience=audience,
            platform=platform,
            hook_direction=hook_direction,
            key_takeaways=key_takeaways,
            max_candidates=settings.MAX_CANDIDATES,
        )
        candidates = [self._build_candidate(raw, inp, i) for i, raw in enumerate(raw_candidates, start=1)]

        best_ir: Optional[ScriptIR] = None
        best_candidate: Optional[NarrativeCandidate] = None
        best_score = -1.0
        for candidate in candidates:
            for revision in range(settings.MAX_LLM_REVISIONS + 1):
                ir = self.compile(candidate, inp, revision_count=revision)
                if ir.quality and ir.quality.overall_score > best_score:
                    best_score = ir.quality.overall_score
                    best_ir = ir
                    best_candidate = candidate
                if ir.quality and ir.quality.accepted:
                    return candidate, ir, mode, model, candidates
                candidate = self._repair(candidate, inp, ir.quality)
        if best_candidate is None or best_ir is None:
            raise RuntimeError("F02 failed to produce any narrative candidate")
        if strict and not best_ir.quality.accepted:
            raise ValueError("F02 quality gates could not be satisfied within the bounded revision budget")
        return best_candidate, best_ir, mode, model, candidates

    def _repair(self, candidate: NarrativeCandidate, inp: Floor02Input, quality: Optional[ScriptQualityReport]) -> NarrativeCandidate:
        """Bounded deterministic revision planner."""
        if quality is None:
            return candidate
        for critique in quality.critiques:
            if critique.critic_id == "F02-C03" and candidate.scenes:
                candidate.scenes[0].narration_text = (
                    f"Most people miss this about {self._topic(inp)}. "
                    f"Here is the one idea that makes it easier to understand."
                )
                candidate.scenes[0].word_count = count_words(candidate.scenes[0].narration_text)
                candidate.scenes[0].estimated_speech_duration_seconds = round(candidate.scenes[0].word_count / inp.words_per_second, 1)
            elif critique.critic_id == "F02-C06":
                for scene in candidate.scenes:
                    if not scene.voice_intent:
                        scene.voice_intent = {"delivery_style": "engaging_educational", "target_words_per_second": inp.words_per_second}
                    if not scene.visual_intent_structured:
                        scene.visual_intent_structured = self._visual_structured(scene)
            elif critique.critic_id == "F02-C01":
                refs = self._upstream_provenance(inp)
                for scene in candidate.scenes:
                    scene.evidence_refs = refs
            elif critique.critic_id == "F02-C02":
                for idx, scene in enumerate(candidate.scenes):
                    if not scene.scene_goal:
                        scene.scene_goal = "Advance the narrative" if idx else "Create curiosity"
        return self._normalize_pacing(candidate, inp)

    def regenerate_scene(
        self,
        current_payload: Floor02HandoffPayload,
        target_scene_id: str,
        instruction: Optional[str],
        inp: Floor02Input,
    ) -> Floor02HandoffPayload:
        if current_payload.script_ir is None:
            raise ValueError("Cannot regenerate legacy handoff without canonical ScriptIR")
        scenes = [SceneSpecification.model_validate(s.model_dump() if hasattr(s, "model_dump") else s) for s in current_payload.scenes]
        target = next((s for s in scenes if s.scene_id == target_scene_id), None)
        if target is None:
            raise ValueError(f"Target scene_id '{target_scene_id}' not found")

        instruction_text = (instruction or "refresh the scene").strip()
        lower = instruction_text.lower()
        topic = self._topic(inp)
        if "hook" in lower or target.section_type == "HOOK":
            target.narration_text = f"Most people misunderstand {topic}. The key is simpler than it looks, and this one idea changes how you see it."
        elif "example" in lower:
            target.narration_text = f"Here is a concrete example of {topic}: start with the simplest case, watch what changes, and then apply the same rule to a real situation."
        elif "simpl" in lower:
            target.narration_text = f"The simple version is this: {target.narration_text}"
            target.narration_text = _sentence_trim(target.narration_text, max(12, target.word_count))
        elif "payoff" in lower or "ending" in lower:
            target.narration_text = f"That is the payoff: once you understand this part of {topic}, the confusing pieces become much easier to apply."
        else:
            target.narration_text = f"{target.narration_text.rstrip('.!?')}. The intended improvement is to {instruction_text}."

        target.scene_version += 1
        target.word_count = count_words(target.narration_text)
        target.estimated_speech_duration_seconds = round(target.word_count / inp.words_per_second, 1)
        target.voice_intent = {"delivery_style": "engaging_educational", "target_words_per_second": inp.words_per_second}
        target.visual_intent_structured = self._visual_structured(target)
        updated_version = current_payload.script_version + 1

        # Rebuild a complete candidate from the existing scene graph and re-run every gate.
        candidate = NarrativeCandidate(
            candidate_id=f"regen-{updated_version}",
            title=current_payload.title,
            logline=current_payload.logline,
            strategy_variant="semantic_regeneration",
            beats=current_payload.script_ir.beats,
            causal_events=current_payload.script_ir.causal_events,
            narrative_state=current_payload.script_ir.narrative_state,
            claims=current_payload.script_ir.claims,
            scenes=scenes,
            evidence_lineage=current_payload.provenance and [p.evidence_id for p in current_payload.provenance if isinstance(p, ProvenanceEntry)] or [],
        )
        normalized = self._normalize_pacing(candidate, inp)
        ir = self.compile(normalized, inp, revision_count=0)
        if not ir.quality or not ir.quality.accepted:
            raise ValueError("Regeneration failed canonical F02 quality gates")
        ir.script_id = current_payload.script_id
        ir.script_version = updated_version
        payload = Floor02HandoffPayload(
            script_id=current_payload.script_id,
            script_version=updated_version,
            plan_id=current_payload.plan_id,
            request_id=current_payload.request_id,
            floor_id="floor02_scripting",
            floor_version="2.0.0",
            created_at=current_payload.created_at,
            execution_mode=ExecutionMode.DETERMINISTIC,
            format=current_payload.format,
            title=current_payload.title,
            logline=current_payload.logline,
            target_duration_seconds=current_payload.target_duration_seconds,
            estimated_total_duration_seconds=round(sum(s.estimated_speech_duration_seconds for s in scenes), 1),
            estimated_speech_duration_seconds=round(sum(s.estimated_speech_duration_seconds for s in scenes), 1),
            estimated_pause_transition_duration_seconds=0.0,
            scenes=scenes,
            character_profiles=current_payload.character_profiles,
            educational_beats=current_payload.educational_beats,
            decision_quality_score=ir.quality.overall_score if ir.quality else None,
            handoff_status=__import__("floors.floor02_scripting.app.domain.handoff", fromlist=["HandoffStatus"]).HandoffStatus.VALIDATED,
            provenance=current_payload.provenance
            + [
                ProvenanceEntry(
                    evidence_type=EvidenceType.DETERMINISTIC_RULE,
                    source_type="semantic_regeneration_engine",
                    source_identifier="f02_regeneration_v2",
                    method="impact_aware_scene_regeneration",
                    summary=f"Regenerated scene {target_scene_id} while preserving script identity and re-running all quality gates.",
                    raw_data={"target_scene_id": target_scene_id, "instruction": instruction_text, "script_version": updated_version},
                )
            ],
            script_ir=ir,
            quality_report=ir.quality,
            successor_handoffs={
                "floor03_asset_realization": {"script_id": ir.script_id, "script_version": ir.script_version, "schema_version": ir.schema_version},
                "floor04_media_synthesis": {"script_id": ir.script_id, "script_version": ir.script_version, "schema_version": ir.schema_version},
            },
        )
        return payload
