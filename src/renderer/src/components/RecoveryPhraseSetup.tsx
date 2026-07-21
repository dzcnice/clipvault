/**
 * RecoveryPhraseSetup (TASK-071)
 *
 * 首次启用：调用 setup() → 展示 24 词 → 用户确认抄录 → 下一步到 Verify
 *
 * ρ2 · P0-R4 修复：
 *   旧版用 `words/busy` 两个扁平状态，无法区分"未生成 / 生成中 / 生成失败 / 已生成"。
 *   用户多次点击"立即生成"会反复调 setup，每次主进程会覆盖 hash，旧短语作废。
 *   新版用代数数据类型（PhraseState）替代；按钮在非 idle/error/saved 状态均 disable；
 *   同时显式区分 IPC 失败（setup 返回空）的 error 分支。
 */

import { useState } from 'react'
import { useRecovery } from '../hooks/useRecovery'

interface Props {
  onComplete?: (words: string[]) => void
}

type PhraseState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; phrase: string[] }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

export function RecoveryPhraseSetup({ onComplete }: Props): JSX.Element {
  const { setup, status } = useRecovery()
  const [state, setState] = useState<PhraseState>({ kind: 'idle' })
  const [confirmed, setConfirmed] = useState(false)

  const handleGenerate = async (): Promise<void> => {
    // 防御：已 saved 时禁止再次覆盖；已 generating 时禁止并发点击
    if (state.kind === 'generating' || state.kind === 'saved') return
    setState({ kind: 'generating' })
    try {
      const ws = await setup()
      if (ws.length === 0) {
        setState({
          kind: 'error',
          message: '生成失败：后端未返回短语，请检查 Vault 是否已解锁或稍后重试'
        })
        return
      }
      setState({ kind: 'ready', phrase: ws })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const handleContinue = (): void => {
    if (state.kind !== 'ready') return
    const phrase = state.phrase
    // 标记为 saved：按钮永久 disable，避免反复覆盖 hash
    setState({ kind: 'saved' })
    onComplete?.(phrase)
  }

  const isBusy = state.kind === 'generating'
  const isSaved = state.kind === 'saved'
  const showError = state.kind === 'error'

  // 已注册的用户进入本页：提供"重新生成"入口（会覆盖旧短语，注意按钮加警告文案）
  if (status?.enrolled && state.kind === 'idle') {
    return (
      <div
        style={{
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          color: '#374151'
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>已注册恢复短语</div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isBusy || isSaved}
        >
          重新生成（会覆盖旧短语）
        </button>
      </div>
    )
  }

  if (state.kind === 'idle' || state.kind === 'generating' || state.kind === 'error') {
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
        <div style={{ fontWeight: 600 }}>生成 24 词恢复短语</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          短语仅显示一次，请按顺序妥善抄录并离线保存。系统仅保存其哈希。
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isBusy}
        >
          {isBusy ? '生成中…' : state.kind === 'error' ? '重试生成' : '立即生成'}
        </button>
        {showError ? (
          <div
            role="alert"
            style={{
              padding: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 4,
              fontSize: 13
            }}
          >
            {state.message}
          </div>
        ) : null}
      </div>
    )
  }

  // ready 或 saved：展示 24 词 + 继续按钮
  const phrase = state.kind === 'ready' ? state.phrase : []
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
      <div style={{ fontWeight: 600 }}>请按顺序抄录以下 24 个词</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8
        }}
      >
        {phrase.map((w, i) => (
          <div
            key={i}
            style={{
              padding: '6px 8px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              fontFamily: 'monospace'
            }}
          >
            <span style={{ color: '#9ca3af', marginRight: 4 }}>{i + 1}.</span>
            {w}
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={isSaved}
        />
        我已离线抄录并确认保管妥当
      </label>
      <button
        type="button"
        disabled={!confirmed || isSaved}
        onClick={handleContinue}
      >
        {isSaved ? '已保存' : '下一步：三重验证'}
      </button>
    </div>
  )
}
