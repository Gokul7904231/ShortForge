import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase-admin";
import { verifySession } from "../../../../lib/auth/auth";
import { prepareTreasuryModelContext } from "../../../../lib/treasury-model-context";
import { providerFactory } from "../../../../ai/factory";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const countryCode = String(body?.countryCode ?? "US").trim();
    const tone = String(body?.tone ?? "challenging").trim();
    const numQuestions = 8;
    const negativeConstraints = Array.isArray(body?.negativeConstraints) ? body.negativeConstraints : [];
    
    const system = `You are a viral YouTube Shorts script generator. You must generate exactly ${numQuestions} rapid-fire trivia questions for a 60-second high-retention video. Do not deviate from the ${numQuestions}-question limit. The output MUST be a single JSON object. No markdown. No code blocks.`;

    let constraintText = "";
    if (negativeConstraints.length > 0) {
      // Only pass the last 24 past questions (last 3 cycles) to prevent token bloat
      const recentConstraints = negativeConstraints.slice(0, 24);
      constraintText = `\nCRITICAL NEGATIVE CONSTRAINT - DO NOT repeat or reuse any of the following questions:\n${recentConstraints.map(q => `- ${q}`).join("\n")}\n`;
    }

    const prompt = `
Generate a localized trivia quiz targeted at citizens of ${countryCode} with tone level "${tone}".
Return exactly ${numQuestions} trivia questions.${constraintText}
The output must match this exact JSON format:
{
  "theme": "...",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": "...",
      "duration": 5
    }
  ]
}
`;

    const authenticated = await verifySession(req).catch(() => null);
    const currentUser = authenticated?.user;
    if (process.env.NODE_ENV === "production" && !currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const treasuryModel = await prepareTreasuryModelContext({
      command: "Generate Quiz",
      missionId:
        "mis_quiz_generate_" +
        (currentUser?.uid || countryCode.toLowerCase()),
      taskId:
        "quiz-generate-" +
        countryCode.toLowerCase() +
        "-" +
        crypto
          .createHash("sha256")
          .update(prompt)
          .digest("hex")
          .slice(0, 16),
      floorId: "floor02_scripting",
      preferredProviderId: "openrouter",
      subtask: "quiz_generation",
      maxRetries: 2,
    });

    const modelAdapter = providerFactory("openrouter", {
      apiKey: process.env.OPENROUTER_API_KEY,
      treasuryContext: treasuryModel.context,
    });

    const rawJsonStr = await modelAdapter.generateText({
      prompt,
      system,
      temperature: 0.7,
      maxTokens: 1536,
    });

    const generatedBy = "TreasuryManagedModelRouter";
    // Try parsing
    let data: any = null;
    try {
      data = JSON.parse(rawJsonStr);
    } catch {
      const match = rawJsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      }
    }

    if (!data || !data.theme || !Array.isArray(data.questions)) {
      throw new Error(`Failed to generate a valid quiz payload. Output: ${rawJsonStr}`);
    }

    const docRef = db.collection("quizzes").doc();
    const quizId = docRef.id;
    const quizDoc = {
      quizId,
      status: "draft",
      theme: data.theme,
      questions: data.questions,
      country: countryCode,
      createdAt: new Date().toISOString(),
      _generated_by: generatedBy
    };
    
    await docRef.set(quizDoc);
    return NextResponse.json(quizDoc);
  } catch (err: any) {
    console.error("[Quiz Generate] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
