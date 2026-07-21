// @vitest-environment jsdom
/**
 * σ1 · P2-R3：JsonPreview 大 JSON 截断 + memo 化
 *
 * 验证：
 *   - 正常 JSON 字符串正确解析并渲染树
 *   - 超过 200KB 的 JSON 走纯文本降级分支（不调用 JSON.parse）
 *   - 极深嵌套（> MAX_NODE_DEPTH）节点显示占位符 [...]
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { JsonPreview } from './JsonPreview'

describe('JsonPreview', () => {
  it('普通 JSON 字符串解析为树形视图', () => {
    const { container } = render(<JsonPreview text='{"a":1,"b":"hi"}' />)
    // 数字与字符串都应出现（注意字符串会用 JSON.stringify 带双引号）
    expect(container.textContent).toContain('1')
    expect(container.textContent).toContain('hi')
  })

  it('超长 JSON（>200KB）走纯文本截断分支，不调用 JSON.parse', () => {
    const spy = vi.spyOn(JSON, 'parse')
    const big = '"' + 'x'.repeat(250_000) + '"' // 超长字符串 JSON
    const { container } = render(<JsonPreview text={big} />)
    expect(spy).not.toHaveBeenCalled()
    expect(container.textContent).toContain('JSON 过长')
    expect(container.textContent).toContain('已截断')
    spy.mockRestore()
  })

  it('解析失败显示错误信息', () => {
    const { container } = render(<JsonPreview text="not valid json" />)
    expect(container.textContent).toContain('JSON 解析失败')
  })

  it('极深嵌套对象到达最大深度后显示 [...] 占位', () => {
    // 生成 15 层嵌套 { a: { a: { ... } } }
    let deep: unknown = { leaf: 'end' }
    for (let i = 0; i < 15; i++) deep = { a: deep }
    const { container } = render(
      <JsonPreview value={deep} defaultCollapsed={false} />
    )
    // 应包含占位符 [...]
    expect(container.textContent).toContain('[...]')
    // 末端 leaf 不应被渲染（深度被截断）
    expect(container.textContent).not.toContain('end')
  })

  it('直接传 value 对象时也能正确渲染', () => {
    const { container } = render(
      <JsonPreview value={{ name: 'foo', count: 42 }} defaultCollapsed={false} />
    )
    expect(container.textContent).toContain('foo')
    expect(container.textContent).toContain('42')
  })
})
