# llm プラグイン blueprint

ローカル LLM（Ollama）によるメンション応答・会話機能。文脈収集（直近メッセージ・
自己紹介プロフィール・ユーザー記憶）→ プロンプト構築 → 生成 → 整形返信のパイプライン。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/llm/` |
| config キー | `llm*`（llmEnabled / llmContextMessageLimit ほか多数）/ `ollamaBaseUrl` / `ollamaModel` / `plugins.llm`（注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | `llm_responses`（`db.llmResponses`。注: `events/messageDelete.js` が削除掃除で参照 — Stage D で整理） |
| intents | Guilds / GuildMessages / **MessageContent**（content を読む数少ない機能） |
| client 状態 | `client.activeLlmUsers` / `client.llmGlobalRequestActive`（並行制御。maintenance の status 表示が読む） |
| 依存 | shared: llmClient / userMemory / introProfiles / messageArchive |

## 残課題（Stage D〜F）

- `events/messageDelete.js` の `db.llmResponses` 掃除と maintenance の LLM status 表示・
  userMemory 操作サブコマンドは legacy 側に残置（maintenance 分解で移行）。
- `shared/llmClient` は基盤側の所有。このプラグインを外しても introDm の LLM 返信は動く。

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ①プロバイダ | `shared/llmClient`（基盤所有・本プラグイン外） |
| ②解決 | `contextCollector.js`（文脈・プロフィール・記憶の収集と選別） |
| ④ビュー | `promptBuilder.js` / `responseFormatter.js`（純関数） |
| ⑥ライフサイクル | `responder.js`（並行制御・生成・返信・記録） |
| ⑦入力経路 | messageCreate@103（メンション/返信トリガ） |
| ⑨機能間連携 | `actions/messageLinkReply.js`（メッセージリンク先の要約返信） |

③⑤⑧は該当なし。
