# AGENTS.md — Skill Orchestration & Design Standards

This file is read by Antigravity at the start of every session in this repo. It exists
because skills only activate when the agent's read of a prompt matches a skill's
description — vague prompts ("make it nicer", "add some animation") do not reliably
trigger `apple-design` or `animate`, and even when they do, nothing currently tells
the agent which skills to chain together or what performance ceiling to respect.
This file is the missing orchestration layer.

---

## 1. Project context

- Stack: Next.js dashboard, React components, Tailwind-based styling.
- This is a product UI, not a marketing site — prioritize responsiveness and
  perceived speed over decorative motion. Every animation must justify its
  existence in terms of feedback, spatial continuity, or hierarchy — not decoration.
- Target feel: Linear / Vercel / Stripe dashboard-grade polish, not a template.
- Performance is a hard constraint, not a suggestion. This app runs real
  workloads (LLM calls, video rendering) — the UI must never compete with
  that for main-thread time.

---

## 2. Full skill inventory and what each one actually does

Don't treat these as a flat list — they exist at different layers.

### Foundational (load first, inform everything downstream)
- **`apple-design`** — Interaction physics: spring parameters (damping/response),
  velocity handoff on interrupted gestures, momentum projection, rubber-band
  resistance, translucency/depth, typography (optical sizing/tracking/leading),
  reduced-motion handling. This is *why* something feels alive, not *how* to
  code a specific animation. Always loaded before touching motion code.
- **`pick-ui-library`** — Decision framework for choosing a component library
  vs. hand-rolling. Prevents the agent from reinventing a toast/modal/dropdown
  when a maintained library already solves it well. Consult before installing
  anything or writing a component from scratch.

### Execution (do the actual work)
- **`animate`** — Builds one specific animation using its bundled `RECIPES.md`.
  Chooses curve, duration, and properties for a concrete case (entrance, exit,
  hover, drag-dismiss, etc.). Requires `apple-design` already in context —
  otherwise it picks technically-correct-but-generic values.
- **`prototype`** — Uses `PICKER.md` to scaffold rough interactive prototypes
  fast, before committing to production code. Use when exploring a new
  interaction pattern before wiring it into the real component.

### Audit / QA (run after implementation, before merge)
- **`find-animation-opportunities`** — Scans existing UI for two things: places
  that would genuinely benefit from motion (missing feedback), AND places that
  already have motion but shouldn't (excessive/distracting). Both directions
  matter — this isn't just "add more animation."
- **`review-animations`** — Strict pass/fail review against Emil's rules
  (correct easing direction, spring vs. keyframe choice, property list,
  reduced-motion compliance). Treat as a blocking gate, not a suggestion.
- **`improve-animations`** — Full-codebase audit producing a prioritized,
  self-contained fix plan any agent can execute. Run periodically across the
  whole component tree, not per-task.
- **`emil-design-eng`** — Broader design-engineering philosophy beyond just
  motion: component API design, developer-experience defaults, naming,
  invisible edge-case handling. Reference this when building new shared
  components, not one-off animations.

