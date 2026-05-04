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
const gov = "gov";

export const settings: Settings = {
  contentSource: {
    /**
     * 編集方針（最善案の前提）
     * - 一次ソースは「国内専門メディア + 日・当局・主要国際当局」。海外英語メディアは重複・コストが大きいため除外。
     * - 1 日の分析対象は件数を抑え（rssMaxItems）、重要トピックに Jina/Gemini を集中させる。
     * - 平日朝バッチの前後で取りこぼしが出にくいよう lookback を 48h。
     * - 日刊薬業・日経メディカルは購読 RSS の URL を入れると国内の網羅が一段上がる（空の行は自動スキップ）。
     */
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

      // 政策・国際当局（5）— 国内メディアが薄い承認・通知・国際規制を補完
      {
        label: "厚生労働省 新着（RSS）",
        url: "https://www.mhlw.go.jp/stf/news.rdf",
        category: gov,
      },
      { label: "PMDA 新着情報", url: "https://www.pmda.go.jp/rss_008.xml", category: gov },
      {
        label: "内閣府 報道・新着（RSS）",
        url: "https://www.cao.go.jp/rss/news.rdf",
        category: gov,
      },
      { label: "WHO News", url: "https://www.who.int/rss-feeds/news-english.xml", category: gov },
      {
        label: "EMA ニュース・プレス",
        url: "https://www.ema.europa.eu/en/news.xml",
        category: gov,
      },
    ],
    /**
     * 最終的に分析する記事本数。Jina・Gemini（URL 要約）回数に直結するため 8 件に抑える。
     */
    rssMaxItems: 8,
    rssFetchTimeoutMs: 15_000,
    /** 1 フィードから先に取り込む上限。小さくするとノイズ削減・マージ前の重複が減る */
    rssMaxItemsPerFeed: 3,
    /** 国内を厚め、当局で承認・政策・国際規制を担保（合計 = rssMaxItems） */
    rssCategoryCaps: {
      [domestic]: 5,
      [gov]: 3,
    },
  },
  mailUi: {
    senderDisplayName: "Pharma News",
    emailSubjectPrefix: "【製薬ニュース】",
    digestHeading: "📰 Pharma News",
    topTopicsSectionHeadingPrefix: "重要トピック TOP",
  },
  schedule: {
    /** 平日朝ジョブでも金曜〜日曜の新着を拾いやすい幅 */
    lookbackHours: 48,
  },
  urlContent: {
    enabled: true,
    timeoutMs: 10_000,
    /** 海外メディア削除に伴いバーストをやや抑え、Jina 側の負荷を平準化 */
    parallelism: 8,
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
