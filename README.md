# Pharma News

日刊薬業などの **RSS 新着** を自動収集し、Geminiで分析してGmail（メール）で配信するツールです。

```
┌──────────────────────────────────────────────────────────┐
│  📰 Pharma News                                          │
│                                                          │
│  🔥 主要なニュース・話題                                  │
│  ──────────────────────────────                          │
│  診療報酬改定、改定率と業界への影響                       │
│  - 診療・調剤報酬の枠組みと製薬・医療提供への波及         │
│                                                          │
│  ⚡️ 注目のアップデート                                    │
│  ──────────────────────────────                          │
│  健保法改正案の審議動向                                   │
│  - 制度改正が医療提供・保険財政に与える含意               │
│                                                          │
│  💡 技術トレンド                                          │
│  ──────────────────────────────                          │
│  電子処方箋と流通データの活用                             │
│  - 需要予測・在庫最適化への展開可能性                     │
│                                                          │
│  Pharma News で自動生成                                   │
└──────────────────────────────────────────────────────────┘
```

指定したメールアドレス宛に、このようなニュース分析レポートが毎朝届きます。

---

## 全体像

```
┌─────────────┐
│  トリガー     │  GitHub Actions
│  （いつ動く） │  → 毎朝 07:30 JST（定期実行を有効化した場合）
└──────┬──────┘
       ▼
┌─────────────┐
│  ソース元    │  RSS（日刊薬業の購読フィード等）
│  （データ）  │  → 直近24時間相当の新着を取得
└──────┬──────┘
       ▼
┌─────────────┐
│  処理する場所 │  GitHub Actions 上の Node.js
│  （加工）    │  → Gemini でトレンド分析し、構造化JSONに変換
└──────┬──────┘
       ▼
┌─────────────┐
│  届ける先    │  Gmail（SMTP）
│  （配信）    │  → 指定アドレスに HTML メールでレポートを送信
└─────────────┘
```

---

## 料金について

| サービス | 料金 |
|---|---|
| GitHub Actions | 毎月2,000分無料（実行は数分で完了） |
| Jina Reader | 無料枠あり（1Mトークン、使い切り型） |
| Gemini（Flash + Pro） | 無料枠で完結（1日1回の実行なら超過しない） |
| Gmail | 送信元アカウントがあれば追加料金なし（アプリパスワード利用） |

> Jina Reader の無料1Mトークンは**アカウントに対する一括付与で、月次リセットされません**。枯渇してもツール自体は壊れず、本文なしで分析を続行します。

---

## セットアップ

### 準備するもの

- **GitHub アカウント**
- **Google アカウント**（Gemini API キー取得用・メール送信用）
- **日刊薬業（じほう）等の RSS**（購読で案内されるフィード URL。`src/settings.ts` の `rssFeeds` に追加）
- **Jina AI アカウント**（無料登録）

> このツールは GitHub Actions が全自動で実行します。あなたの PC で `npm install` を実行する必要はありません。

### Part A: ツール本体を GitHub に置く

1. https://github.com/new にアクセス
2. **Repository name** に `pharma-news` など任意の名前を入力
3. **Private** を選択（APIキーの設定を含むため、**必ず Private** にしてください）
4. 「Add a README file」のチェックは**外したまま**にする
5. 「Create repository」をクリック

Cursor で AI に以下のように依頼してください:

> 「このコードを GitHub にpushして。リポジトリは `あなたのユーザー名/リポジトリ名` です」

### Part B: Gmail でメール送信の準備をする

