import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let harness, running = false, stopping = false
const send = data => process.stdout.write(`${JSON.stringify(data)}\n`)
async function stop() {
  stopping = true
  try { await harness?.close(); send({ type: 'stopped' }); process.exit(0) }
  catch { send({ type: 'stop-error', message: '运行时退出尚未确认' }); process.exitCode = 1 }
}
createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', async line => {
  try {
    if (line.length > 2_000_000) throw new Error('请求过长')
    const request = JSON.parse(line)
    if (request.type === 'stop') { await stop(); return }
    if (request.type !== 'run' || running || stopping) throw new Error('运行状态无效')
    running = true
    harness = new DeepSeekHarness({
      dshBin: join(dirname(fileURLToPath(import.meta.url)), 'runtime.mjs'),
      profile: 'clipvault-workbench', cwd: request.directory, processCwd: request.directory,
      dshHome: request.home, provider: 'deepseek-official', model: request.model, maxTokens: 8192,
      initializeTimeoutMs: 30_000, env: process.env, shutdownTimeoutMs: 3000
    })
    await harness.start()
    send({ type: 'ready', sessionId: request.sessionId })
    const session = request.resume ? await harness.resumeSession(request.sessionId) : harness.session(request.sessionId)
    if (request.resume) send({ type: 'resumed', sessionId: request.sessionId })
    let failed = false
    const result = await session.run(request.prompt, { onNotification: notification => {
      const event = notification.params?.event
      if (event?.type === 'turn/error' || (event?.type === 'turn/end' && ['error', 'aborted', 'failed'].includes(event.data?.reason?.kind))) failed = true
      send({ type: 'notification', notification })
    } })
    await harness.close()
    if (failed) throw new Error('HarnessTurnFailed')
    if (!stopping) send({ type: 'result', sessionId: result.sessionId, text: result.finalResponse })
    process.exit(0)
  } catch (error) {
    if (stopping) return
    // No raw SDK stderr / arguments in ordinary application logs.
    send({ type: 'error', message: error instanceof Error ? error.name : 'HarnessError' })
    if (process.env.CV_HARNESS_TEST_DIAGNOSTICS === '1') process.stderr.write(String(error.stack ?? error))
    try { await harness?.close() } finally { process.exit(1) }
  }
})
process.stdin.on('end', stop)
process.on('SIGTERM', stop)
