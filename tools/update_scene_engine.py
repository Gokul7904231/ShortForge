import sys

path = "packages/factoryos-render/src/factoryos_render/engine/scene_engine.py"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

target = """        # Rule 55 Fast-Path Optimization: If scene has no complex per-frame motion, loop single frame
        is_static = True
        for shot in scene.shots:
            if (
                shot.motion
                and (shot.motion.get("animated") is True or shot.motion.get("type") == "DYNAMIC")
            ) or any(
                key in (shot.props or {})
                for key in ("animations", "editorAnimations", "effects", "editorEffects", "masks", "editorMasks", "transitionIn", "transitionOut")
            ):
                is_static = False
                break"""

replacement = """        # Rule 55 Fast-Path Optimization: If scene has no complex per-frame motion, loop single frame
        is_static = True
        for shot in scene.shots:
            if (
                shot.recipe_id in ("COUNTDOWN", "TIMER")
                or (shot.props and (
                    shot.props.get("recipe_id") in ("COUNTDOWN", "TIMER")
                    or shot.props.get("thinkGate") is True
                    or shot.props.get("animated") is True
                ))
            ):
                is_static = False
                break
            if (
                shot.motion
                and (shot.motion.get("animated") is True or shot.motion.get("type") == "DYNAMIC")
            ) or any(
                key in (shot.props or {})
                for key in ("animations", "editorAnimations", "effects", "editorEffects", "masks", "editorMasks", "transitionIn", "transitionOut")
            ):
                is_static = False
                break"""

# Normalize line endings
text_normalized = text.replace("\r\n", "\n")
target_normalized = target.replace("\r\n", "\n")
replacement_normalized = replacement.replace("\r\n", "\n")

if target_normalized in text_normalized:
    updated = text_normalized.replace(target_normalized, replacement_normalized)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(updated)
    print("SUCCESS: Updated scene_engine.py")
else:
    print("ERROR: Target string not found in scene_engine.py")

