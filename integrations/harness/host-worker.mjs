// SDK runs under the pinned standalone Node because it launches with process.execPath.
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let client, subscription, started = false, closing = false
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n')
async function close() {
  if (closing) return
  closing = true
  subscription?.close()
  try { await client?.close(); send({ type: 'closed' }); process.exit(0) }
  catch { send({ type: 'error', message: '运行时关闭失败' }); process.exit(1) }
}
createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', async (line) => {
  let id
  try {
    if (line.length > 2_000_000) throw new Error('请求过长')
    const request = JSON.parse(line)
    id = request.id
    if (request.type === 'close') { await close(); return }
    if (closing) throw new Error('运行时正在关闭')
    if (request.type === 'initialize') {
      if (started) throw new Error('运行时已经初始化')
      started = true
      client = new HarnessClient({ dshBin: join(dirname(fileURLToPath(import.meta.url)), 'runtime.mjs'),
        profile: 'clipvault-native', processCwd: request.directory, dshHome: request.home,
        env: process.env, initializeTimeoutMs: 30_000, shutdownTimeoutMs: 2000 })
      client.start()
      subscription = client.subscribe()
      void (async () => {
        try { for await (const notification of subscription) send({ type: 'notification', notification }) }
        catch { if (!closing) send({ type: 'error', message: '运行时连接已中断' }) }
      })()
      const result = await client.initialize({ cwd: request.directory, provider: 'deepseek-official', model: request.model, maxTokens: 8192 })
      send({ type: 'response', id, result })
      return
    }
    if (!client) throw new Error('运行时尚未就绪')
    const allowed = new Set(['session/prompt', 'session/resume', 'session/wait', 'session/working-directory/get'])
    if (!allowed.has(request.method) || request.params?.sessionId !== process.env.CV_SESSION_ID) throw new Error('会话请求越界')
    send({ type: 'response', id, result: await client.request(request.method, request.params) })
  } catch { send({ type: 'response', id, error: 'Harness 请求失败，请检查会话状态' }) }
})
process.stdin.on('end', close)
process.on('SIGTERM', close)
