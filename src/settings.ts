export interface Settings {
  /**
   * RSS フィード一覧。最低1件以上の URL を設定してください。
   */
  contentSource: {
    rssFeeds: Array<{
      label: string;
      url: string;
      /** カテゴリ別ミックス（rssCategoryCaps のキーと揃える） */
      category?: string;
      /** このフィードから採用する最大件数（窓内）。未指定時は rssMaxItemsPerFeed を使う */
      maxItems?: number;
    }>;
    rssMaxItems: number;
    rssFetchTimeoutMs: number;
    /**
     * フィードあたりの最大件数（lookback 内）。未設定ならフィード単位の上限は付けない。
     */
    rssMaxItemsPerFeed?: number;
    /**
     * 最終リストのカテゴリ別上限。キーは rssFeeds[].category。未設定または空オブジェクトならミックス無効。
     */
    rssCategoryCaps?: Record<string, number>;
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
  /**
   * 配信済み URL を記録し、次回以降は未配信のみ処理する（.cache/ は gitignore 推奨）。
   * GitHub Actions では daily-news ワークフローが artifact と同期する。
   */
  deliveryState?: {
    enabled: boolean;
    stateFilePath: string;
    maxTrackedUrls: number;
  };
  /** 記事URL要約のディスクキャッシュ（Gemini 呼び出し・トークン節約） */
  urlSummaryCache?: {
    enabled: boolean;
    filePath: string;
    maxAgeDays: number;
    maxEntries: number;
  };
}

const domestic = "domestic";
const overseas = "overseas";
const gov = "gov";
const ir = "ir";

export const settings: Settings = {
  contentSource: {
    rssFeeds: [
      // 国内製薬ニュース（5）
      {
        label: "ミクスOnline",
        url: "https://www.mixonline.jp/DesktopModules/MixOnline_Rss/MixOnlinerss.aspx?rssmode=3",
        category: domestic,
      },
      {
        label: "AnswersNews",
        url: "https://answers.ten-navi.com/pharmanews/feed/",
        category: domestic,
      },
      {
        label: "薬事日報",
        url: "https://www.yakuji.co.jp/feed/",
        category: domestic,
      },
      { label: "日刊薬業（購読URLを設定）", url: "", category: domestic },
      { label: "日経メディカル（購読URLを設定）", url: "", category: domestic },

      // 海外製薬ニュース（5）
      { label: "Fierce Pharma", url: "https://www.fiercepharma.com/rss/xml", category: overseas },
      { label: "Endpoints News", url: "https://endpts.com/feed/", category: overseas },
      { label: "PharmaTimes", url: "https://pharmatimes.com/feed/", category: overseas },
      { label: "STAT", url: "https://www.statnews.com/feed/", category: overseas },
      { label: "BioPharma Dive", url: "https://www.biopharmadive.com/feeds/news/", category: overseas },

      // 政策・薬価（5）
      { label: "厚生労働省 報道発表", url: "https://www.mhlw.go.jp/stf/houdou/houdou_list.xml", category: gov },
      { label: "PMDA 新着情報", url: "https://www.pmda.go.jp/rss/0001.xml", category: gov },
      { label: "内閣官房 報道発表", url: "https://www.cas.go.jp/rss/news.xml", category: gov },
      { label: "WHO News", url: "https://www.who.int/feeds/entity/mediacentre/news/en/rss.xml", category: gov },
      {
        label: "FDA Newsroom",
        url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-announcements/rss.xml",
        category: gov,
      },

      // 企業IR/プレス（5）
      { label: "武田薬品 プレス", url: "https://www.takeda.com/jp/newsroom/rss/", category: ir },
      { label: "第一三共 ニュース", url: "https://www.daiichisankyo.co.jp/rss/news.xml", category: ir },
      { label: "エーザイ ニュース", url: "https://www.eisai.co.jp/rss/news.xml", category: ir },
      {
        label: "アステラス ニュース",
        url: "https://www.astellas.com/jp/system/files/rss/news_ja.xml",
        category: ir,
      },
      { label: "中外製薬 ニュース", url: "https://www.chugai-pharm.co.jp/news/rss.xml", category: ir },
    ],
    /** 無料枠: URL要約が記事数ぶん走るため、大きすぎると 429 になりやすい */
    rssMaxItems: 10,
    rssFetchTimeoutMs: 15_000,
    /** 1フィードあたり先に取り込む上限（その後にURL重複排除・カテゴリミックス） */
    rssMaxItemsPerFeed: 4,
    /** 最終リストに入るカテゴリ別の上限。足りない場合は枠まで他カテゴリで埋める */
    rssCategoryCaps: {
      [domestic]: 4,
      [overseas]: 3,
      [gov]: 2,
      [ir]: 2,
    },
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
    /** 要約入力の最大文字数 = maxSummaryChars × 本値。下げると入力トークンが減り無料枠に有利 */
    inputCharsMultiplier: 12,
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
    maxAttempts: 4,
    baseDelayMs: 2_000,
    maxDelayMs: 20_000,
  },
  deliveryState: {
    enabled: true,
    stateFilePath: ".cache/delivered-urls.json",
    maxTrackedUrls: 8000,
  },
  urlSummaryCache: {
    enabled: true,
    filePath: ".cache/url-summary-cache.json",
    maxAgeDays: 14,
    maxEntries: 2000,
  },
};
