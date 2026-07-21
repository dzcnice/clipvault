/**
 * Chrome CSV 导入单元测试
 */
import { describe, it, expect } from 'vitest'
import { parseChromeCsv } from './chrome'

describe('parseChromeCsv', () => {
  it('解析 Chrome 标准导出', () => {
    const csv = [
      'name,url,username,password,note',
      'GitHub,https://github.com,alice,secret123,',
      'Reddit,https://reddit.com,bob,pw,hello'
    ].join('\n')
    const r = parseChromeCsv(csv)
    expect(r.source).toBe('chrome')
    expect(r.items).toHaveLength(2)
    expect(r.items[0]?.name).toBe('GitHub')
    expect(r.items[0]?.value).toBe('secret123')
    expect(r.items[0]?.metadata?.username).toBe('alice')
    expect(r.items[0]?.tags).toContain('chrome')
  })

  it('空密码+空用户名跳过', () => {
    const csv = 'name,url,username,password,note\nEmpty,https://e.com,,,'
    const r = parseChromeCsv(csv)
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('处理引号内逗号', () => {
    const csv =
      'name,url,username,password,note\n"Comma, here",u,n,p,"note, with comma"'
    const r = parseChromeCsv(csv)
    expect(r.items[0]?.name).toBe('Comma, here')
    expect(r.items[0]?.metadata?.note).toBe('note, with comma')
  })
})
