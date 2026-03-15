const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async ({ appOutDir, packager }) => {
  if (packager.platform.name !== 'mac') return

  const appPath = path.join(appOutDir, `${packager.appInfo.productName}.app`)
  console.log(`Re-signing with ad-hoc identity: ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
