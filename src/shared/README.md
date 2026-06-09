# Shared services

複数の機能（プラグイン）から参照される共有層。設計 spec の 3 層構造
（Core / Shared services / Feature plugins）の中間層にあたる。

## 契約

- **shared は機能を持たない**。単体で「ユーザーに見える振る舞い」を提供しない
  （プロバイダクライアント・共有ストア・読取 API など）。
- **shared → plugin の依存は禁止**（プラグインは着脱されるため）。
  shared が依存してよいのは core / utils / 他の shared のみ。
- プラグイン・legacy モジュールからの直接 require は可
  （utils/ と同じ扱い。Stage F の configService 導入時に `ctx.services` 経由へ統合予定）。
- 昇格基準は実測（docs/blueprints/dependency-map.md）: 2 つ以上の機能から参照されること。

## 現在のメンバー

| ファイル | 由来 | 利用元 |
|---|---|---|
| `llmClient.js` | `modules/llm/ollamaClient.js` から昇格 | llm（会話機能）/ introDm |
| `userMemory.js` | `modules/userMemory/` から昇格 | llm / maintenance コマンド |

## 今後の昇格予定（dependency-map.md §2）

messageArchive / guildMembers / deletableMessages / introProfiles（読取API）/ discordLinks
— それぞれ対応するプラグイン移送の際に昇格する。
