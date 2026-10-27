// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { WorkbenchSnapshot } from '@/types/workbench'
import WorkbenchPage from './WorkbenchPage'
import ResourcesPage from './ResourcesPage'
import { ConfirmDialogProvider } from '../components/ConfirmDialog'

const snapshot: WorkbenchSnapshot = { projects: [], resources: [], tasks: [], model: { resourceId: null, field: 'key', endpoint: 'https://api.deepseek.com/anthropic', model: 'fixture', maxRequests: 20, maxMinutes: 10 }, harness: { available: true, version: '0.2.1-rc.2', sourceCommit: 'fixture', message: '官方 DeepSeek Harness 已就绪', activeTaskId: null, terminalEnabled: false, approvals: [] } }
const api = { snapshot: vi.fn(), onChanged: vi.fn(() => () => {}), createTask: vi.fn(), parseResource: vi.fn(), saveResource: vi.fn(), copyField: vi.fn(), task: vi.fn(), followUp: vi.fn(), openResource: vi.fn(), modelService: vi.fn(), saveModelService: vi.fn(), listModels: vi.fn() }
beforeEach(() => { vi.clearAllMocks(); api.snapshot.mockResolvedValue({ success: true, data: structuredClone(snapshot) }); api.modelService.mockResolvedValue({ success: true, data: { configured: false, keyConfigured: false, endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: '', maxRequests: 30, maxMinutes: 20 } }); Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } }) })
const renderPage = (page: JSX.Element) => render(<MemoryRouter><ConfirmDialogProvider>{page}</ConfirmDialogProvider></MemoryRouter>)
describe('workbench product interactions', () => {
  it('shows the empty workflow and keeps execution disabled until a project exists', async () => {
    renderPage(<WorkbenchPage />)
    expect(screen.getByRole('status')).toHaveTextContent('正在读取')
    expect(await screen.findByText('添加一个项目')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存任务草稿/ })).toBeDisabled()
    expect(screen.getByText('本机检查未就绪')).toBeInTheDocument()
  })
  it('exposes an explicit failure state with retry rather than an empty success screen', async () => {
    api.snapshot.mockResolvedValue({ success: false, error: '测试连接失败' })
    renderPage(<WorkbenchPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('测试连接失败')
    await userEvent.click(screen.getByRole('button', { name: '刷新工作台' }))
    expect(api.snapshot).toHaveBeenCalledTimes(2)
  })
  it('copies only a field reference from resource cards and surfaces revocation errors', async () => {
    const data = structuredClone(snapshot)
    data.resources = [{ id: 'resource', name: '项目账号', kind: 'account', projectId: null, environment: 'dev', purpose: '测试', endpoint: '', state: 'saved', version: 3,
      fields: [{ name: 'password', secret: true, version: 3, configured: true }], createdAt: 1, updatedAt: 1, legacyCredentialId: null }]
    api.snapshot.mockResolvedValue({ success: true, data }); api.copyField.mockResolvedValue({ success: false, error: '该资源已撤销' })
    render(<MemoryRouter initialEntries={['/resources/resource']}><ConfirmDialogProvider><Routes><Route path="/resources/:id" element={<ResourcesPage />} /></Routes></ConfirmDialogProvider></MemoryRouter>)
    const copy = await screen.findByRole('button', { name: '复制 项目账号 的 password' })
    await userEvent.click(copy)
    expect(api.copyField).toHaveBeenCalledWith('resource', 'password', 3)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('该资源已撤销'))
    expect(screen.getByText('••••••••')).toBeInTheDocument()
  })
  it('saves structured account intake and carries only the resource reference into a task', async () => {
    const user = userEvent.setup(), data = structuredClone(snapshot)
    data.projects = [{ id: 'project', name: '示例项目', directory: 'C:\\fixture', description: '', environment: 'dev', archived: false, createdAt: 1, updatedAt: 1 }]
    const resource = { id: 'new-resource', name: '后台', kind: 'account' as const, projectId: 'project', environment: 'dev', purpose: '检查登录', endpoint: '', state: 'saved' as const, version: 1, fields: [{ name: 'password', secret: true, version: 1, configured: true }], createdAt: 1, updatedAt: 1, legacyCredentialId: null }
    api.snapshot.mockImplementation(async () => ({ success: true, data: structuredClone(data) }))
    api.parseResource.mockResolvedValue({ success: true, data: { fields: [{ name: 'password', secret: true, value: 'LOCAL-INTAKE-CANARY' }], endpoint: '', warnings: [], suggested: { name: '后台', purpose: '检查登录', kind: 'account' } } })
    api.saveResource.mockImplementation(async () => { data.resources.push(resource); return { success: true, data: resource } })
    renderPage(<WorkbenchPage />)
    await user.click(await screen.findByRole('button', { name: '保存账号或密钥' }))
    await user.type(screen.getByLabelText('粘贴账号资料（只在本地整理）'), '密码：LOCAL-INTAKE-CANARY')
    await user.click(screen.getByRole('button', { name: '整理字段' }))
    await waitFor(() => expect(screen.getByLabelText('名称')).toHaveValue('后台'))
    expect(screen.getByLabelText('字段 1 内容')).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: '保存并带入任务' }))
    expect(await screen.findByLabelText('任务目标')).toHaveValue('检查登录')
    expect(await screen.findByRole('checkbox', { name: /后台/ })).toBeChecked()
    expect(api.createTask).not.toHaveBeenCalled()
    await user.click(screen.getByLabelText('任务目标')); await user.tab()
    expect(screen.getByLabelText('验收标准')).toHaveFocus()
  })
  it('adds instructions and selected clipboard snapshots to the same task with a revision check', async () => {
    const user = userEvent.setup(), data = structuredClone(snapshot)
    const task = { id: 'task', projectId: 'project', title: '原任务', prompt: '原目标', acceptance: '', environment: 'dev', directory: 'C:\\fixture', resourceIds: [], context: [], state: 'waiting' as const, createdAt: 1, updatedAt: 1, activeRunId: 'run', revision: 1, updates: [] }
    data.tasks = [task]
    api.snapshot.mockResolvedValue({ success: true, data })
    api.task.mockResolvedValue({ success: true, data: { task, runs: [], events: [], changes: [] } })
    api.followUp.mockResolvedValue({ success: true, data: { ...task, state: 'draft', revision: 2 } })
    render(<MemoryRouter initialEntries={[{ pathname: '/workbench', state: { taskId: 'task', clipboardIds: ['clip-1'] } }]}><ConfirmDialogProvider><WorkbenchPage /></ConfirmDialogProvider></MemoryRouter>)
    await user.type(await screen.findByLabelText('补充要求或新的报错'), '补上空输入测试')
    await user.click(screen.getByRole('button', { name: '保存补充' }))
    expect(api.followUp).toHaveBeenCalledWith({ taskId: 'task', prompt: '补上空输入测试', clipboardIds: ['clip-1'], attachmentIds: [], resourceIds: [], expectedRevision: 1 })
    expect(api.createTask).not.toHaveBeenCalled()
  })
  it('does not silently drop a selected resource from a different environment', async () => {
    const data = structuredClone(snapshot)
    data.projects = [{ id: 'project', name: '测试项目', directory: 'C:\\fixture', description: '', environment: 'dev', archived: false, createdAt: 1, updatedAt: 1 }]
    data.resources = [{ id: 'production-key', name: '生产接口', kind: 'api', projectId: null, environment: 'prod', purpose: '', endpoint: 'https://api.fixture', state: 'saved', version: 1, fields: [], createdAt: 1, updatedAt: 1, legacyCredentialId: null }]
    api.snapshot.mockResolvedValue({ success: true, data })
    render(<MemoryRouter initialEntries={[{ pathname: '/workbench', state: { resourceId: 'production-key' } }]}><ConfirmDialogProvider><WorkbenchPage /></ConfirmDialogProvider></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('任务目标'), '检查接口')
    expect(screen.getByRole('alert')).toHaveTextContent('环境不匹配')
    expect(screen.getByRole('button', { name: /保存任务草稿/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '移除不匹配的关联' }))
    expect(screen.getByRole('button', { name: /保存任务草稿/ })).toBeEnabled()
  })
})
