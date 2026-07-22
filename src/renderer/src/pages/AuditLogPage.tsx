/**
 * AuditLogPage (TASK-070)
 *
 * 凭证使用审计页：虚拟滚动表 + CSV 导出 + 按凭证 id / action 过滤 + 清空。
 */

import { useState } from 'react'
import { AuditLogTable } from '../components/AuditLogTable'
import { useCredentialAudit } from '../hooks/useCredentialAudit'
import { useConfirm } from '../components/ConfirmDialog'
import type { CredentialAuditAction } from '../../../types/audit'

const ACTIONS: Array<CredentialAuditAction | ''> = [
  '',
  'view',
  'copy',
  'create',
  'update',
  'delete',
  'export',
  'reveal'
]

export function AuditLogPage(): JSX.Element {
  const [credId, setCredId] = useState('')
  const [action, setAction] = useState<CredentialAuditAction | ''>('')
  const [sinceDays, setSinceDays] = useState(0)
  const { items, total, loading, reload, exportCsv, clear } = useCredentialAudit()
  const confirm = useConfirm()

  const timeRange = (): { fromTs?: number } => {
    if (sinceDays <= 0) return {}
    return { fromTs: Date.now() - sinceDays * 24 * 60 * 60 * 1000 }
  }

  const applyFilter = async (): Promise<void> => {
    await reload({
      credentialId: credId || undefined,
      action: action || undefined,
      limit: 1000,
      ...timeRange()
    })
  }

  const handleExport = async (): Promise<void> => {
    const csv = await exportCsv({
      credentialId: credId || undefined,
      action: action || undefined,
      limit: 1000,
      ...timeRange()
    })
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `credential-audit-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0 }}>凭证使用审计</h2>
      <div style={{ fontSize: 13, color: '#6b7280' }}>
        共 {total} 条记录（加载中：{loading ? '是' : '否'}）
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="凭证 ID 过滤（可选）"
          value={credId}
          onChange={(e) => setCredId(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as CredentialAuditAction | '')}
          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
        >
          {ACTIONS.map((a) => (
            <option key={a || 'all'} value={a}>
              {a || '全部动作'}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          最近
          <input
            type="number"
            min={0}
            max={365}
            value={sinceDays}
            onChange={(e) => setSinceDays(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 56, padding: '4px 6px' }}
          />
          天（0=全部）
        </label>
        <button type="button" onClick={applyFilter}>
          查询
        </button>
        <button type="button" onClick={handleExport}>
          导出 CSV
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: '清空审计记录',
                message: '确认清空全部审计记录？此操作不可恢复',
                variant: 'danger',
                confirmText: '清空'
              })
              if (ok) await clear()
            })()
          }}
        >
          清空全部
        </button>
      </div>

      <AuditLogTable items={items} />
    </div>
  )
}
