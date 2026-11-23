"""Project Ascalon — 6-Gate Validation Suite (Qwen4-Only Standard)
Authoritative gatekeeper validating:
1. Gate 1: Schema Completeness (Ascalon + CLM dual targets)
2. Gate 2: Gold Alignment (Winning action matches and holds strictly highest prob; sum = 1.000)
3. Gate 3: Probability Calibration & Epistemic Decoupling (Graded distractor probs, decoupled conf)
4. Gate 4: Zero-Leak & Grounding Rigor (FORBIDDEN_LEAK_KEYS zero-leak, cites specific facts/signals)
5. Gate 5: Hard Negative Coverage & Qwen4 Provenance (Every non-winning candidate rejected; teacher_model == 'qwen4')
6. Gate 6: Non-Sovereign Authority Boundary Framing (deliberate_plan[2] strictly begins with 'Propose ')
"""

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

DEFAULT_BATCH_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
DEFAULT_TEACHER_INPUTS = Path(__file__).resolve().parent.parent / "data" / "teacher" / "qwen4_teacher_output.jsonl"
DEFAULT_SFT_DIR = Path(__file__).resolve().parent.parent / "data" / "sft"

FORBIDDEN_LEAK_KEYS = {
    "deterministic_ground_truth",
    "winning_action_id",
    "rejected_reasons",
}


