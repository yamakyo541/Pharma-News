import { describe, it, expect } from "vitest";
import { AnalysisSchema, analysisResponseSchema } from "./schema.js";

const validTopicDetail = (text: string, url: string) => ({
  text,
  source_url: url,
});

const validAnalysis = {
  daily_overview: ["全体俯瞰1", "全体俯瞰2", "全体俯瞰3"],
  industry_implications: ["示唆1", "示唆2"],
  top_topics: [
    {
      title: "GPT-5.5が発表",
      details: [
        validTopicDetail("ネイティブtool use対応", "https://example.com/news/openai-123"),
        validTopicDetail("推論速度が大幅向上", "https://example.com/news/openai-124"),
      ],
      sources: ["https://example.com/news/openai-123"],
    },
    {
      title: "Cursor Background Agent",
      details: [
        validTopicDetail("寝ている間にPRを作成", "https://example.com/news/cursor-456"),
      ],
      sources: ["https://example.com/news/cursor-456"],
    },
    {
      title: "テスト時計算量スケーリング",
      details: [
        validTopicDetail(
          "より大きなモデルからスマートな推論へ",
          "https://example.com/news/research-789",
        ),
      ],
      sources: ["https://example.com/news/research-789"],
    },
  ],
};

describe("AnalysisSchema", () => {
  it("正常なデータをパースできる", () => {
    const result = AnalysisSchema.parse(validAnalysis);
    expect(result.top_topics).toHaveLength(3);
    expect(result.top_topics[0]!.details[0]!.source_url).toMatch(/^https:/);
  });

  it("top_topics が2件だとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          {
            title: "a",
            details: [validTopicDetail("d", "https://example.com/a")],
            sources: [],
          },
          {
            title: "b",
            details: [validTopicDetail("d", "https://example.com/b")],
            sources: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("top_topics が6件だとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: Array.from({ length: 6 }, (_, i) => ({
          title: `t${i}`,
          details: [validTopicDetail("d", `https://example.com/x${i}`)],
          sources: [],
        })),
      }),
    ).toThrow();
  });

  it("必須フィールドが欠けるとエラー", () => {
    expect(() => AnalysisSchema.parse({})).toThrow();
  });

  it("details が4つを超えるとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          {
            title: "test",
            details: [
              validTopicDetail("1", "https://example.com/1"),
              validTopicDetail("2", "https://example.com/2"),
              validTopicDetail("3", "https://example.com/3"),
              validTopicDetail("4", "https://example.com/4"),
            ],
            sources: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("details が3つちょうどは許容する", () => {
    const result = AnalysisSchema.parse({
      daily_overview: ["a", "b", "c"],
      industry_implications: ["x", "y"],
      top_topics: [
        {
          title: "test",
          details: [
            validTopicDetail("1", "https://example.com/1"),
            validTopicDetail("2", "https://example.com/2"),
            validTopicDetail("3", "https://example.com/3"),
          ],
          sources: [],
        },
        {
          title: "test2",
          details: [validTopicDetail("1", "https://example.com/4")],
          sources: [],
        },
        {
          title: "test3",
          details: [validTopicDetail("1", "https://example.com/5")],
          sources: [],
        },
      ],
    });
    expect(result.top_topics[0]!.details).toHaveLength(3);
  });

  it("daily_overview が3行以外だとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b"],
        industry_implications: ["x", "y"],
        top_topics: [
          {
            title: "a",
            details: [validTopicDetail("d", "https://example.com/a")],
            sources: [],
          },
          {
            title: "b",
            details: [validTopicDetail("d", "https://example.com/b")],
            sources: [],
          },
          {
            title: "c",
            details: [validTopicDetail("d", "https://example.com/c")],
            sources: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("detail に source_url が無いとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          {
            title: "a",
            details: [{ text: "only text" }],
            sources: [],
          },
          {
            title: "b",
            details: [validTopicDetail("d", "https://example.com/b")],
            sources: [],
          },
          {
            title: "c",
            details: [validTopicDetail("d", "https://example.com/c")],
            sources: [],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("analysisResponseSchema", () => {
  it("JSON Schema オブジェクトが生成される", () => {
    expect(analysisResponseSchema).toBeDefined();
    expect(typeof analysisResponseSchema).toBe("object");
  });

  it("top_topics プロパティを含む", () => {
    const schema = analysisResponseSchema as Record<string, unknown>;
    const props = (schema as { properties?: Record<string, unknown> })
      .properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("top_topics");
    expect(props).toHaveProperty("daily_overview");
    expect(props).toHaveProperty("industry_implications");
  });
});
