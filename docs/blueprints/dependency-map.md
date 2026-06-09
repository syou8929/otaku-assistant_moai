# 依存実測マップとプラグイン粒度の確定

- 日付: 2026-06-10
- 手法: `src/**/*.js` の `require()` を静的走査し、モジュール境界を跨ぐ辺を集計
- 目的: 設計 spec（2026-06-02 flat-base-plugin-architecture）の残課題 #2「プラグイン粒度」を実測で確定する

## 1. 実測結果（モジュール間依存）

### 順方向（モジュール → 依存先。db / services / utils / config は省略）

| モジュール | 依存先 |
|---|---|
| anime | deletableMessages, timelineRelay |
| entranceGuide | （なし） |
| introDm | guildMembers, llm(ollamaClient のみ) |
| introProfiles | guildMembers, introReactions |
| introReactions | （なし） |
| llm | introProfiles, messageArchive, userMemory |
| questionResolver | timelineRelay |
| timelineRelay | anime(hashtagIntegration), messageArchive, questionResolver(threadTags) |
| vcProfile | （なし） |
| welcomeReactions | （なし） |

### 逆方向（モジュール ← 利用元）

| モジュール | 利用元 |
|---|---|
| anime | cmd:anime, events, timelineRelay |
| deletableMessages | cmd:anime, events, anime |
| entranceGuide | cmd:maintenance |
| guildMembers | cmd:intro, events, introDm, introProfiles |
| introDm | cmd:intro, events |
| introProfiles | cmd:intro, events, llm |
| introReactions | cmd:intro, events, introProfiles |
| llm | events, introDm |
| messageArchive | events, llm, timelineRelay |
| ops | cmd:maintenance, events, index.js |
| questionResolver | cmd:maintenance, cmd:resolve, cmd:unresolve, timelineRelay |
| timelineRelay | events, anime, questionResolver |
| userMemory | cmd:maintenance, llm |
| vcProfile | cmd:maintenance, events |
| welcomeReactions | cmd:welcome, events |

### 検出された相互依存（要切断）

| 辺 | 実体 | 切断方針 |
|---|---|---|
| timelineRelay → anime | `index.js` が `anime/hashtagIntegration.handleAnimeHashtagPost` を直接呼ぶ | anime プラグインが relay パイプラインへ **フック登録**（⑨機能間連携 capability） |
| timelineRelay → questionResolver | `index.js` が `questionResolver/threadTags.applyQuestionStatusTag` を直接呼ぶ | question プラグインが同様にフック登録 |
| introProfiles → introReactions | `index.js:162` が遅延 require で `applyIntroReactionsToMessage` を呼ぶ（循環回避の痕跡） | introProfiles は shared 化するため、この呼び出しは intro プラグイン側のライフサイクルへ移動（shared → plugin 依存は禁止） |

### anime → timelineRelay の内訳

anime が import しているのは relay「機能」ではなく **メディア系ユーティリティ**:
`attachmentRelay` / `buildTimelineMessage` / `extractFirstPost` / `twitterMediaResolver` / `videoThumbnail`

→ 当面は spec 通り `anime dependsOn: ['timeline-relay']` とし、timeline-relay の公開 API（`ctx.services['timeline-relay']`）経由に置き換える。将来メディア処理を shared `media/` へ昇格する選択肢を残す。

## 2. 確定したプラグイン粒度（spec 残課題 #2 の解）

### Shared services（複数機能から参照されるため shared 確定）

| shared | 根拠（利用元数） |
|---|---|
| messageArchive | events, llm, timelineRelay |
| guildMembers | intro 系 3 箇所 + events |
| deletableMessages | anime, events, cmd |
| introProfiles（読取API） | llm, intro 系, events — spec 想定どおり |
| **userMemory**（新規判定） | llm, cmd:maintenance — 汎用のユーザー記憶ストアであり特定機能でない |
| **llmClient**（新規判定: ollamaClient を昇格） | introDm と llm 機能の双方が使用。プロバイダクライアントは「LLM会話機能」とは別物 |
| discordLinks / util(text, permissions, accentColors) | 全域 |

### Feature plugins（束ね方の確定）

| プラグイン | 中身 | dependsOn |
|---|---|---|
| timeline-relay | relay 本体 + フックポイント（relayPipeline / threadTags） | messageArchive |
| anime | 全 anime + hashtagIntegration（フック登録側へ反転） | timeline-relay, deletableMessages |
| question | questionResolver + questionWatcher + threadTags + resolve/unresolve コマンド | timeline-relay |
| intro | introDm + introReactions + intro コマンド（introProfiles は shared へ） | introProfiles, guildMembers, llmClient |
| welcome | welcomeReactions + welcome コマンド | （なし）← **最小依存・Stage B 移送の先鋒** |
| vc-profile | vcProfile | （なし） |
| entrance-guide | entranceGuide + guidePost コマンド + content/ | （なし） |
| llm | 会話機能（contextCollector, promptBuilder, responseFormatter, actions） | llmClient, introProfiles, messageArchive, userMemory |
| admin-dashboard | （別 spec） | — |

判断基準: **同時に ON/OFF したい単位 = 1 プラグイン**。intro の 3 分割（dm/reactions/profiles）は「プロフィールだけ他機能が読む」ため profiles のみ shared に出し、残りは束ねる。question の 2 分割（resolver/watcher）は分けて使う場面がないため束ねる。

## 3. 追加の発見事項

1. **cmd:maintenance は横断コマンド**: entranceGuide / ops / questionResolver / userMemory / vcProfile を触る。最終形では「core の maintenance コマンドに各プラグインがサブコマンドを寄与する」方式に分解が必要（Stage E〜F で対応）。
2. **introDm → llm は ollamaClient のみ**: llmClient を shared 化すれば intro と llm 機能は完全に独立する。
3. **events/ の直列チェーンは messageCreate に 7 段**: early-return するのは introDm / animeWatchedPromptReply / replyBasedRoute の 3 つ。eventRouter 移行時は priority と「true で停止」の対応表を作って移すこと。
4. **enabledByDefault の移行ポリシー**: spec は「既定 OFF」だが、稼働中サーバーの無停止移行（strangler-fig）を優先し、**移送済みプラグインは移行期間中 enabledByDefault: true** とする。Stage F（基盤ニュートラル化 = Armabot 化）で一括して既定 OFF へ反転し、loadout（config.plugins）で明示 ON する方式に切り替える。
