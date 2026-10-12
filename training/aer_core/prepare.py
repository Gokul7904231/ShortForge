from __future__ import annotations

import argparse
import json
from pathlib import Path

from .dataset import (
    build_manifest,
    deterministic_split,
    read_jsonl,
    training_dict,
    write_jsonl,
)
from .schema import validate_records


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and partition AER-Core data.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    records = validate_records(read_jsonl(args.input))
    partitions = deterministic_split(records)
    if not all(partitions[name] for name in ("train", "validation", "test")):
        raise RuntimeError("All dataset partitions must be non-empty.")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in partitions.items():
        write_jsonl(
            (training_dict(row) for row in rows),
            output_dir / (name + ".jsonl"),
        )

    manifest = build_manifest(partitions)
    manifest["inputRecordCount"] = len(records)
    manifest["eligibilityPolicy"] = "verified provenance + evidence/outcome + no synthetic/fallback"
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
