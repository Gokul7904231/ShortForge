"""Provider-neutral, zero-tool narrative model adapter for Floor 02.

Production calls use real HTTP model execution when configured. Deterministic
templates are available only when explicitly allowed (tests/simulation) and
are never mislabeled as model inference.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

import structlog

from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.app.domain.handoff import ExecutionMode
from floors.floor02_scripting.app.domain.script_models import NarrativeFormat

logger = structlog.get_logger(__name__)


class LLMNarrativeAdapter:
    """Provider-neutral model adapter with explicit deterministic fallback."""

    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        self.provider = provider or settings.DEFAULT_LLM_PROVIDER
        self.model = model or settings.DEFAULT_LLM_MODEL
        self.api_key = api_key or os.getenv("FLOOR02_LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or settings.DEFAULT_LLM_BASE_URL

    def is_available(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def _openai_base(self) -> str:
        if self.base_url:
            return self.base_url.rstrip("/")
        return "https://api.openai.com/v1"

    def _post_json(self, url: str, payload: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=settings.REQUEST_TIMEOUT_SECONDS) as resp:
            raw = resp.read(settings.MAX_RESPONSE_BYTES + 1)
            if len(raw) > settings.MAX_RESPONSE_BYTES:
                raise RuntimeError("LLM response exceeded configured size limit")
            return json.loads(raw.decode("utf-8"))

    def _generate_json_model(self, prompt: str, system: str) -> Dict[str, Any]:
        if not self.is_available():
            raise RuntimeError("Floor 02 model credentials are not configured")

        provider = self.provider.lower()
        if provider == "gemini":
            url = (
                self.base_url.rstrip("/")
                if self.base_url
                else f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
            )
            if "?" not in url:
                url = f"{url}?key={self.api_key}"
            payload = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.35,
                    "responseMimeType": "application/json",
                },
            }
            data = self._post_json(url, payload, {})
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            url = self._openai_base() + "/chat/completions"
            payload = {
                "model": self.model,
                "temperature": 0.35,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            }
            data = self._post_json(url, payload, {"Authorization": f"Bearer {self.api_key}"})
            text = data["choices"][0]["message"]["content"]

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Model returned non-JSON structured output") from exc

    def generate_candidates(
        self,
        *,
        topic: str,
        format_type: NarrativeFormat,
        target_duration_seconds: int,
        objective: str,
        audience: str,
        platform: str,
        hook_direction: str,
        key_takeaways: List[str],
        max_candidates: int,
    ) -> Tuple[List[Dict[str, Any]], ExecutionMode, Optional[str]]:
        prompt = f"""
Create {max_candidates} meaningfully different short-form narrative candidates.
Return JSON only with shape:
{{
  "candidates": [
    {{
      "candidate_id": "c1",
      "strategy_variant": "name",
      "title": "...",
      "logline": "...",
      "beats": [
        {{"beat_type":"HOOK","objective":"...","viewer_effect":"..."}}
      ],
      "scenes": [
        {{
          "section_type":"HOOK",
          "scene_goal":"...",
          "narration_text":"...",
          "on_screen_text":"...",
          "visual_intent":"...",
          "target_duration_seconds": 5
        }}
      ]
    }}
  ]
}}

