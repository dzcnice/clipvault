/**
 * RecoveryPage (TASK-071)
 *
 * 组合 RecoveryPhraseSetup + RecoveryPhraseVerify 的独立页面。
 */

import { useState } from 'react'
import { RecoveryPhraseSetup } from '../components/RecoveryPhraseSetup'
import { RecoveryPhraseVerify } from '../components/RecoveryPhraseVerify'

type Stage = 'setup' | 'verify' | 'done'

export function RecoveryPage(): JSX.Element {
  const [stage, setStage] = useState<Stage>('setup')
  const [mnemonic, setMnemonic] = useState<string[]>([])

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 960,
        margin: '0 auto'
      }}
    >
      <h2 style={{ margin: 0 }}>恢复短语（BIP39 · 24 词）</h2>

      {stage === 'setup' && (
        <RecoveryPhraseSetup
          onComplete={(ws) => {
            setMnemonic(ws)
            setStage('verify')
          }}
        />
      )}

      {stage === 'verify' && mnemonic.length === 24 && (
        <RecoveryPhraseVerify
          mnemonic={mnemonic}
          onAllPassed={() => setStage('done')}
        />
      )}

      {stage === 'done' && (
        <div
          style={{
            padding: 16,
            border: '1px solid #10b981',
            borderRadius: 8,
            color: '#065f46'
          }}
        >
          三重验证全部通过。恢复短语已启用，忘记主密码时可用于重置。
        </div>
      )}
    </div>
  )
}
