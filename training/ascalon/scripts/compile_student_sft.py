"""Project Ascalon — Student SFT Dataset Compiler (Qwen4-Only Standard)
Compiles verified Qwen4 teacher responses into leak-free SFT datasets for:
1. Ascalon (Qwen3.5-4B): Deep cognitive planner (coarse_analysis -> deliberate_plan -> decision_ir)
2. CLM / AER-Core (Qwen2.5-1.5B): Fast permutation-invariant decision scoring head

MANDATORY INVARIANTS:
1. QWEN4-ONLY PROVENANCE: Strictly rejects any input from non-Qwen4 or template sources.
   Every accepted record must explicitly carry `teacher_model: "qwen4"`.
2. ZERO LEAKAGE: FORBIDDEN_LEAK_KEYS ('deterministic_ground_truth', 'winning_action_id', 'rejected_reasons')
   are recursively stripped from student prompts.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_BATCH_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
DEFAULT_TEACHER_INPUTS = Path(__file__).resolve().parent.parent / "data" / "teacher" / "qwen4_teacher_output.jsonl"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "sft"

FORBIDDEN_LEAK_KEYS = {
    "deterministic_ground_truth",
    "winning_action_id",
    "rejected_reasons",
}


def compute_state_fingerprint(packet: Dict[str, Any]) -> str:
    """Deterministic SHA-256 state fingerprint prefix."""
    serialized = json.dumps({
        "domain": packet.get("domain"),
        "floor_id": packet.get("floor_id"),
        "mission_context": packet.get("mission_context"),
        "epistemic_state": packet.get("epistemic_state"),
        "candidate_actions": packet.get("candidate_actions"),
    }, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:32]


def sanitize_student_packet(packet: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively strip all FORBIDDEN_LEAK_KEYS from student-visible context."""
    clean = {}
    for key, value in packet.items():
        if key in FORBIDDEN_LEAK_KEYS:
            continue
        if isinstance(value, dict):
            clean[key] = sanitize_student_packet(value)
        elif isinstance(value, list):
            clean[key] = [
                sanitize_student_packet(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            clean[key] = value
    return clean


def verify_no_leakage(text_payload: str, pid: str) -> None:
    """Enforce absolute zero leakage of answer keys into student prompt."""
    for forbidden in FORBIDDEN_LEAK_KEYS:
        if forbidden in text_payload:
            raise ValueError(f"[CRITICAL LEAK] '{forbidden}' detected in student prompt for packet '{pid}'!")


def compile_ascalon_prompt(packet: Dict[str, Any]) -> Dict[str, Any]:
    """Build Ascalon (Qwen3.5-4B) student prompt without ground truth leakage."""
    clean_packet = sanitize_student_packet({
        "packet_id": packet["packet_id"],
        "domain": packet.get("domain"),
        "floor_id": packet.get("floor_id"),
        "source_evidence_refs": packet.get("source_evidence_refs", []),
        "mission_context": packet.get("mission_context", {}),
        "epistemic_state": packet.get("epistemic_state", {}),
        "candidate_actions": packet.get("candidate_actions", []),
    })

    serialized = json.dumps(clean_packet, indent=2, ensure_ascii=False)
    verify_no_leakage(serialized, packet["packet_id"])

    prompt = (
        "You are Ascalon (Qwen3.5-4B), the deep cognitive planner and IR synthesizer for ShortForge / FactoryOS.\n"
        "Evaluate the following situation packet under zero-trust governance invariants and synthesize your decision.\n"
        "Output your reasoning in structured coarse-to-fine JSON: coarse_analysis, deliberate_plan, decision_ir.\n\n"
        f"SITUATION_PACKET:\n{serialized}"
    )

    return {
        "packet_id": packet["packet_id"],
        "system": "You are Ascalon (Qwen3.5-4B), the deep cognitive planner for ShortForge / FactoryOS.",
        "prompt": prompt,
    }


def compile_clm_prompt(packet: Dict[str, Any]) -> Dict[str, Any]:
    """Build CLM / AER-Core (Qwen2.5-1.5B) student prompt without ground truth leakage."""
    clean_packet = sanitize_student_packet({
        "packet_id": packet["packet_id"],
        "domain": packet.get("domain"),
        "floor_id": packet.get("floor_id"),
        "state_fp": compute_state_fingerprint(packet),
        "epistemic_state": packet.get("epistemic_state", {}),
        "candidate_actions": packet.get("candidate_actions", []),
    })

    serialized = json.dumps(clean_packet, indent=2, ensure_ascii=False)
    verify_no_leakage(serialized, packet["packet_id"])

    prompt = (
        "You are CLM / AER-Core (Qwen2.5-1.5B), the fast permutation-invariant decision scoring head for ShortForge.\n"
        "Score the candidate actions, output epistemic confidence, and identify hard negatives.\n\n"
        f"INPUT_STATE:\n{serialized}"
    )

    return {
        "packet_id": packet["packet_id"],
        "system": "You are CLM / AER-Core (Qwen2.5-1.5B), the fast decision head for ShortForge.",
        "prompt": prompt,
    }


def load_raw_packets(batch_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Load raw situation packets from batch files or packet jsonl files."""
    packets: Dict[str, Dict[str, Any]] = {}

    # Check batch_*.json
    batch_files = sorted(batch_dir.glob("batch_*.json"))
    for bf in batch_files:
        try:
            with open(bf, "r", encoding="utf-8") as f:
                data = json.load(f)
                pkts = data.get("packets", [])
                for p in pkts:
                    packets[p["packet_id"]] = p
        except Exception as e:
            print(f"[!] Warning reading {bf.name}: {e}")

    # Check packet_*.jsonl files if present
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


def load_qwen4_teacher_records(teacher_inputs: Path) -> Dict[str, Dict[str, Any]]:
    """Load and validate verified Qwen4 teacher outputs.
    Strictly enforces Qwen4-only provenance.
    """
    teacher_records: Dict[str, Dict[str, Any]] = {}
    input_files: List[Path] = []

    if teacher_inputs.is_file():
        input_files.append(teacher_inputs)
    elif teacher_inputs.is_dir():
        input_files.extend(sorted(teacher_inputs.glob("qwen4_*.jsonl")))
        input_files.extend(sorted(teacher_inputs.glob("qwen4_*.json")))
        input_files.extend(sorted(teacher_inputs.glob("qwen4_*.txt")))

    rejected_count = 0
    for fpath in input_files:
        if not fpath.exists():
            continue
        with open(fpath, "r", encoding="utf-8") as f:
            for line_idx, line in enumerate(f, 1):
                raw = line.strip()
                if not raw:
                    continue
                try:
                    record = json.loads(raw)
                except Exception:
                    continue

                # Handle array of records or single record
                rows = record if isinstance(record, list) else [record]
                for row in rows:
                    model_tag = str(row.get("teacher_model", "")).strip().lower()
                    if model_tag != "qwen4":
                        rejected_count += 1
                        continue

                    pid = row.get("packet_id")
                    if pid and "ascalon" in row and "clm" in row:
                        teacher_records[pid] = row

    if rejected_count > 0:
        print(f"[!] Enforced Qwen4 Policy: Rejected {rejected_count} non-Qwen4 / template records.")

    return teacher_records


def compile_sft(
    batch_dir: Path = DEFAULT_BATCH_DIR,
    teacher_inputs: Path = DEFAULT_TEACHER_INPUTS,
    out_dir: Path = DEFAULT_OUT_DIR,
) -> int:
    """Compile SFT datasets strictly from Qwen4 teacher records."""
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_packets = load_raw_packets(batch_dir)
    print(f"[*] Loaded {len(raw_packets)} raw situation packets from: {batch_dir}")

    qwen4_teachers = load_qwen4_teacher_records(teacher_inputs)
    print(f"[*] Loaded {len(qwen4_teachers)} verified Qwen4 teacher outputs from: {teacher_inputs}")

    ascalon_rows = []
    clm_rows = []

    for pid, teacher in qwen4_teachers.items():
        if pid not in raw_packets:
            continue
        pkt = raw_packets[pid]

        ascalon_prompt = compile_ascalon_prompt(pkt)
        clm_prompt = compile_clm_prompt(pkt)

        asc_target = teacher["ascalon"]
        clm_target = teacher["clm"]

        # Ascalon SFT Row
        ascalon_rows.append({
            "packet_id": pid,
            "teacher_model": "qwen4",
            "messages": [
                {"role": "system", "content": ascalon_prompt["system"]},
                {"role": "user", "content": ascalon_prompt["prompt"]},
                {"role": "assistant", "content": json.dumps(asc_target, indent=2, ensure_ascii=False)},
            ],
            "provenance_tier": pkt.get("deterministic_ground_truth", {}).get("provenance_tier", "GOLD"),
        })

        # CLM SFT Row
        clm_rows.append({
            "packet_id": pid,
            "teacher_model": "qwen4",
            "messages": [
                {"role": "system", "content": clm_prompt["system"]},
                {"role": "user", "content": clm_prompt["prompt"]},
                {"role": "assistant", "content": json.dumps(clm_target, indent=2, ensure_ascii=False)},
            ],
            "provenance_tier": pkt.get("deterministic_ground_truth", {}).get("provenance_tier", "GOLD"),
        })

    ascalon_out = out_dir / "ascalon_qwen35_4b_sft.jsonl"
    clm_out = out_dir / "clm_qwen25_15b_sft.jsonl"

    with open(ascalon_out, "w", encoding="utf-8") as f:
        for r in ascalon_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(clm_out, "w", encoding="utf-8") as f:
        for r in clm_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print("\n=========================================================================")
    print("SFT COMPILATION REPORT (Qwen4-Only Standard)")
    print(f"  Raw Situation Packets Available : {len(raw_packets)}")
    print(f"  Verified Qwen4 Teacher Packets  : {len(qwen4_teachers)}")
    print(f"  Compiled Ascalon SFT Rows       : {len(ascalon_rows)} -> {ascalon_out}")
    print(f"  Compiled CLM SFT Rows           : {len(clm_rows)} -> {clm_out}")
    print("  Ground-Truth Leak Check         : PASS (0 leaks)")
    print("=========================================================================\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Ascalon SFT Compiler (Qwen4-Only Standard)")
    parser.add_argument("--batch-dir", type=Path, default=DEFAULT_BATCH_DIR, help="Path to raw situation packets")
    parser.add_argument("--teacher-inputs", type=Path, default=DEFAULT_TEACHER_INPUTS, help="Path to Qwen4 teacher output file/dir")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="Output directory for compiled SFT files")
    args = parser.parse_args()

    return compile_sft(args.batch_dir, args.teacher_inputs, args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
