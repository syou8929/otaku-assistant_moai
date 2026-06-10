# muse-gacha プラグイン blueprint

インスピレーション動画ガチャ。ジャンル別チャンネルプール（YouTube RSS・キー不要）を
定期クロールで蓄積し、「今日の3本」（2本=対象ジャンル＋1本=乱入枠）を抽選・配信する。
anime プラグインの9層型（プロバイダ＋キャッシュ→解決→カード）の最初の新規転用例。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/muse-gacha/` |
| config キー | `plugins.muse-gacha`（pools / deliveryChannelId / deliveryCron / crawlCron / excludeDays） |
| DB テーブル | `muse_videos` / `muse_picks`（本プラグイン所有） |
| scheduler ジョブ | key `crawl` / `daily-deliver`（無効化で orphaned） |
| intents | Guilds（共有） |
| コマンド表面 | `/muse pick|status|crawl` |
| 外部通信 | YouTube RSS（read-only・キー不要・User-Agent 明示） |
| 依存元 | なし |

## 設計判断（偶然性の設計）

- RSS は直近約15件のみ → **クロール蓄積で「深いプール」を育て、抽選は蓄積全体から**
  （最新偏重を避ける。運用初期はプールが浅い旨を /muse status で可視化）
- **乱入枠**: 3本中1本は他ジャンルから（アルゴリズムの外を連れてくる）
- **既出回避**: picks 履歴で excludeDays（既定60日）内の再抽選を防止
- 「刺さった」リアクション集計によるプール重み学習は将来 capability（既定OFF想定）
- リンク切れ・限定公開化の検知は不可（Discord 埋め込みが落ちるだけ）

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ①プロバイダ | `rss.js`（YouTube RSS・依存ゼロのパーサ） |
| ②解決 | `picker.js`（既出回避・乱入枠の抽選） |
| ③リポジトリ | `repository.js`（プール・picks 履歴） |
| ④ビュー | `buildPickMessage` |
| ⑥ライフサイクル | crawl / deliver ジョブ（scheduler cron） |
| ⑦入力経路 | `/muse pick|status|crawl` ＋ 定期配信 |

⑤⑧⑨は該当なし（⑧リアクション重み学習は将来 capability）。
