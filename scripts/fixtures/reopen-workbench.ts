import { app } from 'electron'
import { resolve } from 'node:path'
import { initDatabase, closeDatabase } from '../../src/db/connection'
import * as vault from '../../src/main/crypto/vault'
import * as store from '../../src/db/workbench-store'
import { WorkbenchService } from '../../src/main/workbench/service'
import { readEncryptedSession } from '../../src/main/workbench/session-store'

const profile = resolve(process.argv[2] ?? '')
if (!/[\\/]clipvault-workbench-preview-live-[^\\/]+[\\/]profile$/.test(profile)) throw new Error('Only the dedicated live acceptance profile can be reopened')
app.setPath('userData', profile)
app.setName('ClipVault Workbench Preview')
void app.whenReady().then(async () => {
  let passed = false, sameSession = false, resumedReply = false
  const service = new WorkbenchService()
  try {
    initDatabase()
    const opened = vault.ensureVaultOpen()
    if (!opened.ok) throw new Error('Profile cannot be reopened')
    const model = store.getModelConfig()
    const taskId = process.argv[3], sessionId = process.argv[4]
    if (!model.resourceId || !store.readResourceField(model.resourceId, model.field) || !taskId || !sessionId || !readEncryptedSession(sessionId)) throw new Error('Encrypted session unavailable')
    service.onChange(() => {
      for (const approval of service.approvals.list()) service.approvals.respond(approval.id, approval.fingerprint, approval.operation === '恢复任务并连接模型' && approval.target === model.endpoint)
    })
    const task = store.getTask(taskId)
    await service.followUp({ taskId, expectedRevision: task.revision ?? 1, prompt: '本次是应用重启后的会话恢复验收。之前文件修改和两项测试已经完成，本次禁止修改文件、运行命令和调用工具。仅用一行回复 RESTART_OK，并说明你记得之前将 enabled 改为了 true。' })
    await service.start(taskId, true)
    const deadline = Date.now() + 120000
    while (service.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
    if (service.busy) await service.stop(taskId)
    const detail = store.getTaskDetail(taskId), run = detail.runs.at(-1)!
    sameSession = run.sessionId === sessionId && !!run.resumedFrom
    resumedReply = detail.events.some(event => event.runId === run.id && event.text.includes('RESTART_OK'))
    passed = sameSession && resumedReply && detail.task.state === 'waiting'
  } catch { passed = false }
  finally { await service.shutdown(); vault.lockVault(); closeDatabase() }
  process.stdout.write(`REOPEN_REPORT:${JSON.stringify({ passed, profile, actualSeparateProcess: true, sameSession, resumedReply })}\n`)
  app.quit()
})
