import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase-admin";
import { verifySession } from "../../../../lib/auth/auth";
import { prepareTreasuryModelContext } from "../../../../lib/treasury-model-context";
import { providerFactory } from "../../../../ai/factory";

const COUNTRY_MAP: Record<string, { name: string; voice: string }> = {
  US: { name: "United States", voice: "en-US-AriaNeural" },
  GB: { name: "United Kingdom", voice: "en-GB-RyanNeural" },
  IN: { name: "India", voice: "en-IN-PrabhatNeural" },
  JP: { name: "Japan", voice: "ja-JP-KeitaNeural" },
  IT: { name: "Italy", voice: "it-IT-GianniNeural" },
  BR: { name: "Brazil", voice: "pt-BR-AntonioNeural" },
  DE: { name: "Germany", voice: "de-DE-ConradNeural" },
  FR: { name: "France", voice: "fr-FR-HenriNeural" },
  CA: { name: "Canada", voice: "en-CA-LiamNeural" },
  AU: { name: "Australia", voice: "en-AU-WilliamNeural" },
  MX: { name: "Mexico", voice: "es-MX-JorgeNeural" },
  ES: { name: "Spain", voice: "es-ES-AlvaroNeural" },
  RU: { name: "Russia", voice: "ru-RU-DmitryNeural" },
  CN: { name: "China", voice: "zh-CN-YunxiNeural" },
  ZA: { name: "South Africa", voice: "en-ZA-LukeNeural" },
  EG: { name: "Egypt", voice: "ar-EG-ShakirNeural" },
  SA: { name: "Saudi Arabia", voice: "ar-SA-HamedNeural" },
  TR: { name: "Turkey", voice: "tr-TR-AhmetNeural" },
  AR: { name: "Argentina", voice: "es-AR-TomasNeural" },
  CO: { name: "Colombia", voice: "es-CO-GonzaloNeural" },
  PE: { name: "Peru", voice: "es-PE-AlexNeural" },
  CL: { name: "Chile", voice: "es-CL-LorenzoNeural" },
  VE: { name: "Venezuela", voice: "es-VE-SebastianNeural" },
  SE: { name: "Sweden", voice: "sv-SE-MattiasNeural" },
  NO: { name: "Norway", voice: "nb-NO-FinnNeural" },
  FI: { name: "Finland", voice: "fi-FI-HarriNeural" },
  DK: { name: "Denmark", voice: "da-DK-JeppeNeural" },
  NL: { name: "Netherlands", voice: "nl-NL-ColetteNeural" },
  BE: { name: "Belgium", voice: "nl-BE-GeertNeural" },
  CH: { name: "Switzerland", voice: "de-CH-JanNeural" },
  AT: { name: "Austria", voice: "de-AT-JonasNeural" },
  PL: { name: "Poland", voice: "pl-PL-MarekNeural" },
  GR: { name: "Greece", voice: "el-GR-NestorasNeural" },
  PT: { name: "Portugal", voice: "pt-PT-DuarteNeural" },
  CZ: { name: "Czech Republic", voice: "cs-CZ-AntoninNeural" },
  HU: { name: "Hungary", voice: "hu-HU-TamasNeural" },
  RO: { name: "Romania", voice: "ro-RO-EmilNeural" },
  UA: { name: "Ukraine", voice: "uk-UA-OstapNeural" },
  IE: { name: "Ireland", voice: "en-IE-ConnorNeural" },
  NZ: { name: "New Zealand", voice: "en-NZ-MitchellNeural" },
  KR: { name: "South Korea", voice: "ko-KR-InJoonNeural" },
  SG: { name: "Singapore", voice: "en-SG-WayneNeural" },
  MY: { name: "Malaysia", voice: "ms-MY-OsmanNeural" },
  TH: { name: "Thailand", voice: "th-TH-NiwatNeural" },
  ID: { name: "Indonesia", voice: "id-ID-ArdiNeural" },
  PH: { name: "Philippines", voice: "fil-PH-AngeloNeural" },
  VN: { name: "Vietnam", voice: "vi-VN-NamMinhNeural" },
  PK: { name: "Pakistan", voice: "ur-PK-AsadNeural" },
  BD: { name: "Bangladesh", voice: "bn-BD-PradeepNeural" },
  NG: { name: "Nigeria", voice: "en-NG-AbeoNeural" }
};

