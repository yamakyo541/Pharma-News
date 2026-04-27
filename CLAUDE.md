# Pharma News

日刊薬業などの **RSS** から直近の新着記事を取得し、Gemini で分析して Gmail で配信する自動配信ツール。

## プロジェクト構造

```
src/
├── main.ts              # エントリポイント（最初にここを読む）
├── settings.ts          # 受講生が触る全設定（TS定数）
├── config.ts            # 環境変数の zod 検証
├── types.ts             # 共通型定義
├── sources/
│   ├── rss-feed.ts      # RSS 2.0 取得
│   └── url-content.ts   # Jina Reader で URL 本文並列取得
├── analysis/
│   ├── url-summarizer.ts # Gemini Flash で各URL要約
│   ├── analyze.ts       # Gemini Pro で最終トレンド分析
│   ├── schema.ts        # zod スキーマ（SSoT）
│   └── prompts.ts       # プロンプト
├── delivery/
│   └── gmail.ts         # HTML/テキストメール組み立て + Gmail SMTP 送信
└── utils/
    ├── chunk.ts         # 配列チャンク分割
    ├── errors.ts        # UserFacingError
    └── post-optimizer.ts # URL抽出・t.co展開・テキスト整形
```

## 実行方法

```bash
npm start                     # 通常実行（RSS の URL が settings に必要）
USE_SAMPLE_DATA=true npm start # モックルート（fixtures/sample-rss-tweets.json）
```

## 読む順番

1. `src/main.ts` — 全体の流れ
2. `src/sources/rss-feed.ts` — ソース元
3. `src/analysis/analyze.ts` — 処理
4. `src/delivery/gmail.ts` — 届ける先
5. `src/settings.ts` — 設定を変えたいとき

## GitHub Secrets

| シークレット名 | 用途 |
|---|---|
| `JINA_API_KEY` | Jina Reader |
| `GEMINI_API_KEY` | Gemini Flash + Pro |
| `GMAIL_USER` | 送信に使う Gmail アドレス（Google アカウント） |
| `GMAIL_APP_PASSWORD` | 上記アカウントのアプリパスワード（16文字、空白なし推奨） |
| `GMAIL_TO` | 宛先メールアドレス（複数はカンマ区切り） |

## 禁止事項

- curl だけで Gmail / Jina 等を直接叩いて、このリポジトリのコード経路と別検証にしない
- `src/settings.ts` 以外のファイルで設定値をハードコードしない
- 受講生に見せたいエラー文言は `UserFacingError` の `message` に入れる（`main.ts` が `[USER-FACING]` プレフィックス付きで出力する）。`throw new Error(...)` だけだと `[INTERNAL]` 扱いになり、受講生が混乱する
