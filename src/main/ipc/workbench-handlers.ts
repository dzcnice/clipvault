import { ipcMain, dialog, shell, clipboard, type BrowserWindow } from 'electron'
import { wrapUnlockedHandler } from './utils'
import * as store from '../../db/workbench-store'
import { getWorkbench, workbenchBusy } from '../workbench/service'
import { boundedText, parseResourceText, resourceEndpoint } from '../workbench/input'
import { endpointURL } from '../workbench/bridge'
import { getClipboardMonitor } from '../clipboard/monitor'
import { openMergeBackup } from '../backup-merge'
import { basename } from 'node:path'
import { openLoginAssistant } from '../workbench/login'
import { templates, saveTemplate, deleteTemplate, taskHandoff } from '../workbench/daily'
import type { TaskTemplate } from '../../types/workbench'
import { protectLegacyImages } from '../storage/protect-images'
import type { ModelConfig, ModelServiceInput, ProjectInput, ResourceInput } from '../../types/workbench'
import { modelServiceStatus, saveModelService, listModelOptions } from '../workbench/model-service'
import type { IntakeSource, IntakeCommit } from '../../types/resources'
import { prepareIntake, revealIntake, commitIntake } from '../resources/intake'
import { getHostManager } from '../harness-host/manager'
import { quickProject } from '../workbench/quick'
import { interceptedText } from '../clipboard/key-intercept'
import { getClipboardItemById } from '../../db/clipboard-store'
import { resourceSequence, resourceCode, copyResourceField } from '../resources/sequence'
import { outboundRedact, redactOutboundValue } from '../workbench/redaction'
import { getPrefs, setPrefs, type JarvisHints } from '../prefs'
import { ProjectFiles } from '../workbench/files'
import { listInbox, settleInbox, dismissInbox, mutedInboxRules, muteInboxRule, onInboxChanged } from '../../db/inbox-store'
import { applySuggestion } from '../clipboard/suggestions'
import { interpretClipboardQuery, prepareOrganize, organizeClipboard } from '../clipboard/ai'
import { resourceHealth } from '../resources/health'
import type { InboxKind } from '../../types/inbox'