export async function POST(req: Request) {
  try {
    const authenticated = await verifySession(req).catch(() => null);
    const currentUser = authenticated?.user;
    if (process.env.NODE_ENV === "production" && !currentUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const countryCode = String(body?.countryCode ?? "US").toUpperCase().trim();
    const tone = String(body?.tone ?? "challenging").trim();
    const format = String(body?.format ?? "8_rapid").trim();
    const version = Math.max(1, Number(body?.version ?? 1));

    const countryMeta = COUNTRY_MAP[countryCode] ?? COUNTRY_MAP.US;
    const flagUrl = `https://flagcdn.com/w1280/${countryCode.toLowerCase()}.png`;

    const numQuestions = format === "12_slow" ? 12 : 6;

    // Generate normalized, deterministic document ID slug
    const slug = `quiz_${countryCode.toLowerCase()}_${tone.toLowerCase()}_${format.toLowerCase()}_v${version}`;

    let cachedDoc: any = null;
    let cacheHit = false;

    // Phase 3: The Firestore Intercept (Read-Through Cache) with try/catch fallback
    try {
      const doc = await db.collection("quizzes").doc(slug).get();
      if (doc.exists) {
        cachedDoc = doc.data();
        cacheHit = true;
      }
    } catch (dbErr: any) {
      console.error(`[Firestore Intercept] Failed to query cache for ${slug}:`, dbErr.message);
    }

    if (cacheHit && cachedDoc) {
      console.log(`[Cache Intercept] HIT for document ID ${slug}`);
      return new Response(JSON.stringify(cachedDoc), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    let treasuryModel:
      Awaited<ReturnType<typeof prepareTreasuryModelContext>> | undefined;

    const ensureTreasuryModelContext = async () => {
      if (!treasuryModel) {
        treasuryModel = await prepareTreasuryModelContext({
          command: "Generate Geo Quiz: " + countryMeta.name,
          missionId:
            "mis_geo_quiz_" +
            (currentUser?.uid || countryCode.toLowerCase()),
          taskId:
            "geo-quiz-" +
            slug +
            "-v" +
            String(version),
          floorId: "floor02_scripting",
          preferredProviderId: "groq",
          subtask: "geo_quiz_generation",
          maxRetries: 0,
        });
      }
      return treasuryModel;
    };

    // Phase 4: Cache Miss - standard LLM generation via Groq SDK Node.js client
    // Feature 4: Fetch dynamic prompt blueprint from Firestore (fallback to hardcoded)
    let blueprintSystem: string | null = null;
    let blueprintUserTemplate: string | null = null;
    try {
      const bpDoc = await db.collection("prompt_blueprints").doc("geo_quiz").get();
      if (bpDoc.exists) {
        const bp = bpDoc.data();
        blueprintSystem = bp?.systemPrompt ?? null;
        blueprintUserTemplate = bp?.userPromptTemplate ?? null;
        console.log("[Blueprint] Loaded dynamic prompt blueprint from Firestore");
      }
    } catch (bpErr: any) {
      console.warn("[Blueprint] Firestore fetch failed, using hardcoded prompt:", bpErr.message);
    }
    const apiKey = process.env.GROQ_API_KEY || "";

    const system = blueprintSystem ?? `You are a viral YouTube Shorts script and quiz generator.
You MUST output a single, flat JSON object containing:
- hook (string): a challenging or provocative opening hook line targeted at the country's audience.
- questions (array of objects): each object must have the fields:
  - question (string)
  - options (array of exactly 4 strings)
  - answerIndex (number, from 0 to 3)
- visual_prompt (string): a descriptive prompt for background visual generation.

No markdown formatting, no conversational text, and no code blocks. Output MUST be valid JSON only conforming to this schema.`;

    // Instruct LLM to generate DIFFERENT trivia facts if version > 1
    const variationInstruction = version > 1
      ? `Ensure you generate a completely DIFFERENT set of questions, facts, and trivia than you did in version ${version - 1} or earlier. Do not repeat facts.`
      : "";

    const prompt = `
Generate a localized trivia quiz targeted at citizens of ${countryMeta.name} (${countryCode}) with tone level "${tone}".
${variationInstruction}
The output must be a single JSON object matching this exact format:
{
  "hook": "...",
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answerIndex": 0
    }
  ],
  "visual_prompt": "..."
}

Rules:
- "hook" should be a challenging/provocative opening hook line targeted at people from ${countryMeta.name} (e.g. "If you are a true citizen of Japan, you should pass this test!").
- "questions" MUST CONTAIN EXACTLY ${numQuestions} TRIVIA QUESTIONS about ${countryMeta.name}. DO NOT GENERATE MORE OR LESS THAN ${numQuestions}.
- Each question must contain exactly 4 options.
- "answerIndex" must be the correct option's index in the "options" list (0 to 3).
- "visual_prompt" must be a descriptive prompt for generating the background graphic.
`;

    // 1) Treasury-gated model invocation with constrained JSON output.
    const t0 = performance.now();
    const treasuryModel = await ensureTreasuryModelContext();
    const llm = providerFactory("groq", {
      apiKey,
      treasuryContext: treasuryModel.context,
    });
    const raw = await llm.generateText({
      prompt,
      system,
      temperature: 0.7,
      maxTokens: 1024,
    });
    const t1 = performance.now();
    console.log(
      `[Treasury Geo Quiz] Model execution completed in ${(t1 - t0).toFixed(2)} ms`,
    );

    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      }
    }

    if (!data || !Array.isArray(data.questions)) {
      throw new Error("Failed to parse valid Treasury-backed geo quiz payload");
    }

    // Phase 4.5: YouTubeMonetizationMentor Auditing Layer (Feature 5: hooks[] A/B Matrix)
    console.log("[Mentor Node] Initiating YPP Monetization Audit + Hook A/B Matrix...");
    const mentorSystem = `You are an elite YouTube Shorts Monetization Auditor. Review the raw quiz script JSON. Your job:
1. Protect the channel from YouTube Partner Program (YPP) rejections.
2. Check for repetitious/boring pacing, policy violations, or overly generic topics.
3. Generate 3 distinct viral hook variations for A/B testing.
If the content passes, output it with 3 hook variations. If it fails, rewrite to guarantee it passes.
Return a valid JSON object with "hooks" (array of 3 strings), "questions", and "visual_prompt".`;

    const mentorPrompt = `Here is the raw quiz script JSON:
${JSON.stringify(data, null, 2)}

Audit it and output a valid JSON object with this exact format:
{
  "hooks": ["...hook variant 1...", "...hook variant 2...", "...hook variant 3..."],
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answerIndex": 0
    }
  ],
  "visual_prompt": "..."
}`;

    const mentorLlM = providerFactory("groq", {
      apiKey,
      treasuryContext: (await ensureTreasuryModelContext()).context,
    });
    const mentorRaw = await mentorLlM.generateText({
      prompt: mentorPrompt,
      system: mentorSystem,
      temperature: 0.5,
      maxTokens: 1024,
    }); mentorCompletion.choices[0]?.message?.content;
    if (!mentorRaw) {
      throw new Error("Mentor node returned empty content");
    }

    let auditedData: any = null;
    try {
      auditedData = JSON.parse(mentorRaw);
    } catch {
      const match = mentorRaw.match(/\{[\s\S]*\}/);
      if (match) {
        auditedData = JSON.parse(match[0]);
      }
    }

    if (!auditedData || !Array.isArray(auditedData.questions)) {
      throw new Error("Failed to parse valid audited JSON payload from Mentor: " + mentorRaw);
    }

    // Normalise hooks: accept either hooks[] array OR legacy hook string
    const hooksArray: string[] = Array.isArray(auditedData.hooks) && auditedData.hooks.length > 0
      ? auditedData.hooks
      : [auditedData.hook ?? data.hook ?? `If you are a true citizen of ${countryMeta.name}, can you pass this test?`];

    data = { ...auditedData, hooks: hooksArray };
    console.log(`[Mentor Node] YPP Audit complete. ${hooksArray.length} hook variant(s) generated.`);

    const quizDoc = {
      quizId: slug,
      status: "draft",
      country: countryMeta.name,
      countryCode,
      voiceCode: countryMeta.voice,
      flagUrl: flagUrl,
      // Feature 5: A/B Matrix — store hooks array; first hook is the primary
      hooks: data.hooks,
      hook: data.hooks[0] ?? `If you are a true citizen of ${countryMeta.name}, you should pass this test!`,
      questions: data.questions.map((q: any) => ({
        question: q.question,
        options: q.options,
        answerIndex: typeof q.answerIndex === "number" ? q.answerIndex : 0,
        duration: 5,
      })),
      gradingScale: `0/${numQuestions}: Tourist. ${numQuestions}/${numQuestions}: True Citizen.`,
      visualPrompt: data.visual_prompt || `Trivia quiz about ${countryMeta.name}`,
      tone,
      format,
      version,
      createdAt: new Date().toISOString(),
    };

    // Save fresh generation to Firestore with try/catch protection
    try {
      await db.collection("quizzes").doc(slug).set(quizDoc);
      console.log(`[Cache Intercept] MISS. Saved new quiz document to Firestore under ID ${slug}`);
    } catch (writeErr: any) {
      console.error(`[Firestore Intercept] Failed to save cache for ${slug}:`, writeErr.message);
    }

    // Feature 3: Log generation event to generation_logs for analytics heatmap
    try {
      await db.collection("generation_logs").add({
        quizId: slug,
        countryCode,
        country: countryMeta.name,
        tone,
        format,
        numQuestions,
        version,
        hooksCount: data.hooks.length,
        timestamp: new Date().toISOString(),
      });
    } catch (logErr: any) {
      console.warn("[Analytics] Failed to write generation log:", logErr.message);
    }

    return new Response(JSON.stringify(quizDoc), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
