// @vitest-environment jsdom
/**
 * CodePreview 轻量高亮单测
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CodePreview } from './CodePreview'

describe('CodePreview', () => {
  it('渲染行号与代码', () => {
    render(<CodePreview code={'const x = 1\n// hi'} language="ts" />)
    expect(screen.getByText('ts')).toBeInTheDocument()
    expect(screen.getByText('const')).toBeInTheDocument()
    expect(screen.getByText('// hi')).toBeInTheDocument()
  })

  it('超过 maxLines 显示截断', () => {
    const code = Array.from({ length: 5 }, (_, i) => `line${i}`).join('\n')
    render(<CodePreview code={code} maxLines={2} />)
    expect(screen.getByText(/已截断/)).toBeInTheDocument()
  })
})
