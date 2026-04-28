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
  console.info(
    `[4/5] 収集ニュース全体を Gemini（${settings.analysis.trendAnalysisModel}）で分析中...`,
  );
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

  let res: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
  try {
    res = await withRetry(
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
      { label: `${settings.analysis.trendAnalysisModel}（トレンド分析）` },
    );
  } catch (cause) {
    const msg = String(cause);
    if (
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes('"code":429') ||
      msg.includes("429")
    ) {
      throw new UserFacingError(
        "Gemini API の利用枠に達したか、この API キーでは無料枠が使えない状態です。Google AI Studio で新しい API キーを発行する・別の Google アカウントを試す・課金（従量課金）を有効にする・しばらく時間をおいて再実行してください。",
        { cause },
      );
    }
    throw cause;
  }

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

  const jsonPayload = extractJsonObject(text);
  try {
    return AnalysisSchema.parse(JSON.parse(jsonPayload));
  } catch (cause) {
    throw new UserFacingError(
      "Geminiの応答をパースできませんでした。再実行してみてください。",
      { cause },
    );
  }
}

/** ```json ... ``` や前後の説明文を除いて JSON オブジェクト文字列だけ取り出す */
function extractJsonObject(raw: string): string {
  const t = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```/im.exec(t);
  if (fenced?.[1]) return fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
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
