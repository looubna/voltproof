// Gemini on Vertex AI. Authenticates with Application Default Credentials
// (gcloud ADC locally, the service account on Cloud Run). No API keys.
import { GoogleGenAI, type GenerateContentConfig, type Part } from "@google/genai";
import type { AppConfig } from "../config";
import type { ModelUsage } from "../types";
import { EXTRACTION_INSTRUCTIONS, geminiResponseSchema, parseModelOutput } from "./schema";

let client: GoogleGenAI | null = null;

function getClient(cfg: AppConfig) {
  if (!client) client = new GoogleGenAI({ vertexai: true, project: cfg.gcpProject, location: cfg.gcpLocation });
  return client;
}

const RETRYABLE = /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|ECONNRESET|ETIMEDOUT|fetch failed/i;
const MAX_ATTEMPTS = 3;

export function isRetryable(e: unknown) {
  return RETRYABLE.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));
}

/**
 * One schema-constrained Gemini call with a timeout, retries on transient
 * errors (and on output that fails `parse`), and usage accounting.
 */
export async function callGemini<T>(
  cfg: AppConfig,
  model: string,
  parts: Part[],
  config: GenerateContentConfig,
  parse: (text: string) => T,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ result: T; usage: ModelUsage }> {
  const ai = getClient(cfg);
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { temperature: 0, ...config, abortSignal: AbortSignal.timeout(cfg.geminiTimeoutMs) },
      });
      const text = response.text;
      if (!text) throw new Error("The model returned an empty response.");
      let result: T;
      try {
        result = parse(text);
      } catch (e) {
        // Malformed output is worth one more try; a second failure is reported.
        if (attempt < 2) {
          lastError = e;
          continue;
        }
        throw e;
      }
      return {
        result,
        usage: {
          model,
          latencyMs: Date.now() - started,
          attempts: attempt,
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    } catch (e) {
      lastError = e;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (attempt === MAX_ATTEMPTS || !(timedOut || isRetryable(e))) break;
      await sleep(600 * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function extractWithGemini(file: Buffer, mimeType: string, cfg: AppConfig, model = cfg.geminiModel) {
  const { result, usage } = await callGemini(
    cfg,
    model,
    [{ inlineData: { mimeType, data: file.toString("base64") } }, { text: "Extract the fields from this document." }],
    { systemInstruction: EXTRACTION_INSTRUCTIONS, responseMimeType: "application/json", responseSchema: geminiResponseSchema },
    (text) => parseModelOutput(text, cfg.minConfidence),
  );
  return { ...result, usage };
}

/** Test hook: replace the Vertex client. */
export function setGeminiClientForTests(c: unknown) {
  client = c as GoogleGenAI | null;
}
