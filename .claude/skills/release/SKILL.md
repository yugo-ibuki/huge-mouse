---
name: release
description: Release a new version of huge-mouse. Use when the user says "リリース", "release", "バージョン上げて", or wants to publish a new version. Handles version bump, commit, tag, push, and CI monitoring. Also use when the user asks about the release process or wants to check release status.
---

# Release

Automate the huge-mouse release process: version bump → commit → tag → push → CI build.

## Prerequisites

- All changes must be committed before starting
- Must be on the `main` branch
- Remote must be up to date (`git pull` if needed)

## Process

### 1. Pre-flight checks

```bash
git status          # Must be clean (no uncommitted changes)
git branch          # Must be on main
git log --oneline -5  # Review recent commits for release notes context
```

If there are uncommitted changes, ask the user to commit first or offer to commit them.

### 2. Determine version

Read the current version from `package.json`. Suggest the next patch version (e.g., 0.1.1 → 0.1.2) unless the user specifies otherwise.

Version guidelines:

- **Patch** (0.1.x): Bug fixes, minor UI tweaks, small improvements
- **Minor** (0.x.0): New features, significant UI changes
- **Major** (x.0.0): Breaking changes (rare at this stage)

Ask the user to confirm the version before proceeding.

### 3. Bump version

Update `"version"` in `package.json`.

### 4. Commit and tag

```bash
git add package.json
git commit -m "chore: bump version to <version>"
git tag v<version>
```

### 5. Push

```bash
git push origin main --tags
```

This triggers the GitHub Actions CI workflow (`.github/workflows/release.yml`) which builds for macOS, Linux, and Windows and creates a GitHub release with assets.

### 6. Monitor CI (optional)

If the user wants to wait for CI:

```bash
gh run list --limit 3
gh run watch <run-id>
```

### 7. macOS code signing note

The CI build uses ad-hoc signing. If the user needs a properly signed macOS build:

1. Build locally with `npm run build:mac`
2. Upload the DMG to the GitHub release, replacing the CI-built one

### 8. Replace macOS asset with local build

CI builds use ad-hoc signing which causes Gatekeeper issues. Replace with a locally signed build:

1. Build locally:

   ```bash
   npm run build:mac
   ```

2. Find the DMG:

   ```bash
   ls dist/*.dmg
   ```

3. Delete the CI-built macOS asset and upload the local one:

   ```bash
   # List release assets
   gh release view v<version>

   # Delete CI-built DMG
   gh release delete-asset v<version> <ci-dmg-filename> --yes

   # Upload local DMG
   gh release upload v<version> dist/<local-dmg-filename>
   ```

4. Verify the upload:
   ```bash
   gh release view v<version>
   ```

### 9. Update Homebrew tap

After replacing the DMG, update the Homebrew cask formula:

1. Get the new SHA-256:

   ```bash
   shasum -a 256 dist/<local-dmg-filename>
   ```

2. Update the checksum in the tap repo (`homebrew-tap/Casks/huge-mouse.rb`):
   - Update `version`
   - Update `sha256`
   - Update the download URL if the filename changed

3. **Ask the user before pushing** to the tap repo.

## Post-release checklist

- [ ] CI build completed
- [ ] macOS DMG replaced with local build
- [ ] Homebrew tap checksum updated
- [ ] Verified `brew install --cask yugo-ibuki/tap/huge-mouse` works

## Important rules

- Always ask for confirmation before committing, tagging, and pushing
- Never force-push
- Never skip version confirmation
