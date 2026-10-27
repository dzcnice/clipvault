/** M0 validation only. Usage: node scripts/verify-harness.mjs <OnSet checkout> */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = process.argv[2] && resolve(process.argv[2])
throw new Error('此 OnSet 探索脚本已归档。正式验证请运行 npm run verify:harness，使用官方 DeepSeek Harness 独立运行时。')
if (!sourceRoot) throw new Error('Usage: node scripts/verify-harness.mjs <OnSet checkout>')
if (process.versions.electron) throw new Error('Use a standalone Node host, not Electron')
const lock = JSON.parse(readFileSync(join(appRoot, 'integrations/harness/runtime.lock.json'), 'utf8'))
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const patch = join(appRoot, 'integrations/harness/validation.patch.yml')
if (digest(patch) !== lock.validationProfileSha256) throw new Error('Validation profile differs from lock')
const git = process.platform === 'win32' ? 'git.exe' : 'git'
const revision = execFileSync(git, ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
const sourceStatus = execFileSync(git, ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8', windowsHide: true })
if (revision !== lock.sourceRevision) throw new Error('Source revision differs from the reviewed M0 baseline')
for (const [name, expected] of Object.entries(lock.artifacts)) {
  if (digest(join(sourceRoot, name)) !== expected) throw new Error(`Runtime artifact differs from lock: ${name}`)
}
const sdkVersion = JSON.parse(readFileSync(join(sourceRoot, 'packages/sdk/client/package.json'), 'utf8')).version
const runtimeVersion = JSON.parse(readFileSync(join(sourceRoot, 'apps/cli/package.json'), 'utf8')).version
if (sdkVersion !== lock.version || runtimeVersion !== lock.version) throw new Error('SDK/runtime version mismatch')

// No inherited API keys, proxies, NODE_OPTIONS, user patches, or project .env files.
const runRoot = mkdtempSync(join(tmpdir(), 'clipvault-harness-m0-'))
const workspace = join(runRoot, 'workspace')
const runtimeHome = join(runRoot, 'harness-home')
mkdirSync(workspace)
mkdirSync(runtimeHome)
const env = {}
for (const name of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP']) {
  if (process.env[name]) env[name] = process.env[name]
}
Object.assign(env, { HOME: runRoot, USERPROFILE: runRoot, APPDATA: runRoot, LOCALAPPDATA: runRoot, DSH_HOME: runtimeHome, DSH_TELEMETRY_DISABLED: '1', CLIPVAULT_M0_FAKE_KEY: 'non-secret-m0-fixture', NO_COLOR: '1' })
const modelRequests = []
let runningRequestObserved
const runningRequest = new Promise(resolve => { runningRequestObserved = resolve })
const fixtureServer = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      modelRequests.push({ toolNames: (body.tools ?? []).map(t => t.function?.name), model: body.model })
      if (modelRequests.length === 2) {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.flushHeaders()
        runningRequestObserved()
        return // Keep the second model stream open to exercise whole-runtime stop.
      }
      const events = [
        { choices: [{ delta: { role: 'assistant', content: null, reasoning_content: '' } }] },
        { choices: [{ delta: { content: 'M0_FIXTURE_OK' } }] },
        { choices: [{ delta: { content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }
      ]
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`)
      response.end('data: [DONE]\n\n')
    } catch { response.writeHead(400).end('Invalid fixture request') }
  })
})
await new Promise((resolve, reject) => { fixtureServer.once('error', reject); fixtureServer.listen(0, '127.0.0.1', resolve) })
env.CLIPVAULT_M0_BASE_URL = `http://127.0.0.1:${fixtureServer.address().port}`
const { HarnessClient } = await import(pathToFileURL(join(sourceRoot, 'packages/sdk/client/lib/index.js')).href)
const client = new HarnessClient({ dshBin: join(sourceRoot, 'apps/cli/lib/bin.js'), profile: 'sdk-minimal', patches: [patch], dshHome: runtimeHome, processCwd: workspace, env, initializeTimeoutMs: 12000, requestTimeoutMs: 4000, shutdownTimeoutMs: 3000, disposeEofGraceMs: 1000, disposeGraceMs: 2000 })
const report = { baseline: revision, version: sdkVersion, nodeVersion: process.version, platform: process.platform, checkedAt: new Date().toISOString(), fixtureOnly: true, realCredentialsUsed: false, externalModelRequests: false, sourceRootModified: false, runtimeArtifactsVerified: Object.keys(lock.artifacts).length, profileSha256: digest(patch), workspace, runtimeHome, checks: {}, executionEnabled: false }
try {
  const initialized = await client.initialize({ cwd: workspace, provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 64 })
  report.checks.initialize = initialized.serverInfo
  for (const method of ['approval/respond', 'session/resume', 'session/cancel']) {
    try {
      await client.request(method, { sessionId: 'm0-fixture' })
      report.checks[method] = 'unexpectedly accepted; manual protocol review required'
    } catch (error) {
      if (String(error.message).includes('unknown DeepSeek Harness SDK runtime method')) report.checks[method] = 'unsupported'
      else throw error
    }
  }
  const subscription = client.subscribe()
  try {
    const receipt = await client.prompt('m0-fixture', [{ type: 'text', text: 'Reply with M0_FIXTURE_OK. No tools.' }])
    const methods = new Set()
    let sawRunning = false
    let sawOutput = false
    const untilIdle = async () => {
      while (true) {
        const notification = await subscription.next()
        methods.add(notification.method)
        sawOutput ||= JSON.stringify(notification.params).includes('M0_FIXTURE_OK')
        if (notification.method === 'session.status') {
          if (notification.params.status === 'running') sawRunning = true
          if (notification.params.status === 'idle' && sawRunning) break
        }
      }
    }
    let timer
    try {
      await Promise.race([untilIdle(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fixture turn did not complete within 10s')), 10000) })])
    } finally { clearTimeout(timer) }
    if (!sawOutput || !modelRequests.length) throw new Error('No fixture output observed')
    if (modelRequests.some(r => r.toolNames.length)) throw new Error('Validation profile unexpectedly exposed tools')
    report.checks.taskExecution = { receiptReceived: Boolean(receipt), outputObserved: sawOutput, model: 'loopback fixture only' }
    report.checks.streamEvents = [...methods]
    report.checks.toolRoster = { exposed: [], requestsChecked: modelRequests.length }
  } finally { subscription.close() }
  await client.prompt('m0-running-stop', [{ type: 'text', text: 'M0 pending model request fixture.' }])
  let stopTimer
  try {
    await Promise.race([runningRequest, new Promise((_, reject) => { stopTimer = setTimeout(() => reject(new Error('Active-stop fixture did not reach model request')), 5000) })])
    report.checks.activeRequestBeforeStop = true
    if (modelRequests.some(r => r.toolNames.length)) throw new Error('Stop fixture exposed unexpected tools')
    report.checks.toolRoster.requestsChecked = modelRequests.length
  } finally { clearTimeout(stopTimer) }
} catch (error) {
  report.checks.failure = String(error.message).slice(0, 5000)
  process.exitCode = 1
} finally {
  const start = performance.now()
  try { await client.close(); report.checks.close = { confirmed: true, elapsedMs: Math.round(performance.now() - start), activeModelRequest: report.checks.activeRequestBeforeStop === true } }
  catch (error) { report.checks.close = { confirmed: false, error: String(error.message) }; process.exitCode = 1 }
  fixtureServer.closeAllConnections()
  await new Promise(resolve => fixtureServer.close(resolve))
  report.sourceRootModified = sourceStatus !== execFileSync(git, ['-C', sourceRoot, 'status', '--porcelain'], { encoding: 'utf8', windowsHide: true })
    || Object.entries(lock.artifacts).some(([name, expected]) => digest(join(sourceRoot, name)) !== expected)
  if (report.sourceRootModified) process.exitCode = 1
  // Retain isolated diagnostic artifacts for inspection; never traverse any created module symlinks.
  report.filesAtRoot = readdirSync(runRoot)
  const reportFile = join(runRoot, 'report.json')
  writeFileSync(reportFile, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ reportFile, ...report }, null, 2))
}
