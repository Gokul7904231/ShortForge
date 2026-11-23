"""Project Ascalon — LoRA Merge & GGUF Quantization Pipeline for Ollama
Merges trained LoRA adapters into base weights, exports consolidated FP16 models,
and executes Q4_K_M quantization for low-latency local execution on Ollama.

TARGET MODELS:
- Ascalon (Qwen3.5-4B-Instruct)
- CLM / AER-Core (Qwen2.5-1.5B-Instruct)
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

DEFAULT_OUTPUTS_DIR = Path(__file__).resolve().parent.parent / "outputs"


def generate_ollama_modelfile(
    modelfile_path: Path,
    gguf_filename: str,
    model_type: str = "ascalon",
) -> None:
    """Generate an authoritative Modelfile for Ollama integration."""
    if model_type == "ascalon":
        system_prompt = (
            "You are Ascalon (Qwen3.5-4B), the deep cognitive planner and IR synthesizer for ShortForge / FactoryOS. "
            "You evaluate distributed decision packets under zero-trust governance invariants and synthesize your "
            "decision in coarse-to-fine structure: coarse_analysis, deliberate_plan, and decision_ir. "
            "Never override deterministic safety or financial gates. Zero ungrounded facts or invented contracts."
        )
    else:
        system_prompt = (
            "You are CLM / AER-Core (Qwen2.5-1.5B), the fast permutation-invariant decision scoring head for ShortForge. "
            "You score candidate actions under bounded latency, evaluate decoupled epistemic confidence, and identify "
            "hard negatives with exact governing invariant codes. Neural confidence never overrides deterministic gates."
        )

    content = f"""FROM ./{gguf_filename}

TEMPLATE \"\"\"<|im_start|>system
{system_prompt}<|im_end|>
<|im_start|>user
{{{{ .Prompt }}}}<|im_end|>
<|im_start|>assistant
\"\"\"

PARAMETER temperature 0.1
PARAMETER top_p 0.95
PARAMETER repeat_penalty 1.05
PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
"""
    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[*] Generated Ollama Modelfile: {modelfile_path}")


def merge_and_export(
    base_model_id: str,
    adapter_path: Path,
    output_dir: Path,
    quant_type: str = "Q4_K_M",
    model_name: str = "ascalon-qwen35-4b",
) -> int:
    """Consolidate LoRA adapter with base model and prepare GGUF."""
    output_dir.mkdir(parents=True, exist_ok=True)
    merged_dir = output_dir / f"{model_name}-merged-fp16"
    gguf_fp16 = output_dir / f"{model_name}-f16.gguf"
    gguf_quant = output_dir / f"{model_name}-{quant_type.lower()}.gguf"
    modelfile_path = output_dir / f"Modelfile.{model_name}"

    print("=========================================================================")
    print("PROJECT ASCALON — GGUF EXPORT & QUANTIZATION PIPELINE")
    print(f"  Base Model   : {base_model_id}")
    print(f"  Adapter Path : {adapter_path}")
    print(f"  Target Quant : {quant_type}")
    print(f"  Output Dir   : {output_dir}")
    print("=========================================================================")

    # Step 1: Merge weights using PyTorch / PEFT if installed
    print("\n[Step 1/3] Merging LoRA weights into base model...")
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel

        print(f"[*] Loading base model: {base_model_id}")
        tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
        base_model = AutoModelForCausalLM.from_pretrained(
            base_model_id,
            torch_dtype=torch.float16,
            device_map="auto" if torch.cuda.is_available() else "cpu",
            trust_remote_code=True,
        )

        if adapter_path.exists():
            print(f"[*] Merging adapter from: {adapter_path}")
            model = PeftModel.from_pretrained(base_model, str(adapter_path))
            merged_model = model.merge_and_unload()
        else:
            print(f"[!] Adapter path {adapter_path} not found. Saving un-adapted base model for GGUF conversion...")
            merged_model = base_model

        merged_dir.mkdir(parents=True, exist_ok=True)
        merged_model.save_pretrained(str(merged_dir))
        tokenizer.save_pretrained(str(merged_dir))
        print(f"[V] Merged model saved to: {merged_dir}")
    except ImportError as e:
        print(f"[!] Torch/PEFT not available in current environment: {e}")
        print("[!] Generating placeholder conversion script and Modelfile for target environment...")

    # Step 2: Convert to GGUF via llama.cpp
    print("\n[Step 2/3] Preparing llama.cpp GGUF conversion instructions...")
    llama_convert_script = shutil.which("convert_hf_to_gguf.py") or shutil.which("llama-convert")
    if llama_convert_script and merged_dir.exists():
        print(f"[*] Executing GGUF conversion: {llama_convert_script}")
        cmd = [sys.executable, llama_convert_script, str(merged_dir), "--outfile", str(gguf_fp16), "--outtype", "f16"]
        subprocess.run(cmd, check=True)
    else:
        print(f"[*] Command to convert FP16 to GGUF in llama.cpp environment:")
        print(f"    python convert_hf_to_gguf.py {merged_dir} --outfile {gguf_fp16} --outtype f16")

    # Step 3: Quantize to target type (Q4_K_M)
    print("\n[Step 3/3] Quantizing to Q4_K_M for Ollama...")
    llama_quantize_bin = shutil.which("llama-quantize")
    if llama_quantize_bin and gguf_fp16.exists():
        cmd = [llama_quantize_bin, str(gguf_fp16), str(gguf_quant), quant_type]
        subprocess.run(cmd, check=True)
        print(f"[V] Quantized GGUF created: {gguf_quant}")
    else:
        print(f"[*] Command to quantize to {quant_type}:")
        print(f"    llama-quantize {gguf_fp16} {gguf_quant} {quant_type}")

    # Generate Ollama Modelfile
    generate_ollama_modelfile(
        modelfile_path=modelfile_path,
        gguf_filename=gguf_quant.name,
        model_type="ascalon" if "ascalon" in model_name else "clm",
    )

    print("\n=========================================================================")
    print("OLLAMA DEPLOYMENT INSTRUCTIONS:")
    print(f"  1. Ensure {gguf_quant.name} is in {output_dir}")
    print(f"  2. Run: ollama create {model_name} -f {modelfile_path}")
    print(f"  3. Test: ollama run {model_name} '{{...situation packet...}}'")
    print("=========================================================================\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="LoRA Merge and GGUF Exporter for Project Ascalon")
    parser.add_argument("--base-model", type=str, default="Qwen/Qwen2.5-1.5B-Instruct", help="HuggingFace base model ID")
    parser.add_argument("--adapter-dir", type=Path, default=DEFAULT_OUTPUTS_DIR / "ascalon_lora_adapter", help="Path to LoRA adapter")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUTS_DIR, help="Destination directory for merged/GGUF models")
    parser.add_argument("--quant-type", type=str, default="Q4_K_M", help="llama.cpp quantization type (Q4_K_M, Q5_K_M, Q8_0)")
    parser.add_argument("--model-name", type=str, default="ascalon-qwen35-4b", help="Canonical model label")
    args = parser.parse_args()

    return merge_and_export(
        base_model_id=args.base_model,
        adapter_path=args.adapter_dir,
        output_dir=args.output_dir,
        quant_type=args.quant_type,
        model_name=args.model_name,
    )


if __name__ == "__main__":
    sys.exit(main())
