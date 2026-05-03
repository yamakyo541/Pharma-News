import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const TopicDetailSchema = z.object({
  text: z.string(),
  /** 当該 detail の根拠となった入力記事の URL（https） */
  source_url: z.string().url(),
});

const TopicSchema = z.object({
  title: z.string(),
  details: z.array(TopicDetailSchema).min(1).max(3),
  sources: z.array(z.string().url()),
});

/** 新着記事の全体俯瞰（3行） */
const DailyOverviewSchema = z.array(z.string()).length(3);

/** 業界への示唆（2〜3行） */
const IndustryImplicationSchema = z.array(z.string()).min(2).max(3);

/** 新着記事全体から見た重要トピック（1位〜5位。配列の先頭ほど重要） */
export const AnalysisSchema = z.object({
  daily_overview: DailyOverviewSchema,
  industry_implications: IndustryImplicationSchema,
  top_topics: z.array(TopicSchema).min(3).max(5),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const analysisResponseSchema = zodToJsonSchema(AnalysisSchema, {
  target: "openApi3",
  $refStrategy: "none",
});
