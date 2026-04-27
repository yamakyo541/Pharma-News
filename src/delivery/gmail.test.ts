import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import { settings as appSettings } from "../settings.js";

const { mockSendMail } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

const { sendDigestEmail } = await import("./gmail.js");

const mockConfig: Config = {
  JINA_API_KEY: "test-jina",
  GEMINI_API_KEY: "test-gemini",
  GMAIL_USER: "sender@example.com",
  GMAIL_APP_PASSWORD: "abcdabcdabcdabcd",
  GMAIL_TO: "reader@example.com",
  USE_SAMPLE_DATA: true,
};

const validAnalysis: Analysis = {
  daily_overview: ["全体俯瞰1", "全体俯瞰2", "全体俯瞰3"],
  industry_implications: ["示唆1", "示唆2"],
  top_topics: [
    {
      title: "GPT-5.5が発表",
      details: ["ネイティブtool use対応"],
      sources: ["https://x.com/OpenAI/status/123"],
    },
    {
      title: "第2位トピック",
      details: ["補足"],
      sources: [],
    },
    {
      title: "第3位トピック",
      details: ["補足"],
      sources: [],
    },
  ],
};

beforeEach(() => {
  mockSendMail.mockResolvedValue({ messageId: "test-id" });
});

describe("sendDigestEmail", () => {
  it("nodemailer でメールを送信する", async () => {
    await sendDigestEmail(validAnalysis, mockConfig, appSettings);

    expect(mockSendMail).toHaveBeenCalledOnce();
    const arg = mockSendMail.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(arg.from).toContain(appSettings.mailUi.senderDisplayName);
    expect(arg.from).toContain("sender@example.com");
    expect(arg.to).toBe("reader@example.com");
    expect(arg.subject).toMatch(/^【製薬ニュース】 \d{4}-\d{2}-\d{2} 重要トピック3件$/);
    expect(arg.html).toContain("GPT-5.5");
    expect(arg.text).toContain("GPT-5.5");
    expect(arg.html).toContain("今日の全体俯瞰");
    expect(arg.text).toContain("--- 今日の示唆 ---");
    expect(arg.html).toContain("1. GPT-5.5が発表");
    expect(arg.html).toContain("2. 第2位トピック");
    expect(arg.html).toContain("3. 第3位トピック");
    expect(arg.text).toContain("■ 1. GPT-5.5が発表");
    expect(arg.text).toContain("■ 2. 第2位トピック");
    expect(arg.text).toContain("■ 3. 第3位トピック");
  });
});
