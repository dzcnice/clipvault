/**
 * ClipClearToast (TASK-068)
 *
 * 复制敏感凭证后右下角浮窗：
 *   - 圆环倒计时 + 剩余秒数
 *   - "立即清空" / "取消清理" 按钮
 *
 * 仅依赖 useClipClearToast hook，集成方在 App.tsx 的根布局挂载本组件即可。
 */

import { useMemo } from 'react'
import { useClipClearToast } from '../hooks/useClipClearToast'

const SIZE = 44
const STROKE = 4
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ClipClearToast(): JSX.Element | null {
  const { visible, remainingMs, ttlMs, cancel, flushNow } = useClipClearToast()

  const seconds = Math.ceil(remainingMs / 1000)
  const progress = useMemo(() => {
    if (ttlMs <= 0) return 0
    return Math.max(0, Math.min(1, remainingMs / ttlMs))
  }, [remainingMs, ttlMs])

  if (!visible) return null

  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        padding: '10px 14px',
        borderRadius: 12,
        background: 'var(--cv-surface, rgba(28,28,32,0.92))',
        color: 'var(--cv-text, #f5f5f7)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 240,
        backdropFilter: 'blur(12px)',
        fontSize: 13
      }}
    >
      <svg width={SIZE} height={SIZE} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={STROKE}
          fill="none"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="var(--cv-accent, #4ade80)"
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fill="currentColor"
        >
          {seconds}
        </text>
      </svg>
      <div style={{ flex: 1, lineHeight: 1.35 }}>
        <div style={{ fontWeight: 600 }}>剪贴板将自动清空</div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          {seconds}s 后清除敏感内容
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          type="button"
          onClick={flushNow}
          style={{
            background: 'var(--cv-accent, #4ade80)',
            color: '#0b0b0c',
            border: 'none',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          立即清空
        </button>
        <button
          type="button"
          onClick={cancel}
          style={{
            background: 'transparent',
            color: 'inherit',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          取消
        </button>
      </div>
    </div>
  )
}

export default ClipClearToast
