path = "apps/web/factoryos/core/templates/TemplateCrafter.ts"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("input.categoryBadge || `${topic.toUpperCase()} • QUIZ`", "input.categoryBadge || `${topic.toUpperCase()} | QUIZ`")
text = text.replace("headline: 'CORRECT ANSWER',", "headline: `QUESTION ${qNum} / 06`,")
text = text.replace("headline: 'EXPLANATION',", "headline: `QUESTION ${qNum} / 06`,")

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Updated TemplateCrafter.ts")

