export interface RawTweet {
  authorId: string;
  text: string;
  createdAt: string;
  url: string;
  /** settings の rssFeeds[].category（カテゴリ別ミックス用） */
  category?: string;
  quotedText?: string;
}

export interface EnrichedTweet extends RawTweet {
  enrichedText: string;
}
