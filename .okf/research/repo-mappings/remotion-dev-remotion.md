
# Repository Mapping: remotion-dev/remotion

> Status: SELECTED ENGINEERING STACK
> Adoption Mode: PRIMARY PROGRAMMATIC VIDEO COMPOSITION / LICENSE-GATED DEPENDENCY
> Scope: F05 Timeline Composition, render compilation, visual effects, and programmatic video generation

## 1. Why it matters to ShortForge

Remotion provides a mature programmatic video composition model in React with explicit video configuration and frame-based timing.

ShortForge's canonical TimelineIR already separates semantic media composition from physical rendering. Remotion therefore fits as an engine target behind TimelineIR rather than becoming the source of truth.

## 2. Useful mechanisms

Assimilate these mechanisms:

- Composition with explicit duration, fps, width, and height
- useCurrentFrame() for frame-relative animation
- Sequence / timeline composition
- dynamic metadata calculation
- HTML / Canvas composition
- WebGL rendering/effects where appropriate
- programmatic render APIs
- deterministic rendering contracts
- schema-aware composition inputs

## 3. Factory mapping

~~~
TimelineIR
   |
RemotionCompiler
   |
React Composition
   |
Chromium / render runtime
   |
physical MP4
   |
ArtifactResolver
   |
F07 verification
~~~

## 4. What ShortForge adopts

- Frame-clock semantics.
- Explicit composition contracts.
- Engine-specific compiler boundary.
- WebGL as an optional rendering capability.
- Programmatic composition as a deterministic target.

## 5. What ShortForge does not adopt

- Renderer-owned semantic truth.
- Bypass of TimelineIR.
- Unbounded arbitrary agent-authored render code.
- Any claim that a render is verified merely because Remotion completed.

## 6. Licensing governance

Remotion is source-available and governed by its own license. The current official license FAQ states that organizations / teams over the Free License threshold require a Company License, and automated video products can fall under the Automators licensing model.

Therefore:

- verify license eligibility before production automation
- record the license decision
- do not treat Remotion as MIT / Apache / BSD open source
- do not silently embed a license assumption into deployment automation

## 7. Validation

A Remotion compiler is production-ready only after:

- TimelineIR compiler tests
- deterministic frame tests
- render repeatability checks
- WebGL capability checks where used
- physical artifact hashing
- F07 verification
- staging render proof
- license verification

## 8. Canonical source

Repository:
https://github.com/remotion-dev/remotion

Documentation:
https://www.remotion.dev/docs

## 9. Engineering-stack lock

Remotion is the selected primary programmatic composition foundation for ShortForge. It must remain behind TimelineIR and RenderFabric.

Remotion-derived mechanisms to prioritize:
- frame-addressed timing
- explicit composition contracts
- React composition boundaries
- Sequence/timeline primitives
- Canvas/WebGL capability where needed
- programmatic rendering

Do not let renderer-specific representations replace TimelineIR.

## 10. Current license gate

The current Remotion licensing documentation states that Remotion is source-available rather than OSI-approved open source. The Free License covers individuals and organizations/teams up to three people under the published terms; larger organizations may require a Company License, and automation products can fall under the Automators licensing model when the Company License applies.

ShortForge must perform a license check before production rollout or any material change in organizational usage.
