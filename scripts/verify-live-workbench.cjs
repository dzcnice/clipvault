// 凭据仅从标准输入读取；不接受命令行密钥，不保存明文配置。
const { build } = require('esbuild')
const { spawn, spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const { createServer } = require('node:http')
const { randomBytes } = require('node:crypto')
async function main() {
  const sourceIndex = process.argv.indexOf('--source-profile')
  const sourceProfile = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : null
  let input = ''
  if (!sourceProfile) for await (const chunk of process.stdin) input += chunk.toString()
  const config = sourceProfile ? {} : JSON.parse(input)
  if (!sourceProfile && (!config.key || !config.endpoint || !config.model)) throw new Error('缺少受控联调配置')
  const entry = resolve('out/acceptance/live-workbench.cjs')
  await build({ entryPoints: ['scripts/fixtures/live-workbench.ts'], outfile: entry, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', logLevel: 'silent' })
  const reopen = resolve('out/acceptance/reopen-workbench.cjs')
  await build({ entryPoints: ['scripts/fixtures/reopen-workbench.ts'], outfile: reopen, bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external', logLevel: 'silent' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL; delete env.NODE_OPTIONS
  const capability = randomBytes(32).toString('hex')
  const bridge = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/' + capability || request.headers.origin || !config.key) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(config))
    config.key = ''; bridge.close()
  })
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve))
  env.CV_ACCEPTANCE_URL = 'http://127.0.0.1:' + bridge.address().port + '/' + capability
  const child = spawn(require('electron'), [entry, ...(sourceProfile ? ['--source-profile', sourceProfile] : [])], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  input = ''
  let reportOutput = ''
  child.stdout.on('data', chunk => { reportOutput += chunk.toString() })
  child.stdout.pipe(process.stdout)
  // Electron/native diagnostics may include provider payloads; only the fixture emits a bounded report.
  child.stderr.resume()
  const timer = setTimeout(() => { bridge.closeAllConnections(); bridge.close(); child.kill(); process.exitCode = 1 }, 240000)
  child.once('error', () => { clearTimeout(timer); process.stderr.write('无法启动独立 Electron 验收进程\n'); process.exitCode = 1 })
  child.once('close', code => {
    bridge.closeAllConnections(); bridge.close(); clearTimeout(timer)
    const line = reportOutput.split(/\r?\n/).find(line => line.startsWith('LIVE_REPORT:'))
    const report = line ? JSON.parse(line.slice(12)) : null
    if (code !== 0 || !report?.passed) { process.exitCode = 1; return }
    const checked = spawnSync(require('electron'), [reopen, report.profile, report.taskId, report.sessionId], { env, windowsHide: true, encoding: 'utf8', timeout: 150000 })
    const verified = checked.stdout?.split(/\r?\n/).find(line => line.startsWith('REOPEN_REPORT:'))
    if (verified) process.stdout.write(verified + '\n')
    process.exitCode = checked.status === 0 && verified && JSON.parse(verified.slice(14)).passed ? 0 : 1
  })
}
main().catch(() => { process.stderr.write('真实模型验收未完成，请核对受控配置\n'); process.exitCode = 1 })