### Communication layer
- **`animation-vocabulary`** — Translates fuzzy human language ("make it feel
  snappy", "more premium") into precise technical instructions the agent can
  execute correctly on the first attempt. Use this mentally when a request
  is vague — restate it in this vocabulary before acting.
- **`looping-skill`** — Coordinates coding agents operating in separate
  ChatGPT/IDE sessions using coordinator-owned instruction files, agent-owned
  response reports, evidence-based review between iterations, and an explicit
  human credential-approval gate. Use for multi-agent tasks that repeat
  report → independent review → next instruction → reactivation. See
  `.agents/skills/looping-skill/SKILL.md`; this protocol does not auto-launch
  sessions or override `.okf` or release gates.

---

## 3. Mandatory task-routing table

| Task type | Skill sequence |
|---|---|
| New component from scratch | `pick-ui-library` → `apple-design` → `animate` → `review-animations` |
| Add motion to existing static component | `apple-design` → `animate` → `review-animations` |
| "This feels off / janky" | `animation-vocabulary` (clarify) → `review-animations` (diagnose) → `animate` (fix) |
| Full page/dashboard polish pass | `find-animation-opportunities` → `apple-design` → `animate` (per item) → `review-animations` |
| Periodic codebase health check | `improve-animations` |
| Multi-agent work across separate sessions | `looping-skill` → response report → independent evidence review → next instruction → manual reactivation |
| New interaction pattern, unsure of feel | `prototype` → `apple-design` → `animate` |
| Building a new shared component | `emil-design-eng` → `pick-ui-library` → `apple-design` |

**Hard rule:** `animate` is never called without `apple-design` already loaded
in the same context window. If the agent proposes an animation without having
referenced spring/damping parameters, stop and reload `apple-design` first.

---

## 4. Performance constraints (non-negotiable)

- **Only animate `transform` and `opacity`.** These are the only two properties
  that run on the compositor thread without triggering layout or paint. Never
  animate `width`, `height`, `top`, `left`, `margin`, `padding`, `box-shadow`,
  or `background-position` directly.
- **Faking non-compositor effects:**
  - Glow/shadow animation → animate the *opacity* of a pseudo-element that
    already has the shadow baked in, don't animate `box-shadow` itself.
  - Size change → animate `transform: scale()` instead of `width`/`height`
    where the visual result is equivalent.
  - Position change → animate `transform: translate()` instead of `top`/`left`.
- **`will-change: transform`** applied only to the element actively mid-
  animation, removed immediately on `animationend`/`transitionend`. Permanent
  `will-change` bloats GPU memory layers and can hurt scroll performance.
- **Springs over keyframes** for anything interruptible — drag, hover-
  triggered, gesture-driven, or anything the user might re-trigger mid-motion.
  Springs maintain velocity on interrupt; CSS keyframes restart from zero,
  producing visible jank. Plain CSS transitions are fine for simple one-shot,
  non-interruptible cases (e.g. a static fade-in on mount).
- **Max 2–3 animated properties per element simultaneously.** Stacking
  transform + opacity + filter + color on one element at once is a common
  frame-budget killer — audit for this specifically in `review-animations`.
- **`prefers-reduced-motion` respected on every animation**, no exceptions,
  including data-viz transitions and route transitions.
- **JS-driven continuous motion uses `requestAnimationFrame`, never
  `setInterval`/`setTimeout` loops.** This matters more here than average —
  the app already runs heavy background work that can spike CPU; sloppy JS
  timers compound with that.
- **60fps is the bar on a mid-tier device**, not just the dev's machine. If
  `review-animations` can't confirm this, the animation gets simplified
  before merge, not shipped "to fix later."

---

## 5. Anti-patterns to actively reject

If the agent (or a prompt) suggests any of these, push back before implementing:

- A `transition: all` rule — always list explicit properties.
- Animating on `:hover` with a duration over ~200ms — hover feedback should
  feel instant, not leisurely.
- The same easing curve on enter and exit — enter is typically ease-out
  (fast start, settle), exit is typically ease-in (accelerate away). Reusing
  one curve for both is a classic tell of unreviewed AI output.
- A loading spinner where a skeleton/shimmer would communicate more (skeletons
  preserve layout and reduce perceived wait — check `emil-design-eng`).
- Animating a list re-order by re-rendering from scratch instead of a layout
  animation / FLIP technique to smoothly transition items.
- Adding motion just because a skill flagged it as "possible" —
  `find-animation-opportunities` checks for over-animation too; read it in
  both directions.

---

## 6. Prompting template

Generic prompts produce generic output regardless of which skills are
installed. Name the skill explicitly — this is the single biggest lever for
correct behavior.

**Format:**
> "Using `[skill]` and `[skill]`, [action] on `[component]`. Constrain to
> transform/opacity only. Run `review-animations` before finalizing."

**Examples:**
- "Using apple-design and animate, add a spring entrance to the progress card
  with velocity handoff if the user dismisses it mid-animation."
- "Run find-animation-opportunities on the editor timeline — flag both
  missing feedback and anything currently over-animated."
- "Using prototype, mock three different panel-transition options before we
  commit to one."
- "Run improve-animations across the dashboard and give me a prioritized fix
  list, ranked by user-visible impact, before touching any code."

---

## 7. Verification checklist (run before calling any motion work "done")

- [ ] Only `transform`/`opacity` animated (or a documented, justified exception)
- [ ] Springs used for anything interruptible; transitions for one-shots
- [ ] `prefers-reduced-motion` fallback present
- [ ] `will-change` scoped and cleaned up, not left permanent
- [ ] Enter/exit use distinct, correct-direction easing
- [ ] No more than 2–3 properties animating on one element at once
- [ ] Confirmed smooth on a throttled/mid-tier device profile, not just locally
- [ ] `review-animations` run and passed
- [ ] If touching a shared component, `emil-design-eng` principles checked

---

## 8. File location note

Confirm where Antigravity actually resolves this file from in this project —
some agentic tools expect it at repo root, others check `.agents/AGENTS.md`
given the existing `.agents/skills/` structure. If motion tasks still aren't
routing through this file's rules, check resolution path first before
assuming the rules themselves are wrong.
