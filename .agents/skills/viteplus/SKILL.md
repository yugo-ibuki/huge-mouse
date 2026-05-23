---
name: viteplus
description: Use when working on the unitmux documentation site under web/, running web:* scripts, or when the user explicitly asks for vp, Vite+, or viteplus in this repo.
---

# Vite+

unitmux では Vite+ は `web/` 配下の VitePress ドキュメントサイト用に使います。root の Electron アプリ開発では `npm run dev` / `npm run build` / `npm run typecheck` を使います。

## Overview

Vite+ は Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, Vite Task を統合した Web 開発の統合ツールチェーンです。unitmux の `web/package.json` は VitePress scripts を持ち、root の `package.json` から `web:*` scripts で呼び出します。詳細は `references/usage.md` を参照してください。

## Common Commands

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| `npm run web:dev`        | ドキュメントサイト開発サーバー    |
| `npm run web:build`      | ドキュメントサイト本番ビルド      |
| `npm run web:preview`    | ドキュメントサイトのプレビュー    |
| `npm run web:install`    | `web/` の依存関係インストール     |
| `cd web && vp run dev`   | `web/` 内で直接 dev script 実行   |
| `cd web && vp run build` | `web/` 内で直接 build script 実行 |

## When to Use

- `web/docs/` の VitePress ドキュメントサイトを起動・ビルド・プレビューする時
- ユーザーが unitmux リポジトリ内で `vp` / `viteplus` / `Vite+` を明示した時
- `web/` の依存関係を追加・削除・更新する時

## References

詳細な使い方は `references/usage.md` を参照。
