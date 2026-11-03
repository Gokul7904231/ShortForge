/**
 * Universal Quiz Content Engine — Normalized Payload & Schema Contract
 * 
 * Provides an authoritative category-agnostic bridge between upstream content
 * generation (Geography, Science, History, AI, Custom topics) and downstream
 * video compositing (TemplateProductionPipeline & NativeFrameCompositor).
 */

export type OptionId = "A" | "B" | "C" | "D";

export interface UniversalQuizOption {
  id: OptionId;
  text: string;
}

export interface UniversalQuizQuestion {
  id: string;
  question: string;
  options: [
    UniversalQuizOption,
    UniversalQuizOption,
    UniversalQuizOption,
    UniversalQuizOption
  ];
  correctOptionId: OptionId;
  correctAnswerText: string;
  explanation: string;
  narration: {
    question: string;
    options: string[];
    answer: string;
    explanation: string;
  };
  visual: {
    description: string;
    assetRef?: string;
  };
  sources: string[];
}

export interface UniversalQuizCategory {
  id: string;
  label: string;
  topic?: string;
  themeToken?: string;
  accentColor?: string;
}

export interface UniversalQuizPayload {
  templateId: "quiz.universal.glass.v1" | "quiz.quizshow.v1" | "quiz.universal.cinematic.v2";
  category: UniversalQuizCategory;
  title: string;
  hook: string;
  questions: UniversalQuizQuestion[];
  branding?: {
    productName?: string;
    outroText?: string;
    categoryBadge?: string;
  };
}

/**
 * Normalizes any raw quiz generation draft (Geo, Science, History, Custom)
 * into a strictly validated UniversalQuizPayload.
 */
export function normalizeToUniversalQuizPayload(raw: any): UniversalQuizPayload {
  const categoryTopic = String(raw.topic || raw.category?.topic || raw.category?.label || "General Knowledge").trim();
  const categoryId = String(raw.category?.id || raw.countryCode || categoryTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
  const categoryLabel = String(raw.category?.label || raw.categoryBadge || `${categoryTopic.toUpperCase()} QUIZ`).trim();

  const title = String(raw.title || `${categoryTopic} Universal Quiz`).trim();
  const questionCount = Array.isArray(raw.questions) ? raw.questions.length : 6;
  const hook = String(raw.hook || `Can you score ${questionCount}/${questionCount} on this ${categoryTopic} challenge?`).trim();
  const outroText = String(raw.cta || raw.branding?.outroText || `How many did you get right out of ${questionCount}? Comment your score and subscribe!`).trim();

  const rawQuestions: any[] = Array.isArray(raw.questions) ? raw.questions : [];
  if (rawQuestions.length === 0) {
    throw new Error(`[UniversalQuizPayload] Cannot normalize payload with 0 questions for topic "${categoryTopic}".`);
  }

  const optionLetters: OptionId[] = ["A", "B", "C", "D"];

  const questions: UniversalQuizQuestion[] = rawQuestions.map((q: any, idx: number) => {
    const qId = String(q.id || q.questionId || `q${idx + 1}`);
    const qText = String(q.question || `Question ${idx + 1}`).trim();
    
    // Extract 4 options
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    if (rawOptions.length < 4) {
      throw new Error(`[UniversalQuizPayload] Question #${idx + 1} (${qId}) has fewer than 4 options.`);
    }

    const options: [UniversalQuizOption, UniversalQuizOption, UniversalQuizOption, UniversalQuizOption] = [
      { id: "A", text: typeof rawOptions[0] === "string" ? rawOptions[0] : String(rawOptions[0]?.text || "Option A") },
      { id: "B", text: typeof rawOptions[1] === "string" ? rawOptions[1] : String(rawOptions[1]?.text || "Option B") },
      { id: "C", text: typeof rawOptions[2] === "string" ? rawOptions[2] : String(rawOptions[2]?.text || "Option C") },
      { id: "D", text: typeof rawOptions[3] === "string" ? rawOptions[3] : String(rawOptions[3]?.text || "Option D") },
    ];

    // Determine correct option
    let correctLetter: OptionId = "A";
    let correctText = options[0].text;

    if (typeof q.correctOptionId === "string" && ["A", "B", "C", "D"].includes(q.correctOptionId.toUpperCase())) {
      correctLetter = q.correctOptionId.toUpperCase() as OptionId;
      const match = options.find((o) => o.id === correctLetter);
      if (match) correctText = match.text;
    } else if (typeof q.answerIndex === "number" && q.answerIndex >= 0 && q.answerIndex < 4) {
      correctLetter = optionLetters[q.answerIndex];
      correctText = options[q.answerIndex].text;
    } else if (typeof q.answer === "string") {
      const matchIdx = options.findIndex((o) => o.text.trim().toLowerCase() === q.answer.trim().toLowerCase());
      if (matchIdx >= 0) {
        correctLetter = optionLetters[matchIdx];
        correctText = options[matchIdx].text;
      }
    }

    const explanation = String(q.explanation || `The correct answer is ${correctText}.`).trim();
    const assetRef = q.visual?.assetRef || q.image_path || q.imageRef || q.image;
    const visualDesc = String(q.visual?.description || q.visualIntent || `${categoryTopic} related visual: ${correctText}`).trim();

    return {
      id: qId,
      question: qText,
      options,
      correctOptionId: correctLetter,
      correctAnswerText: correctText,
      explanation,
      narration: {
        question: `Question ${idx + 1} of ${rawQuestions.length}: ${qText}`,
        options: options.map((o) => `${o.id}: ${o.text}`),
        answer: `Option ${correctLetter}: ${correctText}!`,
        explanation,
      },
      visual: {
        description: visualDesc,
        ...(assetRef ? { assetRef } : {})
      },
      sources: Array.isArray(q.sources) ? q.sources.map(String) : [String(q.provenance?.source || categoryTopic)]
    };
  });

  return {
    templateId: raw.templateId === "quiz.universal.cinematic.v2"
      ? "quiz.universal.cinematic.v2"
      : raw.templateId === "quiz.quizshow.v1"
        ? "quiz.quizshow.v1"
        : "quiz.universal.glass.v1",
    category: {
      id: categoryId,
      label: categoryLabel,
      topic: categoryTopic,
      ...(raw.category?.themeToken ? { themeToken: raw.category.themeToken } : {}),
      ...(raw.category?.accentColor ? { accentColor: raw.category.accentColor } : {})
    },
    title,
    hook,
    questions,
    branding: {
      productName: raw.branding?.productName || "ShortForge QuizShow",
      outroText,
      categoryBadge: categoryLabel
    }
  };
}

