import { describe, expect, it, vi } from 'vitest'
import { assessHarnessExecution, requireHarnessExecution, validateHarnessIdentity, type HarnessIdentity } from './validation-gate'

const identity: HarnessIdentity = { sourceRevision: 'fixture-revision', sdkVersion: 'fixture-version', runtimeVersion: 'fixture-version', profileSha256: 'fixture-profile-hash' }

describe('M0 validation gate', () => {
  it.each(['sourceRevision', 'sdkVersion', 'runtimeVersion', 'profileSha256'] as const)('rejects mismatching %s', field => {
    expect(() => validateHarnessIdentity(identity, { ...identity, [field]: 'different' })).toThrow('不匹配')
  })
  it('cannot accept a matching manifest that mixes SDK/runtime versions', () => {
    const mixed = { ...identity, runtimeVersion: 'another-version' }
    expect(() => validateHarnessIdentity(mixed, mixed)).toThrow('同版')
  })
  it('does not execute a task merely because initialize and streaming work', () => {
    const execute = vi.fn()
    const evidence = { initialized: true, artifactsVerified: true }
    expect(() => { requireHarnessExecution(evidence); execute() }).toThrow('审批拒绝')
    expect(execute).not.toHaveBeenCalled()
    expect(assessHarnessExecution(evidence)).toEqual({ enabled: false, blockers: ['审批拒绝与过期回答', '持久会话恢复', '单任务取消', '受管进程树退出', '凭据代理与执行边界', '独立安装运行'] })
  })
})
