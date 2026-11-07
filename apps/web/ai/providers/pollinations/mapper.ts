export class PollinationsMapper {
  /**
   * Map standard generation params into OpenAI-compatible text completions bodies
   */
  static mapTextParams(params: any, modelId: string): any {
    const messages = [];
    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }
    messages.push({ role: "user", content: params.prompt });

    const validPollinationsModel = 
      modelId === "llama-3.3-70b-instruct" || !modelId ? "openai" : modelId;
    const body: any = {
      model: validPollinationsModel,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    };

    if (params.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    return body;
  }

  /**
   * Map standard image generation params into query strings for /image
   */
  static mapImageQuery(params: any, modelId?: string): string {
    const prompt = encodeURIComponent(params.prompt || "");
    const width = params.width || 1080;
    const height = params.height || 1920;
    const seed = params.seed || Math.floor(Math.random() * 1000000);
    
    let query = `?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    if (modelId) {
      query += `&model=${encodeURIComponent(modelId)}`;
    }
    return `/p/${prompt}${query}`;
  }
}
