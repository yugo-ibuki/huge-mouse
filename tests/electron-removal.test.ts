import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()

const removedElectronFiles = [
  'electron-builder.yml',
  'electron.vite.config.ts',
  'tsconfig.node.json',
  'src/main/index.ts',
  'src/main/tmux.ts',
  'src/main/tokenUsage.ts',
  'src/preload/index.ts',
  'src/preload/index.d.ts'
]

const requiredRustFiles = [
  'Cargo.toml',
  'Cargo.lock',
  'crates/unitmux-core/Cargo.toml',
  'crates/unitmux-core/src/tmux.rs',
  'crates/unitmux-core/src/token_usage.rs',
  'src-tauri/Cargo.toml',
  'src-tauri/src/main.rs',
  'src-tauri/src/commands.rs',
  'src-tauri/tauri.conf.json',
  'scripts/bundle-macos.mjs',
  'scripts/dev.mjs',
  'scripts/verify-migration.mjs',
  'scripts/smoke-macos-gui.mjs'
]

const skippedResidualDirs = new Set([
  '.git',
  '.agents',
  '.claude',
  '.superpowers',
  'node_modules',
  'target',
  'dist',
  'out'
])

const skippedResidualFiles = new Set([
  '.eslintcache',
  'Cargo.lock',
  'package-lock.json',
  'RUST_MIGRATION_STATUS.md',
  'web/docs/guide/migration-status.md',
  'tests/electron-removal.test.ts'
])

const legacyDesktopRuntimePattern =
  /electron|electron-builder|electron-vite|@electron|browserwindow|ipcmain|contextbridge|app\.whenready|\bpreload\b|src\/preload|src\/main\/index|src\/main\/tmux/i

const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-image:"

function collectFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const repoPath = relative(root, path)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      if (!skippedResidualDirs.has(entry)) {
        collectFiles(path, files)
      }
      continue
    }

    if (!skippedResidualFiles.has(repoPath)) {
      files.push(path)
    }
  }

  return files
}

