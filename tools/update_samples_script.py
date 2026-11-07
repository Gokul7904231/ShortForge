path = "tools/render_quizshow_v2_samples.ts"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("categoryBadge: `${dataset.category.toUpperCase()} • Q`,", "categoryBadge: `${dataset.category.toUpperCase()} | QUIZ`,")
text = text.replace("categoryBadge: `${dataset.category.toUpperCase()} • QUIZ`,", "categoryBadge: `${dataset.category.toUpperCase()} | QUIZ`,")

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Updated render_quizshow_v2_samples.ts")

