import { spawnSync } from 'node:child_process'

const checks = [
  ['cargo', ['fmt', '--check']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'lint']],
  ['node', ['--check', 'scripts/dev.mjs']],
  ['npm', ['test']],
  ['cargo', ['clippy', '--offline', '--workspace', '--all-targets', '--', '-D', 'warnings']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'build:mac']],
  ['plutil', ['-lint', 'target/release/bundle/macos/unitmux.app/Contents/Info.plist']],
  ['file', ['target/release/bundle/macos/unitmux.app/Contents/Resources/unitmux.icns']],
  ['codesign', ['--verify', '--deep', '--strict', '--verbose=2', 'target/release/bundle/macos/unitmux.app']],
  ['npm', ['run', 'web:build']],
  ['npm', ['ls', '--depth=0']],
  ['cargo', ['tree', '-p', 'unitmux', '--depth', '1']]
]

for (const [command, args] of checks) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('\nStatic migration verification passed.')
console.log('Run npm run smoke:mac-gui on a real macOS desktop session for GUI verification.')
