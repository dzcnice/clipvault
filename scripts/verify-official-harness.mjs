import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

process.stdout.write('fixture: creating isolated directories\n')
const root = mkdtempSync(join(tmpdir(), 'clipvault-official-harness-'))
const runtime = join(root, '独立运行时'), home = join(root, 'home'), workspace = join(root, 'workspace')
for (const path of [home, workspace]) mkdirSync(path)
process.stdout.write('fixture: copying standalone runtime\n')
mkdirSync(runtime)
function copyRuntime(from, to) {
  mkdirSync(to, { recursive: true })
  for (const item of readdirSync(from, { withFileTypes: true })) {
    if (item.isDirectory()) copyRuntime(join(from, item.name), join(to, item.name))
    else copyFileSync(join(from, item.name), join(to, item.name))
  }
}
copyRuntime(resolve(process.argv[2] || 'resources/harness-runtime'), runtime)
process.stdout.write('fixture: starting loopback model\n')
const manifest = JSON.parse(readFileSync(join(runtime, 'manifest.json'), 'utf8'))
const requests = [], toolNames = new Set()
let hold = false, activeRequest
const server = createServer(async (req, res) => {
  const parts = []
  for await (const part of req) parts.push(part)
  const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
  requests.push(body)
  for (const tool of body.tools ?? []) toolNames.add(tool.function?.name ?? tool.name)
  process.stdout.write(`fixture model route: ${req.url}; tools=${JSON.stringify([...toolNames])}\n`)
  activeRequest?.()
  if (hold) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': waiting\n\n'); return }
  const events = [
    { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OFFICIAL_HARNESS_OK' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' }
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  res.end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const sessionId = 'official-standalone-fixture'
async function run(resume = false, stop = false) {
  const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.SystemRoot ? join(process.env.SystemRoot, 'System32') : '/usr/bin',
    HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TEMP: home, TMP: home, DSH_HOME: home,
    CV_BRIDGE_URL: url, CV_BRIDGE_TOKEN: 'public-synthetic-fixture-only', CV_HARNESS_TEST_DIAGNOSTICS: '1', DSH_TELEMETRY_DISABLED: '1' }
  const child = spawn(join(runtime, manifest.node), [join(runtime, 'worker.mjs')], { cwd: workspace, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const events = [], errors = []
  createInterface({ input: child.stdout }).on('line', line => events.push(JSON.parse(line)))
  child.stderr.on('data', data => errors.push(data.toString()))
  const timer = setTimeout(() => child.kill(), 40_000)
  let markActive
  const active = new Promise(resolve => { markActive = resolve })
  activeRequest = markActive
  child.stdin.write(JSON.stringify({ type: 'run', directory: workspace, home, model: 'deepseek-v4-flash', sessionId, resume, prompt: 'Reply with OFFICIAL_HARNESS_OK. No tool calls.' }) + '\n')
  if (stop) { await Promise.race([active, new Promise((_, reject) => setTimeout(() => reject(new Error('No active model request')), 30_000).unref())]); child.stdin.write('{"type":"stop"}\n') }
  const code = await new Promise(resolve => child.once('exit', resolve))
  clearTimeout(timer)
  if (code !== 0) throw new Error(`Worker exit ${code}: ${errors.join('').slice(-9000)}`)
  assert(events.some(event => event.type === (stop ? 'stopped' : 'result')))
  if (!stop) assert(events.some(event => event.type === 'result' && event.text.includes('OFFICIAL_HARNESS_OK')), JSON.stringify(events.slice(-8)))
  if (resume) assert(events.some(event => event.type === 'resumed' && event.sessionId === sessionId))
  return events.map(event => event.type)
}
try {
  const first = await run()
  const restored = await run(true)
  assert(requests[1].messages.some(message => JSON.stringify(message).includes('OFFICIAL_HARNESS_OK')), 'resume must retain prior conversation')
  hold = true
  const stopped = await run(true, true)
  const expected = ['workbench_list_files', 'workbench_read_file', 'workbench_write_file', 'workbench_check_api', 'workbench_verify_file', 'workbench_run_check'].sort()
  assert.deepEqual([...toolNames].sort(), expected)
  const report = { source: manifest.source, version: manifest.version, sourceCommit: manifest.sourceCommit, independentPath: runtime, realCredentialsUsed: false, externalModelRequests: false, first, restored, stopped, tools: expected }
  writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify({ report: join(root, 'report.json'), ...report }, null, 2) + '\n')
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
