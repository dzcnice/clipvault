/**
 * TOTPRing (Sprint 11 · TASK-057)
 *
 * SVG 圆环 + 6/8 位 OTP + 倒计时。走 useTOTP hook。
 */

import React from 'react'
import { useTOTP } from '../hooks/useTOTP'

export interface TOTPRingProps {
  credentialId: string
  size?: number
  strokeWidth?: number
  className?: string
}

export const TOTPRing: React.FC<TOTPRingProps> = ({
  credentialId,
  size = 96,
  strokeWidth = 6,
  className
}) => {
  const { code, remainingMs, periodMs, error } = useTOTP(credentialId)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = periodMs > 0 ? remainingMs / periodMs : 0
  const dashOffset = circumference * (1 - ratio)

  const lowTime = remainingMs < 5000

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={lowTime ? '#ef4444' : '#10b981'}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontWeight: 600,
            fontSize: size / (code.length > 6 ? 5 : 4),
            letterSpacing: 1
          }}
          aria-label="TOTP code"
        >
          {code || '------'}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: lowTime ? '#ef4444' : 'inherit'
        }}
      >
        {error ? `错误：${error}` : `${Math.ceil(remainingMs / 1000)}s`}
      </div>
    </div>
  )
}

export default TOTPRing
