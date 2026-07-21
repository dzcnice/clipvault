/**
 * RecoveryPhraseVerify (TASK-071)
 *
 * 三重验证：sequence / pick / fill。三种模式都通过 `verify` 提交 24 词，
 * 服务端统一由 scrypt hash 比对最终判定。
 */

import { useEffect, useRef, useState } from 'react'
import { useRecovery } from '../hooks/useRecovery'
import type {
  RecoveryVerifyChallenge,
  RecoveryVerifyMode
} from '../../../types/recovery'

interface Props {
  mnemonic: string[]
  onAllPassed?: () => void
}

const MODES: RecoveryVerifyMode[] = ['sequence', 'pick', 'fill']

export function RecoveryPhraseVerify({
  mnemonic,
  onAllPassed
}: Props): JSX.Element {
  const { challenge, verify } = useRecovery()
  const [modeIdx, setModeIdx] = useState(0)
  const [chal, setChal] = useState<RecoveryVerifyChallenge | null>(null)
  const [input, setInput] = useState<string[]>(Array(24).fill(''))
  const [picked, setPicked] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [passed, setPassed] = useState<boolean[]>([false, false, false])
  // ρ3 · P2-2：持有 setTimeout id，unmount 时 clear 避免切到下一关后迟到 fire
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentMode = MODES[modeIdx] as RecoveryVerifyMode

  // ρ3：unmount 时清 timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setInput(Array(24).fill(''))
      setPicked([])
      setMsg(null)
      const c = await challenge(mnemonic, currentMode)
      setChal(c)
    })()
  }, [currentMode, mnemonic, challenge])

  const handleSubmit = async (): Promise<void> => {
    let words: string[] = []
    if (currentMode === 'sequence') {
      words = input.map((w) => w.trim().toLowerCase())
    } else if (currentMode === 'pick') {
      words = picked.slice()
    } else {
      const masked = chal?.masked ?? []
      const blanks = chal?.blanks ?? []
      words = masked.map((w, i) => {
        const idx = blanks.indexOf(i)
        return idx >= 0 ? (input[i] ?? '').trim().toLowerCase() : w
      })
    }
    const ok = await verify({ mode: currentMode, words })
    if (ok) {
      setMsg(`第 ${modeIdx + 1} 关通过`)
      const next = [...passed]
      next[modeIdx] = true
      setPassed(next)
      if (modeIdx < 2) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setModeIdx(modeIdx + 1), 500)
      } else if (next.every(Boolean)) {
        onAllPassed?.()
      }
    } else {
      setMsg('校验失败，请重试')
    }
  }

  return (
    <div
      style={{
        padding: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <div style={{ fontWeight: 600 }}>
        三重验证 · 第 {modeIdx + 1} / 3 关（{currentMode}）
      </div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        进度：{passed.map((p, i) => `${i + 1}${p ? '✓' : '·'}`).join(' ')}
      </div>

      {currentMode === 'sequence' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8
          }}
        >
          {input.map((v, i) => (
            <input
              key={i}
              value={v}
              onChange={(e) => {
                const next = [...input]
                next[i] = e.target.value
                setInput(next)
              }}
              placeholder={`#${i + 1}`}
              style={{
                padding: '6px 8px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontFamily: 'monospace'
              }}
            />
          ))}
        </div>
      )}

      {currentMode === 'pick' && chal?.pool && (
        <>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            从 48 词池按正确顺序点选 24 词（已选 {picked.length} / 24）
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              padding: 8,
              minHeight: 40,
              border: '1px dashed #d1d5db',
              borderRadius: 4
            }}
          >
            {picked.map((w, i) => (
              <span
                key={`${w}-${i}`}
                onClick={() =>
                  setPicked(picked.filter((_, idx) => idx !== i))
                }
                style={{
                  padding: '2px 8px',
                  background: '#e0e7ff',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                {i + 1}. {w}
              </span>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 6
            }}
          >
            {chal.pool.map((w, i) => {
              const used = picked.includes(w)
              return (
                <button
                  key={`${w}-${i}`}
                  type="button"
                  disabled={used}
                  onClick={() => setPicked([...picked, w])}
                  style={{
                    padding: '4px 6px',
                    fontFamily: 'monospace',
                    opacity: used ? 0.4 : 1
                  }}
                >
                  {w}
                </button>
              )
            })}
          </div>
        </>
      )}

      {currentMode === 'fill' && chal?.masked && chal?.blanks && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8
          }}
        >
          {chal.masked.map((w, i) => {
            if (chal.blanks?.includes(i)) {
              return (
                <input
                  key={i}
                  value={input[i] ?? ''}
                  onChange={(e) => {
                    const next = [...input]
                    next[i] = e.target.value
                    setInput(next)
                  }}
                  placeholder={`#${i + 1} 填空`}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #fbbf24',
                    borderRadius: 4,
                    fontFamily: 'monospace'
                  }}
                />
              )
            }
            return (
              <div
                key={i}
                style={{
                  padding: '6px 8px',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  color: '#9ca3af'
                }}
              >
                {i + 1}. {w}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSubmit}>
          提交本关
        </button>
        {msg && <div style={{ fontSize: 12, color: '#374151' }}>{msg}</div>}
      </div>
    </div>
  )
}
