/**
 * 发版前质量门禁：typecheck → unit test → build
 *
 * 用法：npm run preflight
 * 可选：PREFLIGHT_E2E=1 npm run preflight  （额外跑 e2e，需已安装 Playwright）
 */

const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'

function run(label, args) {
  console.log(`\n==> ${label}: npm ${args.join(' ')}\n`)
  const r = spawnSync(npmCmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin
  })
  if (r.status !== 0) {
    console.error(`\n[preflight] FAILED at: ${label}`)
    process.exit(r.status ?? 1)
  }
}

run('typecheck', ['run', 'typecheck'])
run('unit tests', ['test'])
run('build', ['run', 'build'])

if (process.env.PREFLIGHT_E2E === '1') {
  run('e2e', ['run', 'test:e2e:only'])
}

console.log('\n[preflight] OK — typecheck + test + build passed')
if (process.env.PREFLIGHT_E2E !== '1') {
  console.log('[preflight] tip: set PREFLIGHT_E2E=1 to also run Playwright e2e')
}
