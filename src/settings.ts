export interface Settings {
  /**
   * RSS フィード一覧。最低1件以上の URL を設定してください。
   */
  contentSource: {
    rssFeeds: Array<{
      label: string;
      url: string;
    }>;
    rssMaxItems: number;
    rssFetchTimeoutMs: number;
  };
  /** Gmail 用の件名プレフィックス・差出人表示名・本文先頭の見出し */
  mailUi: {
    senderDisplayName: string;
    emailSubjectPrefix: string;
    digestHeading: string;
    /** メール内「重要トピック」ブロックの見出しプレフィックス */
    topTopicsSectionHeadingPrefix: string;
  };
  schedule: {
    lookbackHours: number;
  };
  urlContent: {
    enabled: boolean;
    timeoutMs: number;
    parallelism: number;
    maxSummaryChars: number;
    inputCharsMultiplier: number;
  };
  /** Gemini: URL要約とトレンド分析で同一 Flash モデル（無料枠向けの既定） */
  analysis: {
    urlSummaryModel: string;
    trendAnalysisModel: string;
    temperature: number;
    /** URL要約の Gemini 同時呼び出し数。無料枠で 429 が出るときは 1 推奨（Jina の並列数とは別） */
    geminiMaxParallelRequests: number;
  };
  /** RSS / Jina / Gemini 呼び出しの共通リトライ（指数バックオフ＋ジッター） */
  resilience: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
}

export const settings: Settings = {
  contentSource: {
    rssFeeds: [
      // 国内製薬ニュース（5）
      { label: "ミクスOnline", url: "https://www.mixonline.jp/rss/mixonline.xml" },
      { label: "AnswersNews", url: "https://answers.ten-navi.com/pharmanews/feed/" },
      { label: "薬事日報", url: "https://www.yakuji.co.jp/feed/" },
      { label: "日刊薬業（購読URLを設定）", url: "" },
      { label: "日経メディカル（購読URLを設定）", url: "" },

      // 海外製薬ニュース（5）
      { label: "Fierce Pharma", url: "https://www.fiercepharma.com/rss/xml" },
      { label: "Endpoints News", url: "https://endpts.com/feed/" },
      { label: "PharmaTimes", url: "https://pharmatimes.com/feed/" },
      { label: "STAT", url: "https://www.statnews.com/feed/" },
      { label: "BioPharma Dive", url: "https://www.biopharmadive.com/feeds/news/" },

      // 政策・薬価（5）
      { label: "厚生労働省 報道発表", url: "https://www.mhlw.go.jp/stf/houdou/houdou_list.xml" },
      { label: "PMDA 新着情報", url: "https://www.pmda.go.jp/rss/0001.xml" },
      { label: "内閣官房 報道発表", url: "https://www.cas.go.jp/rss/news.xml" },
      { label: "WHO News", url: "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml" },
      { label: "FDA Newsroom", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-announcements/rss.xml" },

      // 企業IR/プレス（5）
      { label: "武田薬品 プレス", url: "https://www.takeda.com/jp/newsroom/rss/" },
      { label: "第一三共 ニュース", url: "https://www.daiichisankyo.co.jp/rss/news.xml" },
      { label: "エーザイ ニュース", url: "https://www.eisai.co.jp/rss/news.xml" },
      { label: "アステラス ニュース", url: "https://www.astellas.com/jp/system/files/rss/news_ja.xml" },
      { label: "中外製薬 ニュース", url: "https://www.chugai-pharm.co.jp/news/rss.xml" },
    ],
    rssMaxItems: 20,
    rssFetchTimeoutMs: 15_000,
  },
  mailUi: {
    senderDisplayName: "Pharma News",
    emailSubjectPrefix: "【製薬ニュース】",
    digestHeading: "📰 Pharma News",
    topTopicsSectionHeadingPrefix: "重要トピック TOP",
  },
  schedule: {
    lookbackHours: 24,
  },
  urlContent: {
    enabled: true,
    timeoutMs: 10_000,
    parallelism: 10,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  analysis: {
    /** 各記事URLの短文要約 */
    urlSummaryModel: "gemini-2.5-flash",
    /** 全体トレンド分析（要約と同じ Flash に統一） */
    trendAnalysisModel: "gemini-2.5-flash",
    temperature: 0,
    geminiMaxParallelRequests: 1,
  },
  resilience: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
  },
};
