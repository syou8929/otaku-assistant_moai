const command = require('./command');
const {
  handleAnimeReactionAdd,
  handleAnimeReactionRemove,
  handleAnimeWatchedPromptReply,
  handleAnimeParentMessageDeleted,
  runAnimeOrphanScan
} = require('./index');
const { handleAnimeHashtagPost } = require('./hashtagIntegration');
const { getAnnictAccessToken } = require('./annictClient');

module.exports = {
  name: 'anime',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  // 実行時の有効/無効は従来どおり config の anime.enabled も併用される。
  enabledByDefault: true,
  dependsOn: ['timeline-relay'],
  intents: ['Guilds', 'GuildMessages', 'GuildMessageReactions', 'MessageContent'],
  capabilities: {},
  commands: [command],
  events: {
    // 旧チェーンの anime-watched-reply スロット（@102）。true で以降を停止（旧 early-return）。
    messageCreate: {
      priority: 102,
      handle: async (message) => (await handleAnimeWatchedPromptReply(message)) === true
    },
    // 旧チェーン順序: deletable(legacy@100, 処理時は停止) → anime。
    messageReactionAdd: {
      priority: 110,
      handle: async (reaction, user) => {
        await handleAnimeReactionAdd(reaction, user);
      }
    },
    messageReactionRemove: {
      priority: 110,
      handle: async (reaction, user) => {
        await handleAnimeReactionRemove(reaction, user);
      }
    },
    // 旧 messageDelete チェーン末尾の anime 後始末。
    messageDelete: {
      priority: 110,
      handle: async (message) => {
        const client = message?.client;

        if (!client || !message?.id) {
          return;
        }

        await handleAnimeParentMessageDeleted(client, message);
      }
    },
    // コンポーネント操作（ボタン/セレクト）の処理。旧 interactionCreate の anime 決め打ちを
    // 登録制に反転（spec §6）。chat-input は素通しして legacy@100 のコマンド dispatch へ。
    interactionCreate: {
      priority: 90,
      handle: async (interaction) => {
        if (interaction.isChatInputCommand()) {
          return false;
        }

        if (typeof command.handleComponentInteraction !== 'function') {
          return false;
        }

        const handled = await command.handleComponentInteraction(interaction);
        return handled === true;
      }
    },
    // 旧 ready ハンドラ内の anime ブロック（config ログ・annict トークン警告・孤児スキャン）。
    clientReady: {
      priority: 105,
      once: true,
      handle: async (client) => {
        client.logger.info('anime config loaded', {
          enabled: client.appConfig.anime.enabled,
          provider: client.appConfig.anime.provider,
          channelId: client.appConfig.anime.channelId,
          autoPostOnCastLookup: client.appConfig.anime.autoPostOnCastLookup,
          interestEmoji: client.appConfig.anime.interestEmoji,
          watchedEmoji: client.appConfig.anime.watchedEmoji
        });

        if (client.appConfig.anime.provider === 'annict' && !getAnnictAccessToken(client)) {
          client.logger.warn('annict token missing', {
            provider: client.appConfig.anime.provider,
            accessTokenEnv: client.appConfig.annict.accessTokenEnv
          });
        }

        await runAnimeOrphanScan(client).catch((error) => {
          client.logger.error('anime orphan scan failed', {
            error: error.message
          });
        });
      }
    }
  },
  init({ services }) {
    // relay されたメッセージのアニメ hashtag 後処理（フック反転 #3）。
    // このプラグインを無効化/削除するとフック未登録のままで relay 側は no-op。
    services['timeline-relay'].registerHashtagPostHandler(handleAnimeHashtagPost);
  }
};