export function registerWorkbenchHandlers(window: BrowserWindow): void {
  const service = getWorkbench()
  const off = service.onChange(() => { if (!window.isDestroyed()) window.webContents.send('workbench:changed') })
  window.once('closed', off)
  window.once('closed', onInboxChanged(() => { if (!window.isDestroyed()) window.webContents.send('inbox:changed') }))
  ipcMain.handle('workbench:call', wrapUnlockedHandler(async (_event, method: string, payload: unknown) => {
    try {
      const result = await dispatch(method, payload)
      // 预热中的 Host 带着旧的模型与项目设置：设置一变就回收，下一句按新设置启动。
      if (['saveModelService', 'saveModel', 'saveProject', 'saveResource', 'revokeResource', 'saveJarvisSettings'].includes(method)) void getHostManager().discardWarm().catch(() => {})
      if (!['snapshot', 'task', 'parseResource', 'chooseDirectory', 'quickIndex', 'inbox', 'inboxMuted', 'resourceHealth', 'recall', 'prepareOrganize', 'modelService', 'listModels', 'legacyCredentials', 'jarvisSettings'].includes(method) && !window.isDestroyed()) window.webContents.send('workbench:changed')
      return { success: true, data: result }
    } catch (error) { return { success: false, error: outboundRedact(error instanceof Error ? error.message : '操作失败，请重试').text } }
  }))
  async function dispatch(method: string, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'inbox': return listInbox()
      case 'inboxMuted': return mutedInboxRules()
      case 'muteInbox': { const input = payload as { kind: InboxKind; muted: boolean }; muteInboxRule(input.kind, input.muted === true); return true }
      case 'settleInbox': { const input = payload as { id: string; state: 'done' | 'dismissed' }; settleInbox(boundedText(input.id, '建议 ID', 100, true), input.state); return true }
      case 'dismissInbox': dismissInbox(); return true
      case 'applySuggestion': applySuggestion(boundedText(payload, '建议 ID', 100, true)); return true
      case 'resourceHealth': return resourceHealth()
      case 'recall': return interpretClipboardQuery(payload as string, request => getHostManager().structured(request))
      case 'prepareOrganize': return prepareOrganize(payload as string[])
      case 'organize': { const input = payload as { reviewId: string; ids: string[] }; return organizeClipboard(input.reviewId, input.ids, request => getHostManager().structured(request)) }
      case 'inboxStart': {
        const input = payload as { id: string; prompt: string }, suggestion = listInbox().find(item => item.id === input.id)
        if (!suggestion || suggestion.type !== 'error_fix' || !suggestion.projectId) throw new Error('这条建议无法创建项目会话')
        const text = boundedText(input.prompt, '首句', 4000, true), manager = getHostManager(), session = await manager.createSession({ projectId: suggestion.projectId, permission: 'confirm' })
        // Return the route immediately so the model-egress approval is reachable in the conversation.
        void manager.prompt(session.id, { text, mentions: suggestion.data.ids.map(id => ({ kind: 'clipboard', id })) }).then(() => settleInbox(suggestion.id, 'done')).catch(error => manager.reportPromptFailure(session.id, error))
        return session.id
      }
      case 'quickIndex': return { resources: store.listResources(), tasks: redactOutboundValue(store.listTasks()), projects: [await quickProject(), ...store.listProjects()] }
      case 'snapshot': return service.snapshot()
      case 'templates': return templates()
      case 'saveTemplate': return saveTemplate(payload as Omit<TaskTemplate, 'id'>)
      case 'deleteTemplate': deleteTemplate(boundedText(payload, '模板 ID', 100, true)); return true
      case 'handoff': { const text = taskHandoff(boundedText(payload, '任务 ID', 100, true)); getClipboardMonitor().writeText(text); return true }
      case 'mergeBackup': {
        if (workbenchBusy()) throw new Error('请先停止当前会话，再合并资料')
        if (typeof payload !== 'string' || payload.length > 1024 || payload.includes('\0')) throw new Error('备份密码格式无效')
        const password = payload
        const selected = await dialog.showOpenDialog(window, { title: '合并旧资料：源备份和当前资料都保留', properties: ['openFile'], filters: [{ name: 'ClipVault 备份', extensions: ['cvbackup', 'db'] }] })
        if (selected.canceled || !selected.filePaths[0]) return null
        const source = openMergeBackup(selected.filePaths[0], password || undefined)
        try {
          const p = source.preview
          const confirm = await dialog.showMessageBox(window, { type: 'question', title: '合并资料副本', message: `从 ${basename(selected.filePaths[0])} 合并资料`,
            detail: `剪贴板 ${p.clipboard} 条、凭证 ${p.credentials} 条、资源 ${p.resources} 条、项目 ${p.projects} 个。\n原库和当前记录都不会覆盖；重复导入会跳过，更新的源记录另存副本。模型设置与任务历史保持当前版本。${p.missingImages ? `\n${p.missingImages} 条图片记录的原图不在备份中，将保留记录并报告缺失。` : ''}\n合并前会创建当前资料的回退备份。`, buttons: ['取消', '确认合并副本'], defaultId: 0, cancelId: 0 })
          if (confirm.response !== 1) return null
          if (workbenchBusy()) throw new Error('确认期间启动了会话，请先停止再合并资料')
          return source.merge()
        } finally { source.close() }
      }
      case 'chooseDirectory': {
        const selected = await dialog.showOpenDialog(window, { title: '选择代码项目目录', properties: ['openDirectory'] })
        return selected.canceled || !selected.filePaths[0] ? null : service.validateDirectory(selected.filePaths[0])
      }
      case 'protectImages': {
        if (workbenchBusy()) throw new Error('请先停止当前会话')
        const confirm = await dialog.showMessageBox(window, { type: 'question', title: '加密当前库的旧图片', message: '先创建完整加密备份，再逐张核对并转换原图。', detail: '转换成功后，仅清理默认图片目录中本应用生成的原明文副本；自定义目录或其他外部原图保留。缺失或失败的图片会报告，不会伪造转换成功。原应用的独立资料目录不受影响。', buttons: ['取消', '确认备份并转换'], defaultId: 0, cancelId: 0 })
        return confirm.response === 1 ? protectLegacyImages() : null
      }
      case 'chooseAttachments': {
        const selected = await dialog.showOpenDialog(window, { title: '选择任务附件：文字直接预览，图片在本机识别文字', properties: ['openFile', 'multiSelections'], filters: [{ name: '文字与图片', extensions: ['txt', 'md', 'json', 'log', 'csv', 'ts', 'tsx', 'js', 'py', 'yaml', 'yml', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }] })
        return selected.canceled ? [] : service.prepareAttachments(selected.filePaths)
      }
      case 'saveProject': {
        const input = payload as ProjectInput, directory = await service.validateDirectory(input.directory)
        let packageName = ''
        try { const value = JSON.parse((await new ProjectFiles(directory).read('package.json')).content).name; if (typeof value === 'string' && value.length <= 200) packageName = value } catch { /* 非 Node 项目仍可使用 */ }
        return store.saveProject({ ...input, directory, packageName })
      }
      case 'parseResource': return parseResourceText(boundedText(payload, '资料', 100_000, true))
      case 'intake': {
        const input = payload as IntakeSource
        let text = input.text ?? ''
        if (input.promptId) text = interceptedText(input.promptId)
        if (input.clipboardId) { const item = getClipboardItemById(input.clipboardId); if (!item || item.decryptError) throw new Error('剪贴板记录不可读取'); text = item.content ?? '' }
        return prepareIntake(text, input.purpose ?? '', { sourceClipId: input.clipboardId, allowUsername: getPrefs().allowResourceUsernameAI, ...(input.useAI ? { structure: request => getHostManager().structured(request) } : {}) })
      }
      case 'revealIntake': { const input = payload as { id: string; token: string }; return revealIntake(input.id, input.token) }
      case 'saveIntake': {
        const input = payload as IntakeCommit, current = clipboard.readText()
        const { resource } = commitIntake(input)
        if (input.clearSource && resource.fields.some(field => { try { return current.includes(store.readResourceField(resource.id, field.name)) } catch { return false } })) getClipboardMonitor().writeText('')
        return resource
      }
      case 'sequence': {
        const { shortcutManager } = await import('../shortcuts/manager')
        if (!shortcutManager.list().find(item => item.commandId === 'resource.pasteNext')?.isRegistered) throw new Error('粘贴下一个字段的快捷键未注册，请在设置中解决冲突')
        const id = boundedText(payload, '资源 ID', 100, true), resource = store.getResource(id)
        if (resource.state === 'revoked' || !resource.fields.some(field => ['username', 'password', 'totp_seed'].includes(field.role ?? ''))) throw new Error('资源没有可粘贴的登录字段')
        const { hideHUD } = await import('../hud/window'); hideHUD()
        window.hide(); try { return await resourceSequence.start(id) } catch (error) { window.show(); throw error }
      }
      case 'autoType': {
        const id = boundedText(payload, '资源 ID', 100, true)
        const { hideHUD } = await import('../hud/window'); hideHUD()
        window.hide(); try { return await resourceSequence.autoType(id) } catch (error) { window.show(); throw error }
      }
      case 'resourceHistory': return store.resourceHistory(boundedText(payload, '资源 ID', 100, true))
      case 'sequenceState': return resourceSequence.state()
      case 'sequenceStop': resourceSequence.finish(); return true
      case 'resourceCode': return resourceCode(boundedText(payload, '资源 ID', 100, true))
      case 'saveResource': { const input = payload as ResourceInput; if (input.kind === 'model' || input.kind === 'api') endpointURL(input.endpoint ?? ''); return store.saveResource(input) }
      case 'revokeResource': store.revokeResource(boundedText(payload, '资源 ID', 100, true)); return true
      case 'importCredential': return store.importLegacyCredential(boundedText(payload, '凭据 ID', 100, true))
      case 'legacyCredentials': return store.pendingLegacyCredentials()
      case 'jarvisSettings': return { about: store.getAboutMe(), aboutLimit: store.ABOUT_ME_LIMIT, hints: getPrefs().jarvisHints }
      case 'saveJarvisSettings': {
        const input = payload as { about?: string; hints?: Partial<JarvisHints> }
        if (typeof input.about === 'string') store.saveAboutMe(input.about)
        if (input.hints && typeof input.hints === 'object') { const current = getPrefs().jarvisHints; setPrefs({ jarvisHints: { error: input.hints.error ?? current.error, image: input.hints.image ?? current.image, credential: input.hints.credential ?? current.credential, translate: input.hints.translate ?? current.translate } }) }
        return { about: store.getAboutMe(), aboutLimit: store.ABOUT_ME_LIMIT, hints: getPrefs().jarvisHints }
      }
      case 'importAllCredentials': return store.importAllLegacyCredentials()
      case 'copyField': {
        const input = payload as { id: string; field: string; version: number }
        copyResourceField(input.id, input.field, input.version)
        return true
      }
      case 'openResource': {
        const resource = store.getResource(boundedText(payload, '资源 ID', 100, true))
        if (resource.state === 'revoked' || !(resource.loginUrl || resource.endpoint)) throw new Error('资源已撤销或没有登录地址')
        await shell.openExternal(resourceEndpoint(resource.loginUrl || resource.endpoint))
        store.markResourceUsed(resource.id)
        return true
      }
      case 'login': return openLoginAssistant(boundedText(payload, '资源 ID', 100, true))
      case 'modelService': return modelServiceStatus()
      case 'saveModelService': return saveModelService(payload as ModelServiceInput)
      case 'listModels': return listModelOptions(payload as { endpoint: string; protocol: unknown; apiKey?: string })
      case 'saveModel': {
        const input = payload as ModelConfig
        endpointURL(input.endpoint)
        if (input.resourceId && endpointURL(store.getResource(input.resourceId).endpoint).href !== endpointURL(input.endpoint).href) throw new Error('模型地址必须与所选模型资源的地址一致')
        return store.saveModelConfig(input)
      }
      case 'task': return redactOutboundValue(store.getTaskDetail(boundedText(payload, '任务 ID', 100, true)))
      case 'createTask': case 'followUp': case 'start': case 'stop': case 'accept': case 'approve': throw new Error('3.4 历史任务仅供查看，请在新会话中继续工作')
      default: throw new Error('未知工作台操作')
    }
  }
}
