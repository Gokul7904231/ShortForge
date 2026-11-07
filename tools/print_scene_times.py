import json

with open("artifacts/quiz-v2/render-intent-science.json") as f:
    data = json.load(f)

cum_time = 0.0
for s in data["scenes"]:
    dur = s["duration_seconds"]
    print(f"{s['scene_id']:<35} | {cum_time:6.2f}s -> {cum_time + dur:6.2f}s ({dur:4.2f}s)")
    cum_time += dur

