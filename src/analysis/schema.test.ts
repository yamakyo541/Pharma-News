import { describe, it, expect } from "vitest";
import { AnalysisSchema, analysisResponseSchema } from "./schema.js";

const validAnalysis = {
  daily_overview: ["全体俯瞰1", "全体俯瞰2", "全体俯瞰3"],
  industry_implications: ["示唆1", "示唆2"],
  top_topics: [
    {
      title: "GPT-5.5が発表",
      details: ["ネイティブtool use対応", "推論速度が大幅向上"],
      sources: ["https://x.com/OpenAI/status/123"],
    },
    {
      title: "Cursor Background Agent",
      details: ["寝ている間にPRを作成"],
      sources: ["https://x.com/cursor/status/456"],
    },
    {
      title: "テスト時計算量スケーリング",
      details: ["より大きなモデルからスマートな推論へ", "推論コスト削減"],
      sources: ["https://x.com/research/status/789"],
    },
  ],
};

describe("AnalysisSchema", () => {
  it("正常なデータをパースできる", () => {
    const result = AnalysisSchema.parse(validAnalysis);
    expect(result.top_topics).toHaveLength(3);
  });

  it("top_topics が2件だとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          { title: "a", details: [], sources: [] },
          { title: "b", details: [], sources: [] },
        ],
      }),
    ).toThrow();
  });

  it("top_topics が6件だとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          { title: "a", details: [], sources: [] },
          { title: "b", details: [], sources: [] },
          { title: "c", details: [], sources: [] },
          { title: "d", details: [], sources: [] },
          { title: "e", details: [], sources: [] },
          { title: "f", details: [], sources: [] },
        ],
      }),
    ).toThrow();
  });

  it("必須フィールドが欠けるとエラー", () => {
    expect(() => AnalysisSchema.parse({})).toThrow();
  });

  it("details が3つを超えるとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        daily_overview: ["a", "b", "c"],
        industry_implications: ["x", "y"],
        top_topics: [
          {
            title: "test",
            details: ["1", "2", "3", "4"],
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
          details: ["1", "2", "3"],
          sources: [],
        },
        {
          title: "test2",
          details: ["1"],
          sources: [],
        },
        {
          title: "test3",
          details: ["1"],
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
          { title: "a", details: [], sources: [] },
          { title: "b", details: [], sources: [] },
          { title: "c", details: [], sources: [] },
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
