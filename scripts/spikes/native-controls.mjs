// V1 fallback / V2 / V3 / V4. Synthetic data, loopback only, no user profile.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { setTimeout as delay } from 'node:timers/promises'

const root = mkdtempSync(join(tmpdir(), 'clipvault-native-spike-'))
const home = join(root, 'home'), workspace = join(root, 'workspace')
mkdirSync(home); mkdirSync(workspace)
const runtimeRoot = resolve('resources/harness-runtime')
const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'manifest.json'), 'utf8'))
const runtime = join(root, 'spike-runtime.mjs')
const compactRequest = join(root, 'compact-request.json'), compactResult = join(root, 'compact-result.json')
// The fixture policy asks before the real official ask_user_question tool executes.
writeFileSync(runtime, `import { ctx } from ${JSON.stringify(pathToFileURL(join(runtimeRoot, 'runtime.mjs')).href)};
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
ctx.on('tools/pre-execute', async (exec, next) => exec.name === 'ask_user_question' ? { kind: 'ask', reason: 'Synthetic approval gate' } : next());
let compactStarted = false;
const compactTimer = setInterval(async () => {
  if (compactStarted || !existsSync(${JSON.stringify(compactRequest)})) return;
  compactStarted = true;
  try {
    const { sessionId } = JSON.parse(readFileSync(${JSON.stringify(compactRequest)}, 'utf8'));
    const agent = ctx.agents.get(sessionId);
    const result = await ctx.compaction.compactNow(agent, AbortSignal.timeout(15000));
    await ctx.sessions.flush(agent.session);
    writeFileSync(${JSON.stringify(compactResult)}, JSON.stringify(result));
  } catch(error) { writeFileSync(${JSON.stringify(compactResult)}, JSON.stringify({error: error.message})); }
}, 50);
ctx.on('dispose', () => clearInterval(compactTimer));
`)
const sessionId = 'native-synthetic-session', token = 'synthetic-capability-not-a-key'
let document, mode = 'TEXT', approvalCalls = 0, questionCalls = 0, modelCalls = 0, poll, cancelStarted
const requests = [], notifications = []
function sse(res, blocks) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = event => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  send({ type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'deepseek-v4-flash', content: [], usage: { input_tokens: 10, output_tokens: 0 } } })
  blocks.forEach((block, index) => {
    send({ type: 'content_block_start', index, content_block: block.type === 'text' ? { type: 'text', text: '' } : { type: 'tool_use', id: 'call-' + modelCalls, name: block.name, input: {} } })
    send({ type: 'content_block_delta', index, delta: block.type === 'text' ? { type: 'text_delta', text: block.text } : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    send({ type: 'content_block_stop', index })
  })
  send({ type: 'message_delta', delta: { stop_reason: blocks[0].type === 'tool_use' ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } })
  send({ type: 'message_stop' }); res.end()
}
const server = createServer(async (req, res) => {
  try {
    assert.equal(String(req.headers.authorization ?? req.headers['x-api-key']).replace(/^Bearer /, ''), token)
    const parts = []; for await (const part of req) parts.push(part)
    const body = JSON.parse(Buffer.concat(parts).toString())
    const json = value => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (req.url === '/session') {
      assert.equal(body.id, sessionId)
      if (body.operation === 'list') { json([sessionId]); return }
      if (body.operation === 'create') { assert(!document); document = { header: body.header, events: [] } }
      if (body.operation === 'append') { assert.equal(body.cursor, document.events.length); document.events.push(...body.events) }
      json(body.operation === 'read' ? document ?? null : { count: document?.events.length ?? 0 }); return
    }
    if (req.url.startsWith('/control/')) {
      assert.equal(body.sessionId, sessionId)
      if (req.url.endsWith('/policy')) { json({ planMode: false }); return }
      if (req.url.endsWith('/approval')) { approvalCalls++; json({ decision: mode === 'DENY' ? 'deny' : 'allow' }); return }
      if (req.url.endsWith('/question')) { questionCalls++; json({ answers: body.questions.map(q => ({ id: q.id, selected: ['synthetic-choice'] })) }); return }
      if (req.url.endsWith('/stream')) { json({ received: true }); return }
      poll = json
      const timer = setTimeout(() => { if (poll === json) poll = undefined; if (!res.destroyed) json({ type: 'idle' }) }, 30_000)
      res.on('close', () => { clearTimeout(timer); if (poll === json) poll = undefined })
      return
    }
    assert.equal(req.url, '/model/v1/messages'); requests.push(body); modelCalls++
    if (mode === 'CANCEL') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': synthetic wait\n\n'); cancelStarted?.(); return }
    const last = body.messages.at(-1)
    const hasResult = last?.content?.some?.(b => b.type === 'tool_result')
    if (['DENY', 'ANSWER'].includes(mode) && !hasResult) sse(res, [{ type: 'tool_use', name: 'ask_user_question', input: { questions: [{ id: 'choice', question: 'Synthetic choice?', options: [{ label: 'synthetic-choice' }] }] } }])
    else sse(res, [{ type: 'text', text: mode === 'COMPACT' ? 'COMPACT_SYNTHETIC_SUMMARY' : 'NATIVE_SYNTHETIC_OK' }])
  } catch (error) { res.writeHead(500).end('Synthetic fixture failed'); process.stderr.write(error.message + '\n') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TEMP: home, TMP: home,
  DSH_HOME: home, CV_BRIDGE_URL: url, CV_BRIDGE_TOKEN: token, CV_SESSION_ID: sessionId, CV_HARNESS_NATIVE: '1', DO_NOT_TRACK: '1', OTEL_SDK_DISABLED: 'true' }
const client = new HarnessClient({ dshBin: runtime, processCwd: workspace, dshHome: home, env, initializeTimeoutMs: 30_000 })
const subscription = client.subscribe()
void (async () => { try { for await (const item of subscription) notifications.push(item) } catch {} })()
async function turn(label) {
  const ends = document?.events.filter(e => e.type === 'turn/end').length ?? 0
  await client.prompt(sessionId, [{ type: 'text', text: label }])
  await client.request('session/wait', { sessionId }, 30_000)
  for (let i = 0; i < 200 && (document?.events.filter(e => e.type === 'turn/end').length ?? 0) <= ends; i++) await delay(10)
  assert(document.events.filter(e => e.type === 'turn/end').length > ends, 'turn end must reach durable storage')
}
try {
  client.start()
  await client.initialize({ cwd: workspace, provider: 'deepseek-official', model: 'deepseek-v4-flash', maxTokens: 8192 })
  mode = 'DENY'; await turn('Deny official tool')
  assert.equal(approvalCalls, 1); assert.equal(questionCalls, 0, 'denied official tool must not execute')
  assert(document.events.some(e => e.type === 'approval/decided' && e.data.outcome === 'rejected'))
  process.stdout.write('V2 PASS: official tool rejected before body, session continued\n')
  mode = 'ANSWER'; await turn('Answer official question')
  assert.equal(questionCalls, 1)
  assert(requests.some(r => JSON.stringify(r.messages).includes('synthetic-choice')))
  process.stdout.write('V3 PASS: official question answer returned to agent\n')
  mode = 'CANCEL'
  const active = new Promise(resolve => { cancelStarted = resolve })
  const stopped = turn('Cancel current turn')
  await active
  assert(poll, 'control poll must be waiting'); poll({ type: 'cancel' }); poll = undefined
  await stopped
  const cancelled = document.events.filter(e => e.type === 'turn/end').at(-1)
  assert.equal(cancelled.data.reason.kind, 'aborted')
  mode = 'TEXT'; await turn('Continue after cancel')
  process.stdout.write('V4 PASS: cancelled turn, same process accepted next prompt\n')
  mode = 'COMPACT'
  writeFileSync(compactRequest, JSON.stringify({ sessionId }))
  for (let i = 0; i < 400 && !existsSync(compactResult); i++) await delay(50)
  const compacted = JSON.parse(readFileSync(compactResult, 'utf8'))
  assert.equal(compacted.error, undefined); assert.deepEqual(compacted.summary, [{ type: 'text', text: 'COMPACT_SYNTHETIC_SUMMARY' }])
  assert(document.events.some(event => event.type === 'compaction/summary'))
  assert(document.events.some(event => event.type === 'user/message' && JSON.stringify(event).includes('Deny official tool')), 'compaction must preserve original durable events')
  process.stdout.write('COMPACTION PASS: official summary + surface replacement, original events preserved\n')
  mode = 'TEXT'
  await client.close()
  // Prove the production worker drives the pinned independent Node, including resume and multiple prompts.
  const worker = spawn(join(runtimeRoot, manifest.node), [join(runtimeRoot, 'host-worker.mjs')], { env, cwd: workspace, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let counter = 0; const pending = new Map()
  createInterface({ input: worker.stdout }).on('line', line => { const msg = JSON.parse(line); if (msg.type === 'response') { const item = pending.get(msg.id); pending.delete(msg.id); if (msg.error) item?.reject(new Error(msg.error)); else item?.resolve(msg.result) } })
  worker.stderr.resume()
  const rpc = value => new Promise((resolve, reject) => { const id = ++counter; const timer = setTimeout(() => reject(new Error('Worker timed out')), 30_000); pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r) }, reject: e => { clearTimeout(timer); reject(e) } }); worker.stdin.write(JSON.stringify({ ...value, id }) + '\n') })
  try {
    await rpc({ type: 'initialize', directory: workspace, home, model: 'deepseek-v4-flash' })
    await rpc({ method: 'session/resume', params: { sessionId } })
    for (const text of ['worker turn one', 'worker turn two']) {
      await rpc({ method: 'session/prompt', params: { sessionId, contentBlocks: [{ type: 'text', text }] } })
      await rpc({ method: 'session/wait', params: { sessionId } })
    }
    assert(JSON.stringify(requests.at(-1)).includes('COMPACT_SYNTHETIC_SUMMARY'), 'fresh Host must replay the compaction checkpoint')
    const exited = new Promise(resolve => worker.once('exit', resolve))
    worker.stdin.write('{"type":"close"}\n'); assert.equal(await exited, 0)
  } finally { if (worker.exitCode === null) worker.kill() }
  process.stdout.write('V1 FALLBACK PASS: bundled worker, independent Node, resume + two turns\n')
  const report = { V1: 'worker fallback passed; SDK hardcodes process.execPath', V2: 'passed', V3: 'passed', V4: 'passed', compaction: 'passed; original events preserved and checkpoint resumed', modelCalls, approvalCalls, questionCalls, eventCount: document.events.length, notifications: notifications.length, realCredentialsUsed: false, externalNetwork: false }
  writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify({ report: join(root, 'report.json'), ...report }) + '\n')
} finally { subscription.close(); await client.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