describe('Electron removal', () => {
  it('does not keep Electron runtime or build dependencies in package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    const packageText = JSON.stringify({
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
      scripts: packageJson.scripts
    })

    expect(packageText).not.toMatch(/electron|electron-vite|electron-builder|@electron/i)
  })

  it('keeps electron-to-chromium only as a browserslist transitive dependency', () => {
    const lockfile = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
      packages?: Record<
        string,
        {
          dependencies?: Record<string, string>
        }
      >
    }
    const rootPackage = lockfile.packages?.['']
    const browserslist = lockfile.packages?.['node_modules/browserslist']

    expect(rootPackage?.dependencies).not.toHaveProperty('electron')
    expect(rootPackage?.devDependencies).not.toHaveProperty('electron')
    expect(rootPackage?.dependencies).not.toHaveProperty('electron-to-chromium')
    expect(rootPackage?.devDependencies).not.toHaveProperty('electron-to-chromium')
    expect(browserslist?.dependencies).toHaveProperty('electron-to-chromium')
  })

  it('keeps macOS build output installable without Electron tooling', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const bundleScript = readFileSync(join(root, 'scripts/bundle-macos.mjs'), 'utf8')

    expect(packageJson.scripts?.['bundle:mac']).toBe('node scripts/bundle-macos.mjs')
    expect(packageJson.scripts?.['build:mac']).toContain('cargo build -p unitmux --release')
    expect(packageJson.scripts?.['build:mac']).toContain('npm run bundle:mac')
    expect(bundleScript).toContain("target', 'release', 'bundle', 'macos")
    expect(bundleScript).toContain('Info.plist')
    expect(bundleScript).toContain('PkgInfo')
    expect(bundleScript).toContain('CFBundleIdentifier')
    expect(bundleScript).toContain('CFBundleExecutable: appName')
    expect(bundleScript).toContain('CFBundleIconFile')
    expect(bundleScript).toContain('LSMinimumSystemVersion')
    expect(bundleScript).toContain('NSPrincipalClass')
    expect(bundleScript).toContain('LSApplicationCategoryType')
    expect(bundleScript).toContain('chmodSync(outputBinaryPath, 0o755)')
    expect(bundleScript).toContain("'-s', 'format', 'icns'")
    expect(bundleScript).toContain('xattr')
    expect(bundleScript).toContain('codesign')
    expect(bundleScript).toContain('hdiutil')
    expect(bundleScript).toContain("process.env.REQUIRE_DMG === '1'")
    expect(bundleScript).toContain('DMG creation failed')
  })

  it('keeps image picker behavior implemented on release target platforms', () => {
    const commandsRs = readFileSync(join(root, 'src-tauri/src/commands.rs'), 'utf8')

    expect(commandsRs).toContain('#[cfg(target_os = "macos")]')
    expect(commandsRs).toContain('choose file with prompt "Select images"')
    expect(commandsRs).toContain('#[cfg(target_os = "linux")]')
    expect(commandsRs).toContain('zenity')
    expect(commandsRs).toContain('--file-selection')
    expect(commandsRs).toContain('#[cfg(target_os = "windows")]')
    expect(commandsRs).toContain('System.Windows.Forms.OpenFileDialog')
    expect(commandsRs).not.toContain('#[cfg(not(target_os = "macos"))]\nfn select_images_platform()')
  })

  it('keeps a reproducible real-desktop macOS GUI smoke check', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const smokeScript = readFileSync(join(root, 'scripts/smoke-macos-gui.mjs'), 'utf8')

    expect(packageJson.scripts?.['smoke:mac-gui']).toBe('node scripts/smoke-macos-gui.mjs')
    expect(smokeScript).toContain("target', 'release', 'bundle', 'macos', 'unitmux.app")
    expect(smokeScript).toContain("statSync(executablePath).mode & 0o111")
    expect(smokeScript).toContain("runPreflight('Info.plist validation', 'plutil'")
    expect(smokeScript).toContain("runPreflight('code signature verification', 'codesign'")
    expect(smokeScript).toContain('runLaunchServicesControlCheck()')
    expect(smokeScript).toContain('MinimalOpenCheck.app')
    expect(smokeScript).toContain('const compileResult = spawnSync(')
    expect(smokeScript).toContain("'clang',")
    expect(smokeScript).toContain("'-framework', 'Cocoa'")
    expect(smokeScript).toContain('[NSApplication sharedApplication]')
    expect(smokeScript).not.toContain("copyFileSync('/usr/bin/true', controlExecutablePath)")
    expect(smokeScript).toContain('LaunchServices cannot open a minimal signed app')
    expect(smokeScript).toContain("spawnSync('open'")
    expect(smokeScript).toContain('System Events')
    expect(smokeScript).toContain('process "unitmux"')
    expect(smokeScript).toContain('expectedWindowWidth = 700')
    expect(smokeScript).toContain('expectedWindowHeight = 400')
    expect(smokeScript).toContain('size of window 1')
    expect(smokeScript).toContain('frontmost of process "unitmux"')
    expect(smokeScript).toContain('frontmost:true')
    expect(smokeScript).toContain('Accessibility permission')
    expect(smokeScript).toContain('System Settings > Privacy & Security > Accessibility')
    expect(smokeScript).toContain('kLSNoExecutableErr')
  })

  it('keeps a single static migration verification command', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const verifyScript = readFileSync(join(root, 'scripts/verify-migration.mjs'), 'utf8')

    expect(packageJson.scripts?.['verify:migration']).toBe('node scripts/verify-migration.mjs')
    expect(verifyScript).toContain("['cargo', ['fmt', '--check']]")
    expect(verifyScript).toContain("['npm', ['run', 'typecheck']]")
    expect(verifyScript).toContain("['npm', ['run', 'lint']]")
    expect(verifyScript).toContain("['node', ['--check', 'scripts/dev.mjs']]")
    expect(verifyScript).toContain("['npm', ['test']]")
    expect(verifyScript).toContain("['cargo', ['clippy', '--offline', '--workspace', '--all-targets', '--', '-D', 'warnings']]")
    expect(verifyScript).toContain("['npm', ['run', 'build']]")
    expect(verifyScript).toContain("['npm', ['run', 'build:mac']]")
    expect(verifyScript).toContain("['plutil', ['-lint', 'target/release/bundle/macos/unitmux.app/Contents/Info.plist']]")
    expect(verifyScript).toContain("['file', ['target/release/bundle/macos/unitmux.app/Contents/Resources/unitmux.icns']]")
    expect(verifyScript).toContain("['codesign', ['--verify', '--deep', '--strict', '--verbose=2', 'target/release/bundle/macos/unitmux.app']]")
    expect(verifyScript).toContain("['npm', ['run', 'web:build']]")
    expect(verifyScript).toContain("['npm', ['ls', '--depth=0']]")
    expect(verifyScript).toContain("['cargo', ['tree', '-p', 'unitmux', '--depth', '1']]")
    expect(verifyScript).toContain('npm run smoke:mac-gui')
  })

  it('keeps npm scripts aligned with the Tauri debug and packaged frontend paths', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      build?: {
        beforeDevCommand?: string
        devUrl?: string
        frontendDist?: string
      }
    }

    expect(tauriConfig.build?.beforeDevCommand).toBe('npm run dev:renderer')
    expect(tauriConfig.build?.devUrl).toBe('http://127.0.0.1:5173')
    expect(tauriConfig.build?.frontendDist).toBe('../dist/renderer')
    const devScript = readFileSync(join(root, 'scripts/dev.mjs'), 'utf8')

    expect(packageJson.scripts?.['dev']).toBe('node scripts/dev.mjs')
    expect(packageJson.scripts?.['start']).toBe(
      'npm run build:renderer && cargo run -p unitmux --release'
    )
    expect(devScript).toContain("npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'")
    expect(devScript).toContain("spawn(npmCommand, ['run', 'dev:renderer']")
    expect(devScript).toContain("spawn('cargo', ['run', '-p', 'unitmux']")
    expect(devScript).toContain('waitForDevServer')
    expect(devScript).toContain('renderer dev server exited')
    expect(devScript).toContain('if (!shuttingDown && cargo) {')
    expect(devScript).toContain('detached: process.platform !==')
    expect(devScript).toContain('killProcessTree')
    expect(devScript).toContain('process.kill(-child.pid')
  })

  it('keeps the GitHub release workflow on the Rust build path', () => {
    const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')

    expect(workflow).toContain('dtolnay/rust-toolchain@stable')
    expect(workflow).toContain('libwebkit2gtk-4.1-dev')
    expect(workflow).toContain('Static checks')
    expect(workflow).toContain('npm run lint')
    expect(workflow).toContain('npm test')
    expect(workflow).toContain('cargo clippy --workspace --all-targets -- -D warnings')
    expect(workflow).toContain('actions/upload-artifact@v4')
    expect(workflow).toContain('softprops/action-gh-release@v2')
    expect(workflow).toContain("REQUIRE_DMG: ${{ runner.os == 'macOS' && '1' || '' }}")
    expect(workflow).toContain('target/release/bundle/macos')
    expect(workflow).toContain('Validate macOS app bundle')
    expect(workflow).toContain('plutil -lint target/release/bundle/macos/unitmux.app/Contents/Info.plist')
    expect(workflow).toContain('file target/release/bundle/macos/unitmux.app/Contents/Resources/unitmux.icns')
    expect(workflow).toContain('codesign --verify --deep --strict --verbose=2 target/release/bundle/macos/unitmux.app')
    expect(workflow).toContain('Prepare release asset')
    expect(workflow).toContain('release-assets/unitmux-macos.dmg')
    expect(workflow).toContain('release-assets/unitmux-linux')
    expect(workflow).toContain('release-assets/unitmux-windows.exe')
    expect(workflow).toContain('Validate Linux binary')
    expect(workflow).toContain('test -x target/x86_64-unknown-linux-gnu/release/unitmux')
    expect(workflow).toContain('file target/x86_64-unknown-linux-gnu/release/unitmux')
    expect(workflow).toContain('Validate Windows binary')
    expect(workflow).toContain('Test-Path target/x86_64-pc-windows-msvc/release/unitmux.exe')
    expect(workflow).toContain('Get-Item target/x86_64-pc-windows-msvc/release/unitmux.exe')
    expect(workflow).toContain('target/x86_64-unknown-linux-gnu/release/unitmux')
    expect(workflow).toContain('target/x86_64-pc-windows-msvc/release/unitmux.exe')
    expect(workflow).toContain('files: release-artifacts/**/unitmux-*')
    expect(workflow).not.toMatch(/electron|electron-builder|electron-vite|@electron/i)
  })

  it('does not keep the old Electron main or preload files', () => {
    for (const file of removedElectronFiles) {
      expect(existsSync(join(root, file)), file).toBe(false)
    }
  })

  it('does not leave legacy desktop runtime references outside this audit', () => {
    const matches = collectFiles(root).flatMap((file) => {
      const contents = readFileSync(file)

      if (contents.includes(0)) {
        return []
      }

      const text = contents.toString('utf8')
      return legacyDesktopRuntimePattern.test(text) ? [relative(root, file)] : []
    })

    expect(matches).toEqual([])
  })

  it('keeps the Rust and Tauri replacement surface present', () => {
    for (const file of requiredRustFiles) {
      expect(existsSync(join(root, file)), file).toBe(true)
    }
  })

  it('keeps the Tauri window chrome aligned with the old Electron window', () => {
    const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      app: {
        windows: Array<{
          width?: number
          height?: number
          alwaysOnTop?: boolean
          decorations?: boolean
          titleBarStyle?: string
          hiddenTitle?: boolean
        }>
        security?: {
          csp?: string | null
        }
      }
    }
    const window = config.app.windows[0]

    expect(window.width).toBe(700)
    expect(window.height).toBe(400)
    expect(window.alwaysOnTop).toBe(true)
    expect(window.decorations).toBe(true)
    expect(window.titleBarStyle).toBe('Overlay')
    expect(window.hiddenTitle).toBe(true)
  })

  it('keeps Tauri and renderer CSP aligned for local image thumbnails', () => {
    const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      app: {
        security?: {
          csp?: string | null
        }
      }
    }
    const indexHtml = readFileSync(join(root, 'src/renderer/index.html'), 'utf8')
    const htmlCsp = indexHtml.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1]

    expect(config.app.security?.csp).toBe(expectedCsp)
    expect(htmlCsp).toBe(expectedCsp)
    expect(expectedCsp).toContain("script-src 'self'")
    expect(expectedCsp).toContain("img-src 'self' data: local-image:")
  })

  it('does not grant unused high-risk Tauri plugin permissions', () => {
    const capability = JSON.parse(
      readFileSync(join(root, 'src-tauri/capabilities/default.json'), 'utf8')
    ) as {
      windows?: string[]
      permissions?: string[]
    }

    expect(capability.windows).toEqual(['main'])
    expect(capability.permissions).toEqual(['core:default'])
    expect(capability.permissions?.join('\n')).not.toMatch(/shell|process|fs|dialog|opener/i)
  })

  it('keeps the custom app menu surface that Electron used for shortcut parity', () => {
    const mainRs = readFileSync(join(root, 'src-tauri/src/main.rs'), 'utf8')

    expect(mainRs).toContain('.menu(build_app_menu)')
    expect(mainRs).toContain('const HIDE_MENU_ID')
    expect(mainRs).toContain('MenuItem::with_id(app, HIDE_MENU_ID, "Hide", true, None::<&str>)')
    expect(mainRs).toContain('PredefinedMenuItem::hide_others')
    expect(mainRs).toContain('PredefinedMenuItem::show_all(app, Some("Unhide"))')
    expect(mainRs).toContain('PredefinedMenuItem::undo')
    expect(mainRs).toContain('PredefinedMenuItem::select_all')
  })
})
