/** M0 接入关口。没有证据的能力一律保持关闭；当前没有连接任何执行 IPC。 */
export interface HarnessIdentity {
  sourceRevision: string
  sdkVersion: string
  runtimeVersion: string
  profileSha256: string
}

export interface HarnessEvidence {
  initialized: boolean
  artifactsVerified: boolean
  approvals: boolean
  durableResume: boolean
  turnCancellation: boolean
  processTreeExit: boolean
  credentialBoundary: boolean
  standaloneDistribution: boolean
}

export function validateHarnessIdentity(expected: HarnessIdentity, actual: HarnessIdentity): void {
  for (const field of ['sourceRevision', 'sdkVersion', 'runtimeVersion', 'profileSha256'] as const) {
    if (!expected[field] || expected[field] !== actual[field]) throw new Error(`Harness ${field} 不匹配`)
  }
  if (actual.sdkVersion !== actual.runtimeVersion) throw new Error('Harness SDK 与 runtime 必须同版')
}

export function assessHarnessExecution(evidence: Partial<HarnessEvidence>): { enabled: boolean; blockers: string[] } {
  const labels: Record<keyof HarnessEvidence, string> = {
    initialized: '启动握手',
    artifactsVerified: '运行时产物校验',
    approvals: '审批拒绝与过期回答',
    durableResume: '持久会话恢复',
    turnCancellation: '单任务取消',
    processTreeExit: '受管进程树退出',
    credentialBoundary: '凭据代理与执行边界',
    standaloneDistribution: '独立安装运行'
  }
  const blockers = (Object.keys(labels) as Array<keyof HarnessEvidence>)
    .filter(key => evidence[key] !== true).map(key => labels[key])
  return { enabled: blockers.length === 0, blockers }
}

export function requireHarnessExecution(evidence: Partial<HarnessEvidence>): void {
  const result = assessHarnessExecution(evidence)
  if (!result.enabled) throw new Error(`Harness 执行未开放：${result.blockers.join('、')}`)
}