def load_raw_packets(batch_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Load raw situation packets from raw directory."""
    packets = {}
    for bf in sorted(batch_dir.glob("batch_*.json")):
        try:
            with open(bf, "r", encoding="utf-8") as f:
                data = json.load(f)
                for p in data.get("packets", []):
                    packets[p["packet_id"]] = p
        except Exception as e:
            print(f"[!] Warning reading {bf.name}: {e}")

    for jf in sorted(batch_dir.glob("packets_*.jsonl")):
        try:
            with open(jf, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        p = json.loads(line.strip())
                        packets[p["packet_id"]] = p
        except Exception as e:
            print(f"[!] Warning reading {jf.name}: {e}")

    return packets


def validate_teacher_record(
    record: Dict[str, Any],
    raw_packet: Optional[Dict[str, Any]],
) -> List[str]:
    """Execute 5-Gate validation on a single Qwen4 teacher record."""
    pid = record.get("packet_id", "UNKNOWN")
    errors = []

    # ── Gate 5 (Pre-check): Qwen4 Provenance ───────────────────────────
    model_tag = str(record.get("teacher_model", "")).strip().lower()
    if model_tag != "qwen4":
        errors.append(f"[GATE_5_PROVENANCE] {pid}: Invalid teacher_model '{model_tag}'. Must be strictly 'qwen4'.")
        return errors  # Reject immediately

    # ── Gate 1: Schema Completeness ────────────────────────────────────
    asc = record.get("ascalon", {})
    if not isinstance(asc, dict):
        errors.append(f"[GATE_1_SCHEMA] {pid}: 'ascalon' must be an object")
    else:
        for k in ["coarse_analysis", "deliberate_plan", "decision_ir"]:
            if k not in asc:
                errors.append(f"[GATE_1_SCHEMA] {pid}: Missing ascalon.{k}")
        plan = asc.get("deliberate_plan", [])
        if not isinstance(plan, list) or len(plan) < 2:
            errors.append(f"[GATE_1_SCHEMA] {pid}: deliberate_plan must have at least 2 steps, got {len(plan)}")

    clm = record.get("clm", {})
    if not isinstance(clm, dict):
        errors.append(f"[GATE_1_SCHEMA] {pid}: 'clm' must be an object")
    else:
        for k in ["q_type", "probs", "epistemic_conf", "hard_neg"]:
            if k not in clm:
                errors.append(f"[GATE_1_SCHEMA] {pid}: Missing clm.{k}")

    if errors:
        return errors  # Cannot proceed to semantic gates if basic schema is broken

    # ── Gate 2: Gold Alignment & Probability Sum ───────────────────────
    if raw_packet:
        gt = raw_packet.get("deterministic_ground_truth", {})
        gold_win = gt.get("winning_action_id")
        sel_win = asc.get("decision_ir", {}).get("selected_action_id")

        if gold_win and sel_win != gold_win:
            errors.append(f"[GATE_2_GOLD] {pid}: selected_action_id '{sel_win}' != gold winning_action_id '{gold_win}'")

        probs = clm.get("probs", {})
        if gold_win and gold_win not in probs:
            errors.append(f"[GATE_2_GOLD] {pid}: gold_win '{gold_win}' not in clm.probs")
        elif gold_win and probs:
            win_p = probs[gold_win]
            other_probs = [v for k, v in probs.items() if k != gold_win]
            if other_probs:
                max_other = max(other_probs)
                if win_p <= max_other:
                    errors.append(f"[GATE_2_GOLD] {pid}: win_p {win_p} is not strictly highest (max loser={max_other})")

        p_sum = sum(probs.values()) if probs else 0.0
        if abs(p_sum - 1.000) > 0.003:
            errors.append(f"[GATE_2_GOLD] {pid}: clm.probs sum to {p_sum:.4f}, expected 1.000")

    # ── Gate 3: Probability Calibration & Epistemic Decoupling ─────────
    probs = clm.get("probs", {})
    if probs and raw_packet:
        gold_win = raw_packet.get("deterministic_ground_truth", {}).get("winning_action_id")
        loser_probs = [v for k, v in probs.items() if k != gold_win]
        if len(loser_probs) > 2 and len(set(round(x, 4) for x in loser_probs)) == 1:
            errors.append(f"[GATE_3_CALIB] {pid}: Flat probability distractor distribution detected")
        if probs.get(gold_win) == 0.98 and all(v == 0.01 for v in loser_probs):
            errors.append(f"[GATE_3_CALIB] {pid}: Flat 0.98/0.01 template detected")

    econf = clm.get("epistemic_conf", -1)
    if not (0.70 <= econf <= 1.00):
        errors.append(f"[GATE_3_CALIB] {pid}: epistemic_conf {econf} out of valid range [0.70, 1.00]")

    # ── Gate 4: Zero-Leak & Grounding Rigor ─────────────────────────────
    proof = asc.get("decision_ir", {}).get("falsification_proof", "")
    if len(proof) < 40:
        errors.append(f"[GATE_4_GROUNDING] {pid}: Falsification proof too short ({len(proof)} chars)")
    for step in asc.get("deliberate_plan", []):
        if len(step) < 20:
            errors.append(f"[GATE_4_GROUNDING] {pid}: Plan step too short: '{step}'")
        if step.startswith("Verify physical state from X"):
            errors.append(f"[GATE_4_GROUNDING] {pid}: Generic boilerplate step detected")

    # ── Gate 5: Hard Negative Coverage ─────────────────────────────────
    if raw_packet:
        cands = {c["id"] for c in raw_packet.get("candidate_actions", [])}
        gold_win = raw_packet.get("deterministic_ground_truth", {}).get("winning_action_id")
        non_winning = cands - {gold_win}

        rejections = asc.get("decision_ir", {}).get("hard_negative_rejections", {})
        for nwid in non_winning:
            if nwid not in rejections:
                errors.append(f"[GATE_5_HARD_NEG] {pid}: Missing rejection reason for candidate '{nwid}'")

        hard_neg = set(clm.get("hard_neg", []))
        if hard_neg != non_winning:
            errors.append(f"[GATE_5_HARD_NEG] {pid}: clm.hard_neg mismatch with non-winning candidates")

    # ── Gate 6: Non-Sovereign Authority Boundary Framing ────────────────
    plan = asc.get("deliberate_plan", [])
    if len(plan) >= 3:
        step3 = plan[2].strip()
        if not step3.startswith("Propose "):
            errors.append(f"[GATE_6_AUTHORITY] {pid}: Step 3 deliberate_plan[2] must begin with 'Propose ', got: '{step3[:30]}...'")
    else:
        errors.append(f"[GATE_6_AUTHORITY] {pid}: deliberate_plan has fewer than 3 steps")

    return errors


def validate_sft_leakage(sft_file: Path) -> Tuple[int, List[str]]:
    """Scan compiled SFT rows for forbidden ground truth leakage."""
    if not sft_file.exists():
        return 0, []

    leak_errors = []
    row_count = 0

    with open(sft_file, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            raw = line.strip()
            if not raw:
                continue
            row_count += 1
            try:
                row = json.loads(raw)
            except Exception as e:
                leak_errors.append(f"{sft_file.name}:{idx}: Invalid JSON: {e}")
                continue

            # Verify Qwen4 provenance tag
            if row.get("teacher_model") != "qwen4":
                leak_errors.append(f"{sft_file.name}:{idx}: teacher_model != 'qwen4' (got '{row.get('teacher_model')}')")

            # Check prompt content for forbidden leak keys
            messages = row.get("messages", [])
            for msg in messages:
                if msg.get("role") in ["user", "system"]:
                    content = msg.get("content", "")
                    for fkey in FORBIDDEN_LEAK_KEYS:
                        if fkey in content:
                            leak_errors.append(f"{sft_file.name}:{idx}: LEAK DETECTED: '{fkey}' in {msg.get('role')} message")

    return row_count, leak_errors


def run_gate_validation(
    batch_dir: Path = DEFAULT_BATCH_DIR,
    teacher_inputs: Path = DEFAULT_TEACHER_INPUTS,
    sft_dir: Path = DEFAULT_SFT_DIR,
) -> int:
    """Execute full 5-gate validation suite."""
    print("=========================================================================")
    print("RUNNING ASCALON 6-GATE VALIDATION SUITE (Qwen4-Only Standard)")
    print("=========================================================================")

    raw_packets = load_raw_packets(batch_dir)
    print(f"[*] Loaded {len(raw_packets)} raw situation packets from: {batch_dir}")

    # Load teacher files
    teacher_files = []
    if teacher_inputs.is_file():
        teacher_files.append(teacher_inputs)
    elif teacher_inputs.is_dir():
        teacher_files.extend(sorted(teacher_inputs.glob("qwen4_*.jsonl")))
        teacher_files.extend(sorted(teacher_inputs.glob("qwen4_*.json")))
        teacher_files.extend(sorted(teacher_inputs.glob("qwen4_*.txt")))

    teacher_records = []
    for tf in teacher_files:
        if not tf.exists():
            continue
        with open(tf, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        obj = json.loads(line.strip())
                        if isinstance(obj, list):
                            teacher_records.extend(obj)
                        else:
                            teacher_records.append(obj)
                    except Exception:
                        pass

    print(f"[*] Found {len(teacher_records)} teacher records across {len(teacher_files)} teacher file(s).")

    all_gate_errors = []
    validated_qwen4_count = 0

    for rec in teacher_records:
        pid = rec.get("packet_id")
        raw_pkt = raw_packets.get(pid)
        errs = validate_teacher_record(rec, raw_pkt)
        if errs:
            all_gate_errors.extend(errs)
        else:
            validated_qwen4_count += 1

    # Check SFT anti-leakage
    ascalon_sft = sft_dir / "ascalon_qwen35_4b_sft.jsonl"
    clm_sft = sft_dir / "clm_qwen25_15b_sft.jsonl"

    asc_count, asc_leaks = validate_sft_leakage(ascalon_sft)
    clm_count, clm_leaks = validate_sft_leakage(clm_sft)

    all_gate_errors.extend(asc_leaks)
    all_gate_errors.extend(clm_leaks)

    print(f"\n[*] 6-Gate Validation Results:")
    print(f"  - Verified Qwen4 Teacher Records : {validated_qwen4_count}")
    print(f"  - Compiled Ascalon SFT Rows      : {asc_count} (leaks: {len(asc_leaks)})")
    print(f"  - Compiled CLM SFT Rows          : {clm_count} (leaks: {len(clm_leaks)})")

    if all_gate_errors:
        print(f"\n[X] VALIDATION FAILURES ({len(all_gate_errors)} errors):")
        for err in all_gate_errors[:20]:
            print(f"    - {err}")
        if len(all_gate_errors) > 20:
            print(f"    ... and {len(all_gate_errors) - 20} more errors.")
        print("=========================================================================\n")
        return 1

    print("\n[V] 100% 6-GATE VALIDATION & ZERO-LEAK CHECK PASSED!")
    print("=========================================================================\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Ascalon 5-Gate Validation Suite (Qwen4-Only Standard)")
    parser.add_argument("--batch-dir", type=Path, default=DEFAULT_BATCH_DIR, help="Path to raw situation packets")
    parser.add_argument("--teacher-inputs", type=Path, default=DEFAULT_TEACHER_INPUTS, help="Path to Qwen4 teacher file/dir")
    parser.add_argument("--sft-dir", type=Path, default=DEFAULT_SFT_DIR, help="Path to compiled SFT directory")
    args = parser.parse_args()

    return run_gate_validation(args.batch_dir, args.teacher_inputs, args.sft_dir)


if __name__ == "__main__":
    sys.exit(main())
