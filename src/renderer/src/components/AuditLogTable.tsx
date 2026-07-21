/**
 * AuditLogTable (TASK-070)
 *
 * 虚拟滚动的审计日志表：仅渲染可视区域行，避免大量记录卡顿。
 * 实现方式：监听容器 scrollTop → 计算 startIndex / endIndex。
 */

import { useMemo, useRef, useState } from 'react'
import type { CredentialAuditEntry } from '../../../types/audit'

interface Props {
  items: CredentialAuditEntry[]
  rowHeight?: number
  height?: number
}

const DEFAULT_ROW_HEIGHT = 36

export function AuditLogTable({
  items,
  rowHeight = DEFAULT_ROW_HEIGHT,
  height = 480
}: Props): JSX.Element {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const overscan = 6
    const visibleCount = Math.ceil(height / rowHeight)
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(items.length, start + visibleCount + overscan * 2)
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * rowHeight
    }
  }, [scrollTop, height, rowHeight, items.length])

  const visible = items.slice(startIndex, endIndex)
  const totalHeight = items.length * rowHeight

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      role="table"
      aria-label="凭证审计日志"
      style={{
        height,
        overflow: 'auto',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        position: 'relative',
        fontSize: 13
      }}
    >
      <div
        role="row"
        style={{
          position: 'sticky',
          top: 0,
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: '180px 90px 1fr 140px 1fr',
          padding: '6px 8px',
          fontWeight: 600,
          zIndex: 1
        }}
      >
        <div>时间</div>
        <div>动作</div>
        <div>凭证</div>
        <div>操作者</div>
        <div>元信息</div>
      </div>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visible.map((e) => (
            <div
              role="row"
              key={e.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 90px 1fr 140px 1fr',
                padding: '6px 8px',
                borderBottom: '1px solid #f3f4f6',
                height: rowHeight,
                alignItems: 'center'
              }}
            >
              <div>{new Date(e.timestamp).toLocaleString()}</div>
              <div>{e.action}</div>
              <div
                title={e.credentialId}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {e.credentialName ?? e.credentialId}
              </div>
              <div>{e.actor}</div>
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: '#6b7280'
                }}
              >
                {e.metadata ?? ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      {items.length === 0 && (
        <div style={{ padding: 16, color: '#6b7280' }}>暂无审计记录</div>
      )}
    </div>
  )
}
