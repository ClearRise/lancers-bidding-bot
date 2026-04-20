import OpenAI from "openai";
import { config } from "./config.js";
import type { ScrapedTask } from "./types.js";

type AiDecision = {
  suitable: boolean;
  reason?: string;
};

let warnedMissingPrompt = false;
let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;

  const apiKey = process.env.INFERENCE_API_KEY;
  const baseURL = process.env.INFERENCE_BASE_URL;
  if (!apiKey || !baseURL) return null;

  client = new OpenAI({
    apiKey,
    baseURL,
  });

  return client;
}

function createPrompt(task: ScrapedTask): string {
  const template = config.aiPromptTemplate;
  const snippet = task.snippet.slice(0, config.aiMaxSnippetChars);
  const includeKeywords = config.includeKeywords.join(", ");

  if (!template) return "";

  return template
    .replaceAll("{{TITLE}}", task.title)
    .replaceAll("{{SNIPPET}}", snippet)
    .replaceAll("{{INCLUDE_KEYWORDS}}", includeKeywords);
}

export async function isTaskSuitableByAi(task: ScrapedTask): Promise<AiDecision> {
  const prompt = createPrompt(task);
  if (!prompt) {
    if (!warnedMissingPrompt) {
      console.warn(
        "[ai-filter] Missing prompt text in filter_settings/ai_prompt.txt, AI filter is bypassed.",
      );
      warnedMissingPrompt = true;
    }
    return { suitable: true, reason: "prompt-missing" };
  }

  const inferenceClient = getClient();
  if (!inferenceClient) {
    console.log(`[ai-filter][${task.workId}] config_missing`);
    return {
      suitable: false,
      reason: "INFERENCE_API_KEY or INFERENCE_BASE_URL is not set",
    };
  }

  const completion = await inferenceClient.chat.completions.create({
    model: process.env.INFERENCE_MODEL ?? config.aiModel,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const raw = completion.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? JSON.stringify(raw) : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { suitable: false, reason: `[ai filter response parse failed] ${text}` };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { suitable?: boolean; reason?: string };
    return {
      suitable: parsed.suitable === true,
      reason: parsed.reason,
    };
  } catch {
    return { suitable: false, reason: `[ai filter response parse failed] ${text}` };
  }
}
