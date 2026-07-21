// @vitest-environment jsdom
/**
 * WorkspaceContext · v3.0 个人本地版（固定 personal）
 */

import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext'

function ProbePanel(): JSX.Element {
  const { ctx, setCtx, teamInfo, hasTeam, initialized, refreshTeam } =
    useWorkspace()
  return (
    <div>
      <span data-testid="ctx">{ctx}</span>
      <span data-testid="has-team">{hasTeam ? 'yes' : 'no'}</span>
      <span data-testid="initialized">{initialized ? 'yes' : 'no'}</span>
      <span data-testid="team-name">{teamInfo?.name ?? 'null'}</span>
      <button type="button" onClick={() => setCtx('team')} data-testid="go-team">
        team
      </button>
      <button
        type="button"
        onClick={() => void refreshTeam()}
        data-testid="refresh"
      >
        refresh
      </button>
    </div>
  )
}

describe('WorkspaceProvider · personal-only', () => {
  it('始终 personal，hasTeam=false', () => {
    render(
      <WorkspaceProvider>
        <ProbePanel />
      </WorkspaceProvider>
    )
    expect(screen.getByTestId('ctx').textContent).toBe('personal')
    expect(screen.getByTestId('has-team').textContent).toBe('no')
    expect(screen.getByTestId('initialized').textContent).toBe('yes')
    expect(screen.getByTestId('team-name').textContent).toBe('null')
  })

  it('setCtx(team) 被忽略', async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceProvider>
        <ProbePanel />
      </WorkspaceProvider>
    )
    await user.click(screen.getByTestId('go-team'))
    expect(screen.getByTestId('ctx').textContent).toBe('personal')
  })

  it('refreshTeam 为 no-op', async () => {
    render(
      <WorkspaceProvider>
        <ProbePanel />
      </WorkspaceProvider>
    )
    await act(async () => {
      screen.getByTestId('refresh').click()
    })
    expect(screen.getByTestId('has-team').textContent).toBe('no')
  })
})
