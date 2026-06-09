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
| `llmClient.js` | `modules/llm/ollamaClient.js` から昇格 | llm（会話機能）/ intro |
| `userMemory.js` | `modules/userMemory/` から昇格 | llm / maintenance コマンド |
| `introProfiles.js` | `modules/introProfiles/` から昇格（保存フックつき） | intro / llm / events |
| `guildMembers.js` | `modules/guildMembers/` から昇格 | intro / introProfiles / events |
| `messageArchive/` | `modules/messageArchive/` から昇格 | llm / timelineRelay / events |
| `deletableMessages.js` | `modules/deletableMessages/` から昇格 | anime / events |
| `discordLinks.js` | `services/discordLinks.js` から昇格 | entrance-guide / timelineRelay / anime |

これで dependency-map.md §2 の shared 昇格は完了。残る `src/modules/` は
timelineRelay / anime / llm / ops（ops は core 行き予定）のみ。
