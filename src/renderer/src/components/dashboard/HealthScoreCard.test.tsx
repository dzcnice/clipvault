// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HealthScoreCard } from './HealthScoreCard'
import type { HealthReport } from '../../../../types/health'

function report(summary: HealthReport['summary'], total = 5): HealthReport {
  return {
    generatedAt: Date.now(),
    totalCredentials: total,
    scannedCredentials: total,
    issues: [],
    summary
  }
}

const emptySummary: HealthReport['summary'] = {
  weak_password: 0,
  reused_password: 0,
  pwned: 0,
  stale_unused: 0
}

describe('HealthScoreCard', () => {
  it('全 0 问题时走紧凑空态，不渲染四类徽章', () => {
    render(
      <MemoryRouter>
        <HealthScoreCard state="ready" report={report(emptySummary)} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('health-score-compact')).toBeInTheDocument()
    expect(screen.getByText('箱子很干净')).toBeInTheDocument()
    expect(screen.queryByText('弱密码')).not.toBeInTheDocument()
    expect(screen.queryByText('长期未用')).not.toBeInTheDocument()
  })

  it('有问题时展示徽章', () => {
    render(
      <MemoryRouter>
        <HealthScoreCard
          state="ready"
          report={report({ ...emptySummary, weak_password: 2 })}
        />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('health-score-compact')).not.toBeInTheDocument()
    expect(screen.getByText('弱密码')).toBeInTheDocument()
  })
})
