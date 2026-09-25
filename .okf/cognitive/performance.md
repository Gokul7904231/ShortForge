# ShortForge Performance Architecture

> Status: TARGET DESIGN / PERFORMANCE ROADMAP
> Principle: maximize useful decisions per second without weakening verification or authority boundaries.

## 1. Core idea

Do not make the main fine-tuned LLM answer every question.

Use a four-tier cognition path:

1. Deterministic path — cache, rules, state machine, exact lookups.
2. Fast Decision Core — small non-autoregressive typed-decision model.
3. ShortForge Cognitive Model — larger fine-tuned reasoning model.
4. External / heavyweight model — only for exceptional novel work.

Target flow:

    deterministic → decision core → cognitive model → heavyweight fallback

Most factory decisions should terminate in the first two tiers.

## 2. System-One-style decision core

The Fast Decision Core should resemble the useful properties demonstrated by Laya/Jev:

- non-autoregressive inference
- typed choice / score / boolean decisions
- multiple questions evaluated against one state
- calibrated uncertainty
- local deployment
- warm model process
- batch execution

Laya's public measurements report roughly 32.8 ms for one multilingual question and about 7.2 ms/question at batch size 10 on a T4. Laya also supports ONNX, GPU fast paths, batch prediction and local serving. These are reference measurements, not ShortForge targets.

ShortForge should train its own decision specialist from verified Ascalon data rather than depend permanently on an external decision provider.

## 3. One encoder, many decisions

A single compact state representation should support multiple decisions in one model pass.

Example decision pack:

- choose worker
- choose template
- choose content engine
- score risk
- score confidence
- determine whether retrieval is required
- determine whether escalation is required
- choose repair family

Do not run seven independent model calls when one encoder pass can produce seven typed heads.

## 4. Decision cascade

### Tier 0 — exact path

Use when the answer is deterministic:

- known worker capability
- existing template lookup
- cached provider status
- previously verified artifact hash
- fixed DAG transition
- known retry rule

Target: sub-millisecond local processing where practical.

### Tier 1 — Fast Decision Core

Use for:

- routing
- ranking
- classification
- risk
- quality
- escalation
- worker selection
- provider selection
- template selection
- repair-family selection

Target: warm local inference in the low-millisecond to tens-of-milliseconds range, benchmarked on actual deployment hardware.

### Tier 2 — ShortForge Cognitive Model

Use for:

- planning
- multi-step diagnosis
- research synthesis
- template construction
- architecture analysis
- unfamiliar failure modes
- complex worker replanning

### Tier 3 — heavyweight external model

Use only when local models cannot meet the required capability or confidence.

## 5. Context minimization

Never send the full FactoryState to every model.

Compile a small CognitiveContext:

- objective
- relevant state slice
- evidence references
- candidate actions
- constraints
- expected output schema
- verification contract

Cache reusable context fragments.

This reduces tokenization, memory movement and model work.

## 6. State and decision caching

Cache by content/state digest plus model and decision-schema version.

Examples:

- same research claim verification
- same provider-health decision
- same template capability match
- same artifact-quality finding
- same worker specialization decision

Invalidation must be explicit and tied to state changes.

No stale decision may cross a safety or lease boundary.

## 7. Batch by design

Workers should publish decision requests to a short-lived cognitive queue.

The decision service dynamically batches compatible requests.

Batch dimensions:

- model version
- decision schema
- input shape bucket
- priority
- capability family

High-priority interactive requests can bypass or use a tiny maximum batch delay.

NVIDIA Triton documents dynamic batching as a major throughput optimization for stateless models; the same principle should apply to the ShortForge decision service.

## 8. One warm cognitive service

Do not load the model for each request.

Keep:

- tokenizer loaded
- model weights resident
- CUDA/ONNX/TensorRT engine warmed
- memory pools initialized
- compiled graphs ready

Cold-starting a decision model should be treated as an infrastructure failure for the hot path.

## 9. Runtime acceleration

Benchmark these paths for the Fast Decision Core:

- PyTorch eager
- torch.compile
- ONNX Runtime
- TensorRT
- FP16/BF16
- INT8 where accuracy allows
- CUDA Graphs
- multiple inference instances
- dynamic batching

ONNX Runtime provides transformer-specific graph optimizations and offline optimized graphs. TensorRT supports transformer optimization and reduced precision such as FP16/BF16/FP8/INT8. Accuracy must be measured for every reduced-precision candidate.

## 10. Pipeline parallelism

The current FactoryOS topology already parallelizes F03 and F04.

Extend the idea across boundaries:

F00 research:
- source collection
- deduplication
- provenance extraction
- trend scoring

can run concurrently where dependencies allow.

F01:
- audience analysis
- engine capability inspection
- template lookup
- strategy candidates

can begin as soon as enough verified research exists.

F03 and F04:
- visual and voice generation remain parallel.

F05:
- compile timeline as soon as required verified assets exist.

F06:
- prewarm or reserve compute before F05 finishes.

F07:
- static checks should run before rendering.
- media checks can run as soon as render fragments exist.
- final verification runs after final artifact assembly.

## 11. Predictive prewarming

Do not wait for a job to arrive before preparing everything.

Based on schedule and queue forecasts:

- preload model
- preload tokenizer
- warm GPU worker
- prefetch common assets
- reserve provider capacity
- prepare common content-engine containers
- cache frequently used fonts/effects/templates

Rendering workers already use a warm model; extend the same principle to cognitive services.

## 12. Artifact locality

Minimize movement of large files.

Prefer:

compute-local temporary workspace
→ local validation
→ CAS upload once
→ asynchronous secondary delivery

Cloudinary and Drive should not serially block the core production path when both can run after the verified artifact exists.

## 13. Incremental compilation

Do not wait for all production assets when a deterministic partial artifact can already be compiled.

Use TimelineIR and artifact manifests so that:

- verified scenes can be prepared early
- only changed scenes are recompiled
- unchanged artifacts remain content-addressed
- ReMaker invalidates the smallest dependency set

## 14. Failure-aware speed

The fastest pipeline is the one that avoids rework.

Therefore:

- validate input early
- validate research claims before expensive generation
- validate engine capability before synthesis
- validate audio/video constraints before render
- keep Last-Known-Good
- use bounded repair
- repair the smallest artifact

A 50 ms extra validation step can be worthwhile if it prevents a multi-minute failed render.

## 15. Parallel cognition for the main model

When Tier 2 reasoning is required, decompose independent questions:

- research interpretation
- audience implications
- content structure
- engine constraints
- provider constraints

Run independent tasks concurrently, then have a final short synthesis step.

Avoid one giant sequential chain of model calls.

## 16. Goal: reduce expensive reasoning, not merely make one model faster

The performance equation is approximately:

    End-to-end time
      = queue
      + context preparation
      + decision
      + reasoning
      + tool I/O
      + generation
      + render
      + verification
      + delivery

Optimizing only the model misses most of the system.

## 17. Proposed hot-path targets

These are engineering targets, not claims about current implementation:

- deterministic decisions: <1 ms
- fast decision core: roughly 5–30 ms warm, benchmark on hardware
- common cognitive response: sub-second to low seconds depending on reasoning depth
- worker dispatch: asynchronous with no synchronous polling loops
- F03/F04: parallel
- render worker startup: warm whenever practical
- F07 static preflight: before expensive rendering
- final cloud delivery: asynchronous after verified artifact

## 18. Most important architectural rule

The ShortForge Cognitive Model should not be asked:

> "Think about everything."

It should be asked:

> "What is the smallest amount of cognition required to safely advance the state machine?"

This becomes the central performance philosophy.
