/**
 * HealthReportPage (Sprint 11 · TASK-059)
 */

import React from 'react'
import { HealthReportCard } from '../components/HealthReportCard'
import { useHealthReport } from '../hooks/useHealthReport'

const severityLabel = (s: 'low' | 'medium' | 'high'): string =>
  s === 'high' ? '高' : s === 'medium' ? '中' : '低'

const severityColor = (s: 'low' | 'medium' | 'high'): string =>
  s === 'high' ? '#ef4444' : s === 'medium' ? '#eab308' : '#6b7280'

export const HealthReportPage: React.FC = () => {
  const { state, report, error, refresh } = useHealthReport(true)

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>凭证健康检查</h2>
      <HealthReportCard />

      {state === 'ready' && report && (
        <div
          style={{
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 8,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: 12,
              background: 'rgba(0,0,0,0.03)',
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <strong>全部问题（{report.issues.length}）</strong>
            <button
              type="button"
              onClick={() => void refresh(true)}
              style={{ cursor: 'pointer' }}
            >
              强制刷新
            </button>
          </div>
          {report.issues.length === 0 ? (
            <div style={{ padding: 16, color: '#10b981' }}>
              乖乖，所有凭证都很健康喵～
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13
              }}
            >
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>凭证</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>类型</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>严重度</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>说明</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((i, idx) => (
                  <tr
                    key={idx}
                    style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}
                  >
                    <td style={{ padding: 8 }}>{i.credentialName}</td>
                    <td style={{ padding: 8 }}>{i.type}</td>
                    <td
                      style={{
                        padding: 8,
                        color: severityColor(i.severity),
                        fontWeight: 600
                      }}
                    >
                      {severityLabel(i.severity)}
                    </td>
                    <td style={{ padding: 8 }}>{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {state === 'error' && (
        <div style={{ color: '#ef4444' }}>错误：{error}</div>
      )}
    </div>
  )
}

export default HealthReportPage
