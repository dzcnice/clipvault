// @vitest-environment jsdom
/**
 * WorkspaceContext · v3.0 个人本地版（固定 personal）
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext'

function ProbePanel(): JSX.Element {
  const { ctx, initialized } = useWorkspace()
  return (
    <div>
      <span data-testid="ctx">{ctx}</span>
      <span data-testid="initialized">{initialized ? 'yes' : 'no'}</span>
    </div>
  )
}

describe('WorkspaceProvider · personal-only', () => {
  it('始终 personal', () => {
    render(
      <WorkspaceProvider>
        <ProbePanel />
      </WorkspaceProvider>
    )
    expect(screen.getByTestId('ctx').textContent).toBe('personal')
    expect(screen.getByTestId('initialized').textContent).toBe('yes')
  })
})
