import json
import subprocess
import os

with open("artifacts/quiz-v2/render-intent-geography.json") as f:
    d = json.load(f)

t = 0.0
q4_times = {}
for s in d["scenes"]:
    dur = s["duration_seconds"]
    if "q4" in s["scene_id"]:
        q4_times[s["scene_id"]] = (t, t + dur)
        print(f"{s['scene_id']}: {t:.2f}s to {t+dur:.2f}s")
    t += dur

os.makedirs("artifacts/quiz-v2/proof_perfected", exist_ok=True)

# Extract Question 4 Card scene
card_t = q4_times["scene_14_beat_q4_card"][0] + 0.5
subprocess.run([
    "ffmpeg", "-y", "-ss", str(card_t), "-i", "artifacts/quiz-v2/quiz-v2-geography-6q.mp4",
    "-vframes", "1", "artifacts/quiz-v2/proof_perfected/q4_question_card.png"
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Extract Question 4 Countdown scene
think_t = q4_times["scene_15_beat_q4_think"][0] + 1.0
subprocess.run([
    "ffmpeg", "-y", "-ss", str(think_t), "-i", "artifacts/quiz-v2/quiz-v2-geography-6q.mp4",
    "-vframes", "1", "artifacts/quiz-v2/proof_perfected/q4_countdown.png"
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Extract Question 4 Reveal scene
reveal_t = q4_times["scene_16_beat_q4_reveal"][0] + 0.5
subprocess.run([
    "ffmpeg", "-y", "-ss", str(reveal_t), "-i", "artifacts/quiz-v2/quiz-v2-geography-6q.mp4",
    "-vframes", "1", "artifacts/quiz-v2/proof_perfected/q4_reveal.png"
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Extract Question 4 Explanation scene (around 50s, exactly matching user screenshot!)
exp_t = q4_times["scene_17_beat_q4_explanation"][0] + 1.0
subprocess.run([
    "ffmpeg", "-y", "-ss", str(exp_t), "-i", "artifacts/quiz-v2/quiz-v2-geography-6q.mp4",
    "-vframes", "1", "artifacts/quiz-v2/proof_perfected/q4_explanation.png"
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print("Saved all 4 scenes of Q4 to artifacts/quiz-v2/proof_perfected/")

