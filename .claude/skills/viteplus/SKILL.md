---
name: viteplus
description: Vite+（vp コマンド）を使った開発ワークフロー。Use when the user says "vp", "vite+", "viteplus", or asks about dev/build/check/test commands using the Vite+ toolchain. Covers project creation, development, building, testing, and environment management.
---

# Vite+

Vite+ を使ったプロジェクトの開発ワークフロー。

## Overview

Vite+ は Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, Vite Task を統合した Web 開発の統合ツールチェーンです。詳細は `references/usage.md` を参照してください。

## Common Commands

| Command | Description |
|---------|-------------|
| `vp dev` | 開発サーバー起動 |
| `vp build` | 本番ビルド |
| `vp check` | フォーマット + リント + 型チェック一括実行 |
| `vp test` | Vitest によるテスト実行 |
| `vp install` | 依存関係インストール（パッケージマネージャー自動検出） |
| `vp create` | 新規プロジェクト作成 |
| `vp migrate` | 既存 Vite プロジェクトの移行 |

## When to Use

- プロジェクトの開発サーバー起動、ビルド、テスト、リントを行う時
- 新規プロジェクトの作成や既存プロジェクトの Vite+ への移行時
- Node.js のバージョン管理（`vp env`）を行う時
- パッケージの追加・削除（`vp add` / `vp remove`）を行う時

## References

詳細な使い方は `references/usage.md` を参照。
