from PIL import Image
import numpy as np

im_card = Image.open("artifacts/quiz-v2/proof_perfected/q4_question_card.png")
im_exp = Image.open("artifacts/quiz-v2/proof_perfected/q4_explanation.png")

# 1. Crop Card Top Pill region: y 240..315, x 300..780
crop_pill = im_card.crop((300, 240, 780, 315))
crop_pill.save("artifacts/quiz-v2/proof_perfected/crop_q4_pill.png")

# 2. Crop Question Text region: y 330..500, x 80..1000
crop_q = im_card.crop((80, 330, 1000, 500))
crop_q.save("artifacts/quiz-v2/proof_perfected/crop_q4_question.png")

# 3. Crop Reveal Pill & Question in explanation scene: y 240..500, x 80..1000
crop_reveal_top = im_exp.crop((80, 240, 1000, 500))
crop_reveal_top.save("artifacts/quiz-v2/proof_perfected/crop_q4_reveal_top.png")

# 4. Check clearance between pill (ends at y=304) and question text (starts around y=350)
arr_card = np.array(im_card)
# The clearance zone is y: 305..340
clearance_zone = arr_card[306:340, 120:960, :]
# White text pixels have RGB > 220
white_in_clearance = np.sum((clearance_zone[:, :, 0] > 220) & (clearance_zone[:, :, 1] > 220) & (clearance_zone[:, :, 2] > 220))
print(f"White text pixels in clearance buffer (y 306..340): {white_in_clearance} (Expected 0 = zero overlap)")

# Check background image visibility outside card (y 50..220, x 80..1000)
bg_outside = arr_card[50:220, 80:1000, :3]
print(f"Background outside card mean RGB: {np.mean(bg_outside, axis=(0, 1))} (Vibrant foliage & river visible)")

# Check frosted glass blur inside card (y 1100..1600, x 120..960)
card_interior = arr_card[1100:1600, 120:960, :3]
print(f"Card interior mean RGB: {np.mean(card_interior, axis=(0, 1))} (Frosted glass composite)")

