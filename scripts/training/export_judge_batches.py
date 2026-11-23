"""ShortForge / FactoryOS — Frontier Teacher Micro-Batch Exporter
Groups validated TeacherSituationPacket records into 5-packet micro-batches
with a schema-locked Multi-Teacher System Prompt and Evaluation Rubric
for frontier model distillation (Gemini, Claude, GPT).

Generates paired training targets for:
1. Ascalon (Qwen3.5-4B): coarse_analysis -> deliberate_plan -> decision_ir
2. CLM / AER-Core (Qwen2.5-1.5B): state_fp -> q_type -> probs -> epistemic_conf -> hard_neg
"""

import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SYSTEM_PROMPT = """You are acting as an Expert Teacher Model for ShortForge / FactoryOS cognitive distillation.
Your task is to evaluate and solve complex distributed decision situations and generate training targets for two downstream specialist models simultaneously:
1. Ascalon (Qwen3.5-4B): Deep cognitive planner & IR synthesizer using coarse-to-fine reasoning (ascalon schema).
2. CLM / AER-Core (Qwen2.5-1.5B): Fast, permutation-invariant decision scoring head (clm schema).

CORE GOVERNANCE INVARIANTS:
1. Zero ungrounded facts or invented contracts. All decisions must strictly respect verified facts, deterministic rules, and physical evidence refs.
2. Model Confidence != Permission. Neural likelihood scores never override deterministic safety, copyright, or financial gates.
3. Strict Fail-Closed Security. Unconfirmed states, stale fencing tokens, ambiguous quiz options, and unverified CAS digests must be rejected.
4. box9 is under strict permanent quarantine and must NEVER be scheduled or unquarantined.
5. All 11 secret categories (API keys, private keys, HMAC tokens, passwords) must remain strictly redacted.

CRITICAL OUTPUT ENFORCEMENT:
- Do NOT wrap your output in markdown code fences (such as ```json or ```).
- Emit ONLY a raw, parseable JSON array starting with '[' and ending with ']'.
- Do NOT prepend or append any conversational pleasantries, intros, thoughts, or commentary.
- Your entire response MUST be valid JSON parseable directly by json.loads().

OUTPUT SCHEMA SPECIFICATION:
Emit a JSON array containing exactly one object per input packet in the exact order received:
[
  {
    "packet_id": "<ID>",
    "ascalon": {
      "coarse_analysis": {
        "domain": "<DOMAIN>",
        "active_floor": "<FLOOR_ID>",
        "governing_invariants": ["<LIST_OF_APPLICABLE_INVARIANT_CODES>"],
        "epistemic_mode": "DETERMINISTIC | MICRO | PROBE | DEEP"
      },
      "deliberate_plan": [
        "<STEP_1_CHECK_VERIFIED_FACTS>",
        "<STEP_2_EVALUATE_CANDIDATE_TRAPS>",
        "<STEP_3_CONFIRM_DETERMINISTIC_GATE>"
      ],
      "decision_ir": {
        "selected_action_id": "<ACTION_ID>",
        "action_label": "<ACTION_LABEL>",
        "falsification_proof": "<PROOF_WHY_CHOSEN_ACTION_SATISFIES_ALL_CONSTRAINTS>",
        "hard_negative_rejections": {
          "<REJECTED_ACTION_ID>": "<EXACT_INVARIANT_CODE: concrete reason why this candidate is invalid>"
        }
      }
    },
    "clm": {
      "state_fp": "<32_char_hex_fingerprint_or_sha256_prefix>",
      "q_type": "CHOICE | NOUL | SCORE",
      "probs": {
        "<SELECTED_ACTION_ID>": 0.98,
        "<REJECTED_ACTION_1>": 0.01,
        "<REJECTED_ACTION_2>": 0.01
      },
      "epistemic_conf": 1.0,
      "hard_neg": ["<REJECTED_ACTION_1>", "<REJECTED_ACTION_2>"]
    }
  }
]
"""

EVALUATION_RUBRIC = {
    "criteria": [
        {
            "name": "Deterministic Alignment",
            "weight": 0.35,
            "description": "Selected action must strictly match winning_action_id in deterministic_ground_truth. Hard negative rejections must match the canonical INVARIANT_CODE.",
        },
        {
            "name": "Dual Target Completeness (Ascalon + CLM)",
            "weight": 0.25,
            "description": "Must output both 'ascalon' (coarse_analysis, deliberate_plan, decision_ir) and 'clm' (state_fp, q_type, probs, epistemic_conf, hard_neg) blocks.",
        },
        {
            "name": "Grounding Rigor",
            "weight": 0.20,
            "description": "Zero hallucinated rules or external assumptions; reasoning strictly cites provided verified_facts, telemetry, and constraints.",
        },
        {
            "name": "Format & Secret Discipline",
            "weight": 0.20,
            "description": "Raw JSON array without markdown code fences; zero leakage of secret tokens, ungrounded unquarantine requests, or gate overrides.",
        },
    ]
}


def export_micro_batches(batch_size: int = 5) -> None:
    data_dir = REPO_ROOT / "training" / "ascalon" / "data" / "raw"
    batches_dir = data_dir
    batches_dir.mkdir(parents=True, exist_ok=True)

    gold_path = data_dir / "packets_production_grounded.jsonl"
    curr_path = data_dir / "packets_curriculum_synthetic.jsonl"

    all_packets: List[Dict[str, Any]] = []

    for path in [gold_path, curr_path]:
        if not path.exists():
            print(f"[!] Warning: {path} not found. Run build_all_teacher_packets.py first.")
            return
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    all_packets.append(json.loads(line))

    total_packets = len(all_packets)
    total_batches = math.ceil(total_packets / batch_size)

    print(f"[*] Packaging {total_packets} packets into {total_batches} micro-batches (size={batch_size})...")

    batch_manifest = []

    for batch_idx in range(total_batches):
        batch_num = batch_idx + 1
        batch_id = f"batch_{batch_num:03d}"
        batch_file = batches_dir / f"{batch_id}.json"

        start_idx = batch_idx * batch_size
        end_idx = min(start_idx + batch_size, total_packets)
        batch_items = all_packets[start_idx:end_idx]

        batch_payload = {
            "batch_id": batch_id,
            "batch_index": batch_num,
            "total_batches": total_batches,
            "packet_count": len(batch_items),
            "system_prompt": SYSTEM_PROMPT.strip(),
            "evaluation_rubric": EVALUATION_RUBRIC,
            "packets": batch_items,
        }

        with open(batch_file, "w", encoding="utf-8") as f_out:
            json.dump(batch_payload, f_out, indent=2, ensure_ascii=False)

        domain_coverage = sorted(list(set(p["domain"] for p in batch_items)))
        batch_manifest.append({
            "batch_id": batch_id,
            "file": f"training/ascalon/data/raw/{batch_id}.json",
            "packet_count": len(batch_items),
            "packet_ids": [p["packet_id"] for p in batch_items],
            "domains": domain_coverage,
        })

    index_file = batches_dir / "index.json"
    with open(index_file, "w", encoding="utf-8") as f_idx:
        json.dump({
            "total_packets": total_packets,
            "batch_size": batch_size,
            "total_batches": total_batches,
            "batches": batch_manifest,
        }, f_idx, indent=2, ensure_ascii=False)

    print(f"[V] Successfully exported {total_batches} micro-batches to {batches_dir.relative_to(REPO_ROOT)}")
    print(f"[V] Index manifest written to {index_file.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    export_micro_batches()
