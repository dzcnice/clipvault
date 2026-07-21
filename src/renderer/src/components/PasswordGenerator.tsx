/**
 * PasswordGenerator (Sprint 11 · TASK-058)
 *
 * 三 tab：strong / passphrase / pin。
 */

import React, { useState } from 'react'
import { usePasswordGenerator } from '../hooks/usePasswordGenerator'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

type Tab = 'strong' | 'passphrase' | 'pin'

export interface PasswordGeneratorProps {
  onGenerated?: (value: string) => void
  className?: string
}

export const PasswordGenerator: React.FC<PasswordGeneratorProps> = ({
  onGenerated,
  className
}) => {
  const [tab, setTab] = useState<Tab>('strong')
  const { value, loading, error, strong, passphrase, pin } =
    usePasswordGenerator()

  // strong options
  const [length, setLength] = useState(20)
  const [includeLower, setIncludeLower] = useState(true)
  const [includeUpper, setIncludeUpper] = useState(true)
  const [includeDigits, setIncludeDigits] = useState(true)
  const [includeSymbols, setIncludeSymbols] = useState(true)
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false)

  // passphrase options
  const [wordCount, setWordCount] = useState(4)
  const [separator, setSeparator] = useState('-')
  const [capitalize, setCapitalize] = useState(true)
  const [includeNumber, setIncludeNumber] = useState(true)
  const [language, setLanguage] = useState<'en' | 'zh'>('en')

  // pin
  const [pinLength, setPinLength] = useState(6)

  const generate = async (): Promise<void> => {
    let v = ''
    if (tab === 'strong') {
      v = await strong({
        length,
        includeLower,
        includeUpper,
        includeDigits,
        includeSymbols,
        excludeAmbiguous
      })
    } else if (tab === 'passphrase') {
      v = await passphrase({
        wordCount,
        separator,
        capitalize,
        includeNumber,
        language
      })
    } else {
      v = await pin(pinLength)
    }
    if (v && onGenerated) onGenerated(v)
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? '#3b82f6' : 'rgba(0,0,0,0.15)',
    background: active ? '#3b82f6' : 'transparent',
    color: active ? 'white' : 'inherit',
    cursor: 'pointer'
  })

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={tabBtnStyle(tab === 'strong')} onClick={() => setTab('strong')}>
          强密码
        </button>
        <button type="button" style={tabBtnStyle(tab === 'passphrase')} onClick={() => setTab('passphrase')}>
          口令短语
        </button>
        <button type="button" style={tabBtnStyle(tab === 'pin')} onClick={() => setTab('pin')}>
          PIN
        </button>
      </div>

      {tab === 'strong' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label>
            长度：{length}
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              style={{ marginLeft: 8, width: 200 }}
            />
          </label>
          <label>
            <input type="checkbox" checked={includeLower} onChange={(e) => setIncludeLower(e.target.checked)} /> 小写
          </label>
          <label>
            <input type="checkbox" checked={includeUpper} onChange={(e) => setIncludeUpper(e.target.checked)} /> 大写
          </label>
          <label>
            <input type="checkbox" checked={includeDigits} onChange={(e) => setIncludeDigits(e.target.checked)} /> 数字
          </label>
          <label>
            <input type="checkbox" checked={includeSymbols} onChange={(e) => setIncludeSymbols(e.target.checked)} /> 符号
          </label>
          <label>
            <input
              type="checkbox"
              checked={excludeAmbiguous}
              onChange={(e) => setExcludeAmbiguous(e.target.checked)}
            />{' '}
            排除易混淆字符
          </label>
        </div>
      )}

      {tab === 'passphrase' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label>
            词数：
            <input
              type="number"
              min={2}
              max={20}
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          <label>
            分隔符：
            <input
              type="text"
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              maxLength={3}
              style={{ width: 60 }}
            />
          </label>
          <label>
            语言：
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'zh')}
            >
              <option value="en">英文</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={capitalize} onChange={(e) => setCapitalize(e.target.checked)} /> 首字母大写
          </label>
          <label>
            <input type="checkbox" checked={includeNumber} onChange={(e) => setIncludeNumber(e.target.checked)} /> 插入数字
          </label>
        </div>
      )}

      {tab === 'pin' && (
        <div>
          <label>
            PIN 长度：
            <input
              type="number"
              min={4}
              max={8}
              value={pinLength}
              onChange={(e) => setPinLength(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: 'none',
          background: '#3b82f6',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        {loading ? '生成中...' : '生成'}
      </button>

      {error && <div style={{ color: '#ef4444' }}>错误：{error}</div>}

      {value && (
        <div>
          <div
            style={{
              padding: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: 6,
              wordBreak: 'break-all'
            }}
          >
            {value}
          </div>
          <PasswordStrengthMeter value={value} />
        </div>
      )}
    </div>
  )
}

export default PasswordGenerator
