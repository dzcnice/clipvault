import { describe, it, expect } from 'vitest'
import { expandSnippetVariables } from './snippet-vars'

describe('expandSnippetVariables', () => {
  it('expands date time year', () => {
    const now = new Date('2026-07-21T08:05:09')
    const out = expandSnippetVariables('d={date} t={time} y={year}', { now })
    expect(out).toContain('2026-07-21')
    expect(out).toContain('08:05:09')
    expect(out).toContain('2026')
  })

  it('expands clip', () => {
    expect(expandSnippetVariables('x={clip}', { clip: 'hello' })).toBe('x=hello')
  })
})
