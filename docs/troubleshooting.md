# 困ったとき

## GitHub Actions のログの読み方

1. リポジトリの **Actions** タブを開く
2. 実行したワークフローをクリック
3. **run** ジョブをクリックして各ステップを展開
4. `[USER-FACING]` で始まる行を最優先で読む — 次に何をすべきかが書いてある
5. `[INTERNAL]` で始まる行は開発者向けの詳細情報

---

## エラー別の対処法

### Jina Reader

| 症状 | 原因 | 対処 |
|---|---|---|
| `402 Payment Required` | 1Mトークンの無料枠が枯渇 | **自動フォールバック済み**のため配布物は壊れない。長期利用なら Paid プラン (jina.ai/pricing) へ、または `src/settings.ts` の `urlContent.enabled` を `false` に |

### Gemini

| 症状 | 原因 | 対処 |
|---|---|---|
| `400 API key not valid` | APIキーの誤り | aistudio.google.com で再発行し、GitHub Secrets の `GEMINI_API_KEY` を更新 |
| `429 Resource exhausted` | Free枠の1日上限超過（Flash 250/day, Pro 100/day） | 明日まで待つ。手動実行は1日1〜2回に抑える |
| `SAFETY filter` | 収集した本文がセーフティフィルタに抵触 | `rssMaxItems` を減らす。ソースの内容を見直す |

### Gmail（メール送信）

| 症状 | 原因 | 対処 |
|---|---|---|
| `Gmail へのメール送信に失敗` / `Invalid login` | `GMAIL_APP_PASSWORD` が誤り、または通常パスワードを入れている | Google アカウント → セキュリティ → 2段階認証を有効化 → アプリパスワードで「メール」用を新規発行し、16文字を空白なしで `GMAIL_APP_PASSWORD` に設定 |
| 環境変数エラー（GMAIL_TO） | 宛先がメール形式でない、空 | `GMAIL_TO` に有効なアドレスを1件、または `a@x.com,b@x.com` のようにカンマ区切りで指定 |
| 環境変数エラー（GMAIL_USER） | 送信元がメール形式でない | `GMAIL_USER` は送信に使う Gmail（または Google Workspace の許可されたアドレス）を指定 |

### その他

| 症状 | 原因 | 対処 |
|---|---|---|
| 成功扱い（緑）だがメールが届かない | 迷惑メールフォルダ、`lookbackHours: 0` の誤設定 | 迷惑メールを確認。`src/settings.ts` の値を確認 |
| Actions がずっと黄色（実行中） | Jina Reader の大量タイムアウト | `src/settings.ts` の `urlContent.parallelism` を `5` に下げる、または `urlContent.enabled` を `false` にして再実行 |
