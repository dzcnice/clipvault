import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import { readEncryptedSession, sessionRecords } from '../../db/harness-session-store'
import type { HostSessionSummary, SessionSearchResult } from '../../types/session'
import { isUnlocked, onVaultLocked } from '../crypto/vault'
import { boundedText } from '../workbench/input'
import { outboundRedact, redactOutboundValue } from '../workbench/redaction'
import { getWorkbench } from '../workbench/service'
import { verifyRuntime, workerEnvironment } from '../workbench/runtime'

let pending: Promise<SessionSearchResult> | undefined
export function searchHistory(input: string): Promise<SessionSearchResult> {
  if (pending) return Promise.reject(new Error('正在建立本机索引，请稍后再搜索'))
  pending = run(input).finally(() => { pending = undefined })
  return pending
}
async function run(input: string): Promise<SessionSearchResult> {
  if (!isUnlocked()) throw new Error('请先解锁资料库')
  const query = boundedText(input, '搜索句', 300, true), runtime = getWorkbench().runtimeRoot, manifest = await verifyRuntime(runtime)
  if (!isUnlocked()) throw new Error('资料库已锁定')
  const records = sessionRecords<HostSessionSummary>(), documents: unknown[] = []
  let bytes = 0
  for (const record of records.slice(0, 200)) {
    const document = readEncryptedSession(record.id)
    if (!document) continue
    const safe = redactOutboundValue(document), size = Buffer.byteLength(JSON.stringify(safe))
    if (size + bytes > 24_000_000) continue
    bytes += size; documents.push(safe)
  }
  const payload = JSON.stringify({ query: outboundRedact(query).text, documents })
  return new Promise((resolve, reject) => {
    const child = spawn(join(runtime, manifest.node), [join(runtime, 'history-worker.mjs')], { cwd: runtime, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: workerEnvironment(app.getPath('temp'), '', '') })
    let output = '', settled = false
    const off = onVaultLocked(() => finish(new Error('资料库已锁定')))
    const timer = setTimeout(() => finish(new Error('历史索引超时，请缩小历史范围后重试')), 20_000)
    function finish(error?: Error): void {
      if (settled) return
      settled = true; clearTimeout(timer); off()
      if (child.exitCode === null) child.kill()
      if (error) { reject(error); return }
      try {
        if (!isUnlocked()) throw new Error('资料库已锁定')
        const response = JSON.parse(output) as { items?: Array<{ id: string; snippet: string; seq: number }>; error?: string }
        if (!Array.isArray(response.items) || response.error) throw new Error('历史索引暂不可用')
        const items = response.items.filter(item => records.some(record => record.id === item.id)).map(item => ({ ...item, title: outboundRedact(records.find(record => record.id === item.id)!.title).text, snippet: outboundRedact(item.snippet).text }))
        resolve({ items, searched: documents.length, total: records.length })
      } catch { reject(new Error('历史索引暂不可用，原会话记录未改变')) }
    }
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; if (output.length > 1_000_000) finish(new Error('历史搜索结果过大')) })
    child.stderr.resume(); child.stdin.on('error', () => finish(new Error('历史索引连接中断')))
    child.once('error', () => finish(new Error('历史索引启动失败')))
    child.once('exit', code => finish(code === 0 ? undefined : new Error('历史索引暂不可用')))
    child.stdin.end(payload)
  })
}
