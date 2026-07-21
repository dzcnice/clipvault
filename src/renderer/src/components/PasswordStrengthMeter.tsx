/**
 * PasswordStrengthMeter (Sprint 11 · TASK-058)
 *
 * 同步 zxcvbn 评估 + 4 级彩条。UI 侧 debounce 150ms 避免频繁评估。
 */

import React, { useEffect, useRef, useState } from 'react'

interface Sprint11PasswordAPI {
  evaluateStrength: (
    value: string
  ) => Promise<{
    success: boolean
    data?: { score: number; feedback: string[] }
  }>
}

function getApi(): Sprint11PasswordAPI | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint11?: { password?: Sprint11PasswordAPI } }
    }
  ).api
  return api?.sprint11?.password ?? null
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']
const LABELS = ['极弱', '弱', '中等', '强', '极强']

export interface PasswordStrengthMeterProps {
  value: string
  className?: string
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  value,
  className
}) => {
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScore(0)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedback([])
      return
    }
    timerRef.current = setTimeout(async () => {
      const api = getApi()
      if (!api) return
      const r = await api.evaluateStrength(value)
      if (r.data) {
        setScore(r.data.score)
        setFeedback(r.data.feedback)
      }
    }, 150)
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value])

  const bars = [0, 1, 2, 3]
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {bars.map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: i < score ? COLORS[score] : 'rgba(0,0,0,0.1)'
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: COLORS[score] }}>{LABELS[score]}</div>
      {feedback.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#666' }}>
          {feedback.slice(0, 3).map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PasswordStrengthMeter
