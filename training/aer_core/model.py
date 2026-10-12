from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Sequence

import torch
from torch import Tensor, nn
from transformers import AutoModel, AutoTokenizer


@dataclass(frozen=True)
class CandidateGroup:
    question_id: str
    mode: str
    candidates: Sequence[str]
    target_index: int


def answer_candidates(
    question: Dict,
    gold_answer: Dict | None = None,
) -> CandidateGroup:
    qid = str(question["id"])
    mode = str(question["type"])
    if mode == "NOUL":
        candidates = ["true", "false"]
        target_value = None if gold_answer is None else bool(gold_answer["value"])
        target_index = 0 if target_value else 1
    elif mode == "CHOICE":
        candidates = [str(x) for x in question["options"]]
        target_value = None if gold_answer is None else str(gold_answer["selected"])
        target_index = (
            candidates.index(target_value) if target_value is not None else 0
        )
    elif mode == "SCORE":
        candidates = [
            str(item["label"]) + ": " + str(item.get("description", ""))
            for item in question["rubric"]
        ]
        target_level = (
            None if gold_answer is None else int(gold_answer["selectedLevel"])
        )
        levels = [int(item["level"]) for item in question["rubric"]]
        target_index = (
            levels.index(target_level) if target_level is not None else 0
        )
    else:
        raise ValueError("unsupported decision mode: " + mode)
    return CandidateGroup(qid, mode, candidates, target_index)


class AERCoreModel(nn.Module):
    """Dynamic candidate scorer; task/provider classes are runtime data."""

    def __init__(self, base_model: str):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(base_model)
        hidden = int(self.encoder.config.hidden_size)
        self.scorer = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.GELU(),
            nn.Linear(hidden, 1),
        )

    def forward(
        self,
        input_ids: Tensor,
        attention_mask: Tensor,
        group_sizes: Sequence[int],
    ) -> List[Tensor]:
        outputs = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
        )
        mask = attention_mask.unsqueeze(-1).float()
        pooled = (outputs.last_hidden_state * mask).sum(dim=1) / mask.sum(
            dim=1
        ).clamp_min(1.0)
        logits = self.scorer(pooled).squeeze(-1)
        groups: List[Tensor] = []
        offset = 0
        for size in group_sizes:
            groups.append(logits[offset : offset + size])
            offset += size
        return groups


def build_candidate_text(
    record: Dict,
    question: Dict,
    candidate: str,
) -> str:
    context = record["input"].get("sanitizedContext", {})
    question_text = question.get("question", "")
    return (
        "ShortForge AER state: "
        + str(context)
        + "\nDecision mode: "
        + str(question["type"])
        + "\nQuestion: "
        + str(question_text)
        + "\nCandidate: "
        + candidate
    )


def load_tokenizer(base_model: str):
    return AutoTokenizer.from_pretrained(base_model)