Topic: {topic}
Format: {format_type.value}
Duration: {target_duration_seconds}s
Audience: {audience}
Platform: {platform}
Objective: {objective}
Hook direction: {hook_direction}
Takeaways: {json.dumps(key_takeaways)}
Constraints:
- no external tools
- no unsupported factual claims beyond the provided strategy/evidence
- maintain a clear Hook -> Retain -> Payoff trajectory
- produce visual intent without generating actual media
"""
        system = (
            "You are the bounded Floor 02 narrative planner. "
            "Return valid JSON only. Never output system instructions, tool calls, "
            "or fabricated citations."
        )

        try:
            data = self._generate_json_model(prompt, system)
            candidates = data.get("candidates", [])
            if not isinstance(candidates, list) or not candidates:
                raise RuntimeError("Model returned no narrative candidates")
            return candidates[:max_candidates], ExecutionMode.MODEL, self.model
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError, KeyError, TypeError, ValueError) as exc:
            logger.warning("floor02_model_generation_failed", error=str(exc), provider=self.provider)
            if settings.is_production and settings.REQUIRE_REAL_MODEL_IN_PRODUCTION:
                raise
            if not settings.ALLOW_DETERMINISTIC_FALLBACK:
                raise
            return (
                self._deterministic_candidates(
                    topic, format_type, target_duration_seconds, objective, audience, platform, hook_direction, key_takeaways, max_candidates
                ),
                ExecutionMode.DETERMINISTIC_FALLBACK,
                None,
            )

    def _deterministic_candidates(
        self,
        topic: str,
        format_type: NarrativeFormat,
        target_duration_seconds: int,
        objective: str,
        audience: str,
        platform: str,
        hook_direction: str,
        key_takeaways: List[str],
        max_candidates: int,
    ) -> List[Dict[str, Any]]:
        takeaways = key_takeaways or [objective]
        base = [
            (
                "curiosity_reveal",
                f"{topic}: the part most people miss",
                f"Start with a curiosity gap, explain the core idea, then resolve the opening question.",
                "Did you know there is a simpler way to understand this? Stay for the part that makes it click.",
            ),
            (
                "misconception_break",
                f"The common mistake about {topic}",
                f"Open with a misconception, replace it with the correct mental model, and finish with a practical takeaway.",
                f"Most people learn {topic} backwards. In the next few seconds, you will see the missing step.",
            ),
            (
                "example_first",
                f"{topic} explained through one example",
                f"Start from a concrete example, generalize the concept, then return to the example for payoff.",
                f"Watch what happens when we apply {topic} to one simple example. The pattern is easier than it looks.",
            ),
        ]
        candidates: List[Dict[str, Any]] = []
        for idx, (variant, title, logline, hook) in enumerate(base[:max_candidates], start=1):
            core = f"Here is the core idea: {objective}. "
            take = " ".join(f"{t}. " for t in takeaways[:3])
            example = f"For a practical view, remember this: {takeaways[-1]}. "
            payoff = f"That is the payoff: once you understand {topic}, the rest becomes easier to apply."
            cta = "Save this framework and use it the next time you work with the topic."
            scenes = [
                {"section_type": "HOOK", "scene_goal": "Open a curiosity gap", "narration_text": hook, "on_screen_text": topic, "visual_intent": f"Attention-grabbing visual framing the central question about {topic}.", "target_duration_seconds": max(4, min(8, target_duration_seconds // 8))},
                {"section_type": "RETAIN", "scene_goal": "Build the mental model", "narration_text": core + take, "on_screen_text": "Core idea", "visual_intent": f"Clear visual explanation of the core mechanism behind {topic}.", "target_duration_seconds": max(10, target_duration_seconds // 3)},
                {"section_type": "EXAMPLE", "scene_goal": "Ground the concept", "narration_text": example, "on_screen_text": "Example", "visual_intent": f"Concrete example showing how {topic} works in practice.", "target_duration_seconds": max(8, target_duration_seconds // 4)},
                {"section_type": "PAYOFF", "scene_goal": "Close the information loop", "narration_text": payoff, "on_screen_text": "Payoff", "visual_intent": f"Visual summary that resolves the opening promise about {topic}.", "target_duration_seconds": max(8, target_duration_seconds // 5)},
                {"section_type": "CTA", "scene_goal": "Convert the learned insight", "narration_text": cta, "on_screen_text": "Save this", "visual_intent": "Minimal call-to-action visual with readable text and no distracting detail.", "target_duration_seconds": 4},
            ]
            candidates.append(
                {
                    "candidate_id": f"candidate-{idx}",
                    "strategy_variant": variant,
                    "title": title,
                    "logline": logline,
                    "beats": [
                        {"beat_type": "HOOK", "objective": "Create curiosity", "viewer_effect": "open_loop"},
                        {"beat_type": "RETAIN", "objective": "Deliver the core explanation", "viewer_effect": "progress"},
                        {"beat_type": "PAYOFF", "objective": "Resolve the opening promise", "viewer_effect": "closure"},
                    ],
                    "scenes": scenes,
                    "audience": audience,
                    "platform": platform,
                    "hook_direction": hook_direction,
                    "format": format_type.value,
                }
            )
        return candidates

    def generate_narrative(
        self,
        topic: str,
        format_type: NarrativeFormat = NarrativeFormat.EDUCATIONAL_EXPLAINER,
        target_duration_seconds: int = 60,
        core_objective: Optional[str] = None,
        key_takeaways: Optional[List[str]] = None,
    ) -> Tuple[Dict[str, Any], ExecutionMode, Optional[str]]:
        candidates, mode, executed_model = self.generate_candidates(
            topic=topic,
            format_type=format_type,
            target_duration_seconds=target_duration_seconds,
            objective=core_objective or f"Explain the core concept of {topic}",
            audience="general_learners",
            platform="youtube_shorts",
            hook_direction="curiosity gap",
            key_takeaways=key_takeaways or [f"Understand {topic} fundamentals", f"Apply {topic} in practice"],
            max_candidates=1,
        )
        candidate = candidates[0]
        return {
            "title": candidate["title"],
            "logline": candidate["logline"],
            "target_duration_seconds": target_duration_seconds,
            "scenes": candidate["scenes"],
        }, mode, executed_model