1. レポートの**送信元**に使う Google アカウントで [Google アカウントのセキュリティ](https://myaccount.google.com/security) を開く
2. **2段階認証プロセス**を有効にする（未設定の場合）
3. 「アプリパスワード」で新しいパスワードを作成（アプリに「メール」、デバイスに任意の名前）
4. 表示された **16文字**（スペースはあってもなくても可）をコピー

GitHub Secrets に登録:
- `GMAIL_USER` — 送信に使う Gmail アドレス（例: `you@gmail.com`）
- `GMAIL_APP_PASSWORD` — 手順3のアプリパスワード（**通常のログインパスワードではない**）
- `GMAIL_TO` — 宛先。自分宛なら `GMAIL_USER` と同じでもよい。複数はカンマ区切り（例: `a@gmail.com,b@gmail.com`）

### Part C: Gemini API キーを取得する

1. https://aistudio.google.com/apikey にアクセス
2. 「Create API Key」をクリック
3. 表示されたキーをコピー

GitHub Secrets に登録:
- `GEMINI_API_KEY` — コピーしたキー

> 無料枠で動きます。クレジットカードの登録は不要です。

### Part D: Jina API キーを取得する

1. https://jina.ai にアクセスし、アカウントを作成（またはログイン）
2. ダッシュボードで API キーを確認

GitHub Secrets に登録:
- `JINA_API_KEY` — コピーしたキー

> 無料枠（1Mトークン）で動きます。個人の学習・ニュース収集用途なら問題ありません。業務利用する場合は Paid プラン（jina.ai/pricing）への移行が必要です。

### Part E: RSS URL とモックルートで初回実行

1. リポジトリの `src/settings.ts` を開き、`contentSource.rssFeeds` に**購読で案内された RSS の URL**を1件以上書き込み、コミットして push する
2. リポジトリの「**Actions**」タブを開く
3. **左サイドバー**から「**Daily Pharma News**」をクリック
4. 「**Run workflow**」ボタンをクリック
5. **use_sample_data** にチェックを入れる（RSS のサンプル `fixtures/sample-rss-tweets.json` で動作確認）
6. 緑の「**Run workflow**」ボタンをクリック

数分後、**GMAIL_TO** に設定した宛先へ、サンプルデータによる分析レポートがメールで届きます。

> ここまでで「Gemini による分析 → Gmail 送信」の流れが確認できました。以降は本番の RSS 連携に進みます。

---

### Part F: 本番ルートで実行

1. GitHub Actions の **use_sample_data** はオフのままにし、`src/settings.ts` の **rssFeeds** に実 RSS の URL が1件以上入っていることを確認する
2. リポジトリの「**Actions**」タブを開く
3. 「**Daily Pharma News**」→「**Run workflow**」
4. **use_sample_data のチェックは外したまま**実行
5. 指定した宛先に、本番データに基づくニュース分析がメールで届く

### チェックポイント

- [ ] メールで Pharma News の分析レポートが届いた
- [ ] レポートに想定どおりの記事トピックが含まれている

---

## 定期実行

`.github/workflows/daily-news.yml` では **平日 07:30 JST** の実行が有効になっています。止めたい場合は `on.schedule` ブロックをコメントアウトするか削除してください。

---

## カスタマイズ

設定は `src/settings.ts` に集約されています。

### レシピ 1: 分析カテゴリを変える

`src/analysis/schema.ts` の `tech_trends` を別名にリネームし、`src/analysis/prompts.ts` のプロンプトも合わせて変更すると、レポートのセクション構成を変えられます。

### レシピ 2: 特定キーワードだけ分析する

`src/sources/rss-feed.ts` の `fetchRssAsRawTweets` の戻り直前に、タイトル・本文でフィルタを挿入する。

### レシピ 3: 複数の宛先に同じレポートを送る

環境変数 `GMAIL_TO` をカンマ区切りで複数指定する（例: `a@x.com,b@x.com`）。送信内容は共通の1通です。

---

## ローカルでの動作確認

1. `.env.example` をコピーして `.env` を作成し、各キーを埋める
2. `npm install`
3. `npm test` でテストが通ることを確認
4. `USE_SAMPLE_DATA=true npm start` でモック RSS による1通のメール送信まで試せる（`.env` に Gmail 系が必要）

---

## 応用例

4パーツの一部を差し替えると、まったく別のツールになります。

- **ソース元を別メディアの RSS に差し替える** → 毎朝の業界ニュース要約
- **処理を感情分析に差し替える** → 口コミ見張り番
- **届ける先を Notion に差し替える** → 毎朝の社内ニュースDB

---

## セキュリティ

- **リポジトリは Private に**: API キーを GitHub Secrets に保存しているため、公開リポジトリにしないでください
- **Gmail アプリパスワード**: 通常の Google パスワードはリポジトリに入れず、アプリパスワードのみ GitHub Secrets に保存してください
- **トークンが漏洩した場合**:
  - Gemini: aistudio.google.com でキーを削除して再発行
  - Jina: ダッシュボードでキーをローテーション
  - Gmail: Google アカウントでアプリパスワードを失効させ、新しいものを Secrets に登録し直す

---

## 困ったとき

1. **まず AI に聞く**: Cursor で「セットアップで〇〇のエラーが出ました」と伝えてください
2. **GitHub Actions のログを確認**: Actions タブ → 失敗したジョブ → `[USER-FACING]` の行を読む
3. **エラー別の対処法**: [docs/troubleshooting.md](docs/troubleshooting.md) に主要なエラーと対処法をまとめています
4. **コミュニティで相談**: 所属コースの質問チャンネルに投稿してください

---

## 技術スタック

| 項目 | 選定 | 理由 |
|---|---|---|
| 実行基盤 | GitHub Actions | 無料枠で十分、セットアップが簡単 |
| 言語 | TypeScript（Node.js 22） | 型安全、RSS／メールまわりの実装が容易 |
| ニュース取得 | RSS 2.0（fetch + XML） | 日刊薬業など購読フィードにそのまま対応 |
| URL本文取得 | Jina Reader | LLM最適化されたMarkdown化 |
| AI（URL要約） | Gemini 2.5 Flash | 大量処理に適した軽量モデル |
| AI（最終分析） | Gemini 2.5 Pro | 高品質な構造化出力 |
| 通知 | Gmail SMTP（nodemailer） | HTML／テキストのレポートメール |
