import { listResources, readResourceField, resourceHistory } from '../../db/workbench-store'
import { addInbox } from '../../db/inbox-store'
import { evaluateStrength } from '../health/checker'
import { duplicateSecretResources } from './secret-index'
import type { ResourceHealth } from '../../types/inbox'

export function resourceHealth(publish = false): ResourceHealth[] {
  return listResources().filter(resource => resource.state !== 'revoked').map(resource => {
    const issues: ResourceHealth['issues'] = []
    const history = resourceHistory(resource.id), changed = Math.max(resource.createdAt, ...history.map(field => field.createdAt))
    if (resource.rotateAfterDays && changed + (resource.rotateAfterDays - 7) * 86400000 <= Date.now()) issues.push({ kind: 'rotate', text: '已进入轮换提醒期，请更新账号或密钥' })
    for (const field of resource.fields.filter(field => field.role === 'password')) {
      const value = readResourceField(resource.id, field.name)
      if (evaluateStrength(value.slice(0, 256)).score < 3) issues.push({ kind: 'weak_password', text: `${field.name} 的密码强度偏弱` })
      if (duplicateSecretResources([value]).some(id => id !== resource.id)) issues.push({ kind: 'duplicate_secret', text: `${field.name} 在其他资源中也被使用` })
    }
    if (publish) for (const issue of issues) addInbox({ type: issue.kind, sourceId: `resource:${resource.id}:${issue.kind}:${resource.version}`, projectId: resource.projectId, data: { title: `${resource.name} · ${issue.text}`, reason: '仅在本机检查，未发送密码值', ids: [], resourceIds: [resource.id], action: 'resource' } })
    return { resourceId: resource.id, issues }
  })
}
