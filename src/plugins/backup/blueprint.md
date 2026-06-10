# backup プラグイン blueprint

バックアップ/エクスポート基盤（「守る」仕組み — カタログ批評で致命的欠落とされた項目）。
better-sqlite3 のオンラインバックアップ API による日次スナップショット＋世代管理、
および知識資産（decision-log）の markdown エクスポート出口。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/backup/` |
| config キー | `plugins.backup`（cron / keep） |
| DB テーブル | なし（fs が真実源: `data/backups/` / `data/exports/`） |
| scheduler ジョブ | key `daily` |
| コマンド表面 | `/backup now|status|export`（管理者） |
| 残骸 | `data/backups/` `data/exports/`（削除は手動） |

## 設計判断

- **既定 ON（新機能既定OFF方針の例外）**: ユーザー向け表面を持たない純粋な安全装置であり、
  OFF のまま事故が起きる損害が ON の害（ディスク消費のみ）を圧倒的に上回るため
- バックアップは WAL 安全なオンライン API（bot 無停止）。復元は意図的に手動のみ
  （bot 停止 → `data/otaku-assistant.db` 差し替え → 起動）— 自動復元は誤操作の爆発半径が大きい
- 世代管理は最新 N 件保持（既定14）。同一ホスト保存なのでホスト障害には無力 —
  オフホスト退避（rsync/オブジェクトストレージ）は運用側の cron に委ねる（guide に記載）
- エクスポートは decisions テーブルの存在を sqlite_master で確認して動く
  （decision-log 無効でも壊れない・dependsOn 不要）

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ⑥ライフサイクル | runBackup（スナップショット＋世代剪定）/ exportDecisionsMarkdown |
| ⑦入力経路 | `/backup` ＋ 日次 cron |

他層は該当なし。
