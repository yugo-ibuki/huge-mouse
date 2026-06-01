import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const appPath = join(root, 'target', 'release', 'bundle', 'macos', 'unitmux.app')
const executablePath = join(appPath, 'Contents', 'MacOS', 'unitmux')
const infoPlistPath = join(appPath, 'Contents', 'Info.plist')
const maxWaitMs = 10_000
const pollMs = 500
const expectedWindowWidth = 700
const expectedWindowHeight = 400
const windowSizeTolerance = 80

if (process.platform !== 'darwin') {
  console.error('macOS GUI smoke check must run on macOS')
  process.exit(1)
}

if (!existsSync(appPath)) {
  console.error(`app bundle is missing: ${appPath}`)
  process.exit(1)
}

if (!existsSync(executablePath)) {
  console.error(`app executable is missing: ${executablePath}`)
  process.exit(1)
}

if ((statSync(executablePath).mode & 0o111) === 0) {
  console.error(`app executable is not executable: ${executablePath}`)
  process.exit(1)
}

runPreflight('Info.plist validation', 'plutil', ['-lint', infoPlistPath])
runPreflight('code signature verification', 'codesign', [
  '--verify',
  '--deep',
  '--strict',
  '--verbose=2',
  appPath
])
runLaunchServicesControlCheck()

const openResult = spawnSync('open', ['-n', appPath], { encoding: 'utf8' })
if (openResult.status !== 0) {
  const output = `${openResult.stdout}${openResult.stderr}`.trim()
  console.error(output || 'open failed without output')
  if (output.includes('kLSNoExecutableErr')) {
    console.error('LaunchServices reported kLSNoExecutableErr for the packaged app')
  }
  process.exit(openResult.status ?? 1)
}

const deadline = Date.now() + maxWaitMs
let lastError = ''
while (Date.now() < deadline) {
  const probe = spawnSync(
    'osascript',
    [
      '-e',
      `tell application "System Events"
  if exists process "unitmux" then
    tell process "unitmux"
      if (count windows) > 0 then
        set windowSize to size of window 1
        return "frontmost:" & (frontmost of process "unitmux" as text) & "," & (item 1 of windowSize as text) & "," & (item 2 of windowSize as text)
      else
        return "0"
      end if
    end tell
  else
    return "-1"
  end if
end tell`
    ],
    { encoding: 'utf8' }
  )
  const output = probe.stdout.trim()
  const probeError = `${probe.stdout}${probe.stderr}`.trim()
  if (probe.status !== 0 && isAccessibilityPermissionError(probeError)) {
    console.error(
      'Accessibility permission is required for the GUI smoke check: enable your terminal in System Settings > Privacy & Security > Accessibility'
    )
    console.error(probeError)
    quitApp()
    process.exit(probe.status ?? 1)
  }
  const windowState = parseWindowState(output)

  if (
    probe.status === 0 &&
    windowState &&
    windowState.frontmost &&
    windowSizeMatches(windowState)
  ) {
    console.log(
      `unitmux GUI smoke check passed; visible frontmost window size: ${windowState.width}x${windowState.height}`
    )
    quitApp()
    process.exit(0)
  }

  lastError = windowState
    ? `unitmux window state frontmost:${windowState.frontmost}, size ${windowState.width}x${windowState.height} is outside expected frontmost:true ${expectedWindowWidth}x${expectedWindowHeight}`
    : probeError
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs)
}

console.error(lastError || 'unitmux did not expose a visible GUI window before timeout')
quitApp()
process.exit(1)

function quitApp() {
  spawnSync('osascript', ['-e', 'tell application "unitmux" to quit'], { stdio: 'ignore' })
}

function runPreflight(label, command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`.trim()
    console.error(`${label} failed`)
    console.error(output || `${command} failed without output`)
    process.exit(result.status ?? 1)
  }
}

function runLaunchServicesControlCheck() {
  const controlRoot = mkdtempSync(join(tmpdir(), 'unitmux-launchservices-'))
  const controlAppPath = join(controlRoot, 'MinimalOpenCheck.app')
  const controlMacosPath = join(controlAppPath, 'Contents', 'MacOS')
  const controlExecutablePath = join(controlMacosPath, 'minimal-open-check')
  const controlInfoPlistPath = join(controlAppPath, 'Contents', 'Info.plist')
  const controlSourcePath = join(controlRoot, 'minimal-open-check.m')

  try {
    mkdirSync(controlMacosPath, { recursive: true })
    writeFileSync(
      controlSourcePath,
      `#import <Cocoa/Cocoa.h>

@interface AppDelegate : NSObject <NSApplicationDelegate>
@end

@implementation AppDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [NSApp terminate:nil];
}
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    AppDelegate *delegate = [AppDelegate new];
    [NSApp setDelegate:delegate];
    [NSApp run];
  }
  return 0;
}
`
    )
    const compileResult = spawnSync(
      'clang',
      ['-fobjc-arc', '-framework', 'Cocoa', controlSourcePath, '-o', controlExecutablePath],
      { encoding: 'utf8' }
    )
    if (compileResult.status !== 0) {
      const output = `${compileResult.stdout}${compileResult.stderr}`.trim()
      console.error('LaunchServices control app compilation failed')
      console.error(output || 'clang failed without output')
      rmSync(controlRoot, { recursive: true, force: true })
      process.exit(compileResult.status ?? 1)
    }
    chmodSync(controlExecutablePath, 0o755)
    writeFileSync(
      controlInfoPlistPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>minimal-open-check</string>
  <key>CFBundleIdentifier</key>
  <string>com.unitmux.minimal-open-check</string>
  <key>CFBundleName</key>
  <string>MinimalOpenCheck</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
`
    )
    writeFileSync(join(controlAppPath, 'Contents', 'PkgInfo'), 'APPL????')

    runPreflight('LaunchServices control Info.plist validation', 'plutil', [
      '-lint',
      controlInfoPlistPath
    ])
    runPreflight('LaunchServices control code signing', 'codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      controlAppPath
    ])

    const controlOpenResult = spawnSync('open', ['-n', '-W', controlAppPath], { encoding: 'utf8' })
    if (controlOpenResult.status !== 0) {
      const output = `${controlOpenResult.stdout}${controlOpenResult.stderr}`.trim()
      console.error('LaunchServices cannot open a minimal signed app in this environment')
      console.error(output || 'open failed without output')
      console.error(
        'The unitmux bundle preflight passed; run npm run smoke:mac-gui from a real macOS desktop session.'
      )
      rmSync(controlRoot, { recursive: true, force: true })
      process.exit(controlOpenResult.status ?? 1)
    }
  } finally {
    rmSync(controlRoot, { recursive: true, force: true })
  }
}

function parseWindowState(output) {
  const match = output.match(/^frontmost:(true|false),(\d+),(\d+)$/)
  return match
    ? { frontmost: match[1] === 'true', width: Number(match[2]), height: Number(match[3]) }
    : undefined
}

function windowSizeMatches({ width, height }) {
  return (
    Math.abs(width - expectedWindowWidth) <= windowSizeTolerance &&
    Math.abs(height - expectedWindowHeight) <= windowSizeTolerance
  )
}

function isAccessibilityPermissionError(output) {
  return /not allowed assistive access|not authorized to send apple events|System Events got an error/i.test(
    output
  )
}
