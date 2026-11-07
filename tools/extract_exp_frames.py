import subprocess
from PIL import Image

# Extract Geography Explanation at 7.0s
out_geo = "tmp_verify/geo_q1_exp.png"
subprocess.run([
    "ffmpeg", "-y", "-ss", "7.5", "-i", "artifacts/quiz-v2/quiz-v2-geography-6q.mp4",
    "-vframes", "1", out_geo
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Extract Science Q3 Explanation at 36.5s
out_sci = "tmp_verify/sci_q3_exp.png"
subprocess.run([
    "ffmpeg", "-y", "-ss", "36.5", "-i", "artifacts/quiz-v2/quiz-v2-science-6q.mp4",
    "-vframes", "1", out_sci
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print("Saved geo_q1_exp.png and sci_q3_exp.png")

