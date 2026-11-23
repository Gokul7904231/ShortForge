"""ShortForge / FactoryOS — Master TeacherSituationPacket Compiler
Compiles ground-truth situation packets across all 14 decision domains (D01-D14).
Segregates output by provenance tier:
- data/training/packets_production_grounded.jsonl (GOLD)
- data/training/packets_curriculum_synthetic.jsonl (CURRICULUM_GOLD)
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List

# Ensure scripts package is on path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from scripts.training.generators.base import TeacherSituationPacket
from scripts.training.generators.d01_research_reach import generate_d01_packets
from scripts.training.generators.d02_strategy_engine import generate_d02_packets
from scripts.training.generators.d03_narrative_script import generate_d03_packets
from scripts.training.generators.d04_asset_plan import generate_d04_packets
from scripts.training.generators.d05_voice_timing import generate_d05_packets
from scripts.training.generators.d06_composition_timeline import generate_d06_packets
from scripts.training.generators.d07_compute_routing import generate_d07_packets
from scripts.training.generators.d08_recovery_reconcile import generate_d08_packets
from scripts.training.generators.d09_release_guardian import generate_d09_packets
from scripts.training.generators.d10_epistemic_ladder import generate_d10_packets
from scripts.training.generators.d11_remaker_edit import generate_d11_packets
from scripts.training.generators.d12_governance_healer_slayer import generate_d12_packets
from scripts.training.generators.d13_treasury_context_econ import generate_d13_packets
from scripts.training.generators.d14_mcp_gateway import generate_d14_packets


GENERATORS = [
    ("D01_RESEARCH_REACH", generate_d01_packets),
    ("D02_STRATEGY_ENGINE", generate_d02_packets),
    ("D03_NARRATIVE_SCRIPT", generate_d03_packets),
    ("D04_ASSET_PLAN", generate_d04_packets),
    ("D05_VOICE_TIMING", generate_d05_packets),
    ("D06_COMPOSITION_TIMELINE", generate_d06_packets),
    ("D07_COMPUTE_ROUTING", generate_d07_packets),
    ("D08_RECOVERY_RECONCILE", generate_d08_packets),
    ("D09_RELEASE_GUARDIAN", generate_d09_packets),
    ("D10_AER_EPISTEMIC_LADDER", generate_d10_packets),
    ("D11_STUDIO_REMAKER_EDIT", generate_d11_packets),
    ("D12_GOVERNANCE_HEALER_SLAYER", generate_d12_packets),
    ("D13_TREASURY_CONTEXT_ECON", generate_d13_packets),
    ("D14_GOVERNED_MCP_GATEWAY", generate_d14_packets),
]


def compile_all_packets() -> None:
    data_dir = REPO_ROOT / "training" / "ascalon" / "data" / "raw"
    data_dir.mkdir(parents=True, exist_ok=True)

    gold_path = data_dir / "packets_production_grounded.jsonl"
    curriculum_path = data_dir / "packets_curriculum_synthetic.jsonl"

    all_packets: List[TeacherSituationPacket] = []
    domain_stats: Dict[str, Dict[str, int]] = {}

    print(f"[*] Starting deterministic situation compilation across {len(GENERATORS)} domains...")

    for domain_name, gen_fn in GENERATORS:
        packets = gen_fn()
        all_packets.extend(packets)

        gold_count = sum(1 for p in packets if p.deterministic_ground_truth["provenance_tier"] == "GOLD")
        curr_count = sum(1 for p in packets if p.deterministic_ground_truth["provenance_tier"] == "CURRICULUM_GOLD")
        domain_stats[domain_name] = {
            "total": len(packets),
            "gold": gold_count,
            "curriculum": curr_count,
        }
        print(f"  [+] {domain_name:30s} -> {len(packets):3d} packets (GOLD: {gold_count:2d}, CURRICULUM: {curr_count:2d})")

    # Verify no duplicate IDs
    seen_ids = set()
    for p in all_packets:
        if p.packet_id in seen_ids:
            raise ValueError(f"FATAL: Duplicate packet_id detected: {p.packet_id}")
        seen_ids.add(p.packet_id)

    # Write segregated JSONL files
    gold_packets = [p for p in all_packets if p.deterministic_ground_truth["provenance_tier"] == "GOLD"]
    curr_packets = [p for p in all_packets if p.deterministic_ground_truth["provenance_tier"] == "CURRICULUM_GOLD"]

    with open(gold_path, "w", encoding="utf-8") as f_gold:
        for p in gold_packets:
            f_gold.write(json.dumps(p.to_dict(), ensure_ascii=False) + "\n")

    with open(curriculum_path, "w", encoding="utf-8") as f_curr:
        for p in curr_packets:
            f_curr.write(json.dumps(p.to_dict(), ensure_ascii=False) + "\n")

    print("\n=========================================================================")
    print(f"COMPILATION COMPLETE:")
    print(f"  Total Packets Generated : {len(all_packets)}")
    print(f"  Production Grounded (GOLD)       : {len(gold_packets)} -> {gold_path.relative_to(REPO_ROOT)}")
    print(f"  Curriculum Synthetic (CURRICULUM): {len(curr_packets)} -> {curriculum_path.relative_to(REPO_ROOT)}")
    print("=========================================================================\n")


if __name__ == "__main__":
    compile_all_packets()
