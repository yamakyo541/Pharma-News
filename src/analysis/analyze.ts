import { GoogleGenAI } from "@google/genai";
import {
  AnalysisSchema,
  analysisResponseSchema,
  type Analysis,
} from "./schema.js";
import { PHARMA_RSS_TREND_ANALYSIS_PROMPT } from "./prompts.js";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { EnrichedTweet } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { cleanText } from "../utils/post-optimizer.js";
import { isRetryableGeminiCallError, withRetry } from "../utils/retry.js";

export async function analyzeTrends(
  tweets: EnrichedTweet[],
  config: Config,
  settings: Settings,
): Promise<Analysis> {
  console.info("[4/5] 収集ニュース全体を Gemini Pro で分析中...");
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  const tweetsForPrompt = Object.entries(groupByAuthor(tweets)).map(
    ([author, items]) => ({
      author,
      posts: items.map((t) => ({
        text: cleanText(t.enrichedText),
        url: t.url,
      })),
    }),
  );

  const prompt = PHARMA_RSS_TREND_ANALYSIS_PROMPT.replace(
    "{json_data}",
    JSON.stringify(tweetsForPrompt, null, 2),
  );

  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: settings.analysis.trendAnalysisModel,
        contents: prompt,
        config: {
          temperature: settings.analysis.temperature,
          responseMimeType: "application/json",
          responseSchema: analysisResponseSchema as Record<string, unknown>,
        },
      }),
    settings.resilience,
    isRetryableGeminiCallError,
    { label: "Gemini Pro（トレンド分析）" },
  );

  const candidate = (res as { candidates?: Array<{ finishReason?: string }> })
    .candidates?.[0];

  if (candidate?.finishReason === "SAFETY") {
    throw new UserFacingError(
      "Geminiのセーフティフィルタで分析結果がブロックされました。rssMaxItems を減らすなどして再実行してください。",
    );
  }

  const text = res.text;
  if (!text) {
    throw new UserFacingError("Geminiから空の応答が返りました。");
  }

  try {
    return AnalysisSchema.parse(JSON.parse(text));
  } catch (cause) {
    throw new UserFacingError(
      "Geminiの応答をパースできませんでした。再実行してみてください。",
      { cause },
    );
  }
}

function groupByAuthor(
  tweets: EnrichedTweet[],
): Record<string, EnrichedTweet[]> {
  const groups: Record<string, EnrichedTweet[]> = {};
  for (const tweet of tweets) {
    const key = tweet.authorId || "unknown";
    (groups[key] ??= []).push(tweet);
  }
  return groups;
}
