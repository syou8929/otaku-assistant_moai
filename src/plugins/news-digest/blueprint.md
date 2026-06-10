# news-digest プラグイン blueprint

カテゴリ別ニュースダイジェスト。RSS/Atom フィード（キー不要）を定期巡回で蓄積し、
重複排除＋複数ソース同時出現スコア（Hot 🔥）つきの「1日1枚」をカテゴリ別チャンネルへ配信。
垂れ流し RSS bot との差別化 = 横断重複排除 / Hot スコア / 通知洪水にしない / 再掲なし。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/news-digest/` |
| config キー | `plugins.news-digest`（categories / digestCron / crawlCron / itemsPerCategory） |
| DB テーブル | `news_items`（本プラグイン所有） |
| scheduler ジョブ | key `crawl` / `digest` |
| intents | Guilds（共有） |
| コマンド表面 | `/news now|crawl|status` |
| 外部通信 | 設定されたフィード URL への read-only GET のみ（キー不要。HN/Reddit も RSS 経由） |
| 依存元 | なし |

## 設計判断

- **汎用 RSS2.0/Atom パーサ1本**で全ソースをカバー（CDATA・entity・link href 対応、依存ゼロ）
- 重複排除2層: `url_key`（クエリ/フラグメント除去）= 同一記事、`title_key`（記号・空白正規化）
  = 同一ニュースの媒体違い。後者の衝突で `source_count` が伸び Hot スコアに
- 配信済み（delivered_at）は再掲しない。候補は直近3日分から source_count 降順
- X/Twitter は非対応（API 有料・非公式は不安定のため設計段階で見送り）
- ローカル LLM 要約・カテゴリ自動分類は将来 capability（既定OFF想定）

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ①プロバイダ | `feed.js`（汎用フィードクライアント） |
| ②解決 | `urlKey` / `titleKey`（重複排除・名寄せ）＋ Hot スコア |
| ③リポジトリ | `repository.js`（news_items） |
| ④ビュー | `buildDigestContent` |
| ⑥ライフサイクル | crawl / digest ジョブ |
| ⑦入力経路 | `/news` ＋ 定期配信 |

⑤⑧⑨は該当なし。
