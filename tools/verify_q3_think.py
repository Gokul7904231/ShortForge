import subprocess
from PIL import Image
import numpy as np

times = [29.0, 30.0, 31.0, 32.0, 33.0]
for idx, t in enumerate(times):
    out_path = f"tmp_verify/sci_q3_think_{idx+1}.png"
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(t), "-i", "artifacts/quiz-v2/quiz-v2-science-6q.mp4",
        "-vframes", "1", out_path
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    im = Image.open(out_path)
    # Crop timer pill at y: 240..320, x: 460..620
    crop_timer = im.crop((460, 240, 620, 320))
    crop_timer.save(f"tmp_verify/crop_q3_timer_{idx+1}.png")
    
    # Crop progress bar across divider at y: 470..500, x: 100..980
    crop_bar = im.crop((100, 470, 980, 500))
    crop_bar.save(f"tmp_verify/crop_q3_bar_{idx+1}.png")

    arr_bar = np.array(crop_bar)
    is_colored = (arr_bar[:, :, 0] > 180) & (arr_bar[:, :, 2] < 100)
    bar_width = len(np.where(np.any(is_colored, axis=0))[0])

    arr_t = np.array(crop_timer)
    is_colored_t = (arr_t[:, :, 0] > 180) & (arr_t[:, :, 2] < 100)
    timer_pixels = np.sum(is_colored_t)
    
    print(f"Time {t}s (Second {idx+1}): bar_width = {bar_width}px, timer_pill_pixels = {timer_pixels}")

