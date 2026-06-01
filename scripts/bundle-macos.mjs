import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const appName = 'unitmux'
const bundleRoot = join(root, 'target', 'release', 'bundle', 'macos')
const appPath = join(bundleRoot, `${appName}.app`)
const contentsPath = join(appPath, 'Contents')
const macosPath = join(contentsPath, 'MacOS')
const resourcesPath = join(contentsPath, 'Resources')
const binaryPath = join(root, 'target', 'release', appName)
const outputBinaryPath = join(macosPath, appName)
const iconPngPath = join(root, 'resources', 'icon.png')
const iconsetPath = join(bundleRoot, `${appName}.iconset`)
const iconPath = join(resourcesPath, `${appName}.icns`)
const dmgPath = join(bundleRoot, `${appName}.dmg`)
const requireDmg = process.env.REQUIRE_DMG === '1'

if (process.platform !== 'darwin') {
  console.log('macOS app bundling is skipped on non-macOS hosts')
  process.exit(0)
}

if (!existsSync(binaryPath)) {
  throw new Error(`release binary is missing: ${binaryPath}`)
}

rmSync(appPath, { recursive: true, force: true })
mkdirSync(macosPath, { recursive: true })
mkdirSync(resourcesPath, { recursive: true })
copyFileSync(binaryPath, outputBinaryPath)
chmodSync(outputBinaryPath, 0o755)

const bundleIconName = existsSync(iconPngPath)
  ? createIcns(iconPngPath, iconsetPath, iconPath)
  : undefined

writeFileSync(
  join(contentsPath, 'Info.plist'),
  plist({
    CFBundleDevelopmentRegion: 'en',
    CFBundleDisplayName: appName,
    CFBundleExecutable: appName,
    ...(bundleIconName ? { CFBundleIconFile: bundleIconName } : {}),
    CFBundleIdentifier: 'com.unitmux',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundleName: appName,
    CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: packageJson.version,
    CFBundleVersion: packageJson.version,
    LSApplicationCategoryType: 'public.app-category.developer-tools',
    LSMinimumSystemVersion: '11.0',
    NSHighResolutionCapable: true,
    NSPrincipalClass: 'NSApplication'
  })
)
writeFileSync(join(contentsPath, 'PkgInfo'), 'APPL????')

clearExtendedAttributes(appPath)
signApp(appPath)
createDmg(appPath, dmgPath, { required: requireDmg })
console.log(`Created ${appPath}`)

function createIcns(sourcePng, iconset, output) {
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })

  const iconSpecs = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ]

  for (const [size, file] of iconSpecs) {
    const result = spawnSync(
      'sips',
      ['-z', String(size), String(size), sourcePng, '--out', join(iconset, file)],
      {
        stdio: 'ignore'
      }
    )
    if (result.status !== 0) {
      rmSync(iconset, { recursive: true, force: true })
      return undefined
    }
  }

  const result = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', output], { stdio: 'ignore' })
  rmSync(iconset, { recursive: true, force: true })
  if (result.status !== 0) {
    const fallbackResult = spawnSync('sips', ['-s', 'format', 'icns', sourcePng, '--out', output], {
      stdio: 'ignore'
    })
    return fallbackResult.status === 0 ? basename(output) : undefined
  }
  return basename(output)
}

function createDmg(sourceApp, output, { required }) {
  rmSync(output, { force: true })
  const result = spawnSync(
    'hdiutil',
    ['create', '-volname', appName, '-srcfolder', sourceApp, '-ov', '-format', 'UDZO', output],
    { stdio: 'inherit' }
  )
  if (result.error || result.status !== 0) {
    // Local sandboxed macOS runs can lack usable disk image devices; release
    // builds set REQUIRE_DMG=1 so a missing upload artifact fails immediately.
    if (required) {
      throw new Error('DMG creation failed')
    }
    console.warn('DMG creation skipped; app bundle was still created')
  }
}

function signApp(sourceApp) {
  const result = spawnSync('codesign', ['--force', '--deep', '--sign', '-', sourceApp], {
    stdio: 'inherit'
  })
  if (result.error || result.status !== 0) {
    console.warn('Ad-hoc code signing skipped; app launch may be blocked by macOS')
  }
}

function clearExtendedAttributes(sourceApp) {
  spawnSync('xattr', ['-cr', sourceApp], { stdio: 'ignore' })
}

function plist(values) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(values)
  .map(([key, value]) => plistEntry(key, value))
  .join('')}
</dict>
</plist>
`
}

function plistEntry(key, value) {
  if (typeof value === 'boolean') {
    return `  <key>${escapeXml(key)}</key>\n  <${value ? 'true' : 'false'}/>\n`
  }
  return `  <key>${escapeXml(key)}</key>\n  <string>${escapeXml(String(value))}</string>\n`
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
