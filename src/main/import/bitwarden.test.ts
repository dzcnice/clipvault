/**
 * Bitwarden JSON 导入单元测试
 */
import { describe, it, expect } from 'vitest'
import { parseBitwardenJson } from './bitwarden'

describe('parseBitwardenJson', () => {
  it('login / note / card 三类映射', () => {
    const data = {
      encrypted: false,
      folders: [{ id: 'f1', name: 'Personal' }],
      items: [
        {
          name: 'GitHub',
          type: 1,
          folderId: 'f1',
          login: {
            username: 'alice',
            password: 'secret',
            uris: [{ uri: 'https://github.com' }]
          }
        },
        { name: 'Note', type: 2, notes: 'hello', folderId: null },
        {
          name: 'Visa',
          type: 3,
          card: {
            cardholderName: 'ALICE',
            number: '4111111111111111',
            brand: 'visa',
            code: '123'
          }
        }
      ]
    }
    const r = parseBitwardenJson(JSON.stringify(data))
    expect(r.source).toBe('bitwarden')
    expect(r.items).toHaveLength(3)
    expect(r.items[0]?.type).toBe('password')
    expect(r.items[0]?.tags).toEqual(expect.arrayContaining(['bitwarden', 'Personal']))
    expect(r.items[1]?.type).toBe('text')
    expect(r.items[2]?.value).toBe('4111111111111111')
  })

  it('encrypted=true 抛错', () => {
    expect(() =>
      parseBitwardenJson(JSON.stringify({ encrypted: true, items: [] }))
    ).toThrow(/加密导出/)
  })

  it('unknown type 被跳过并 warning', () => {
    const data = {
      encrypted: false,
      items: [{ name: 'X', type: 99 }]
    }
    const r = parseBitwardenJson(JSON.stringify(data))
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.warnings.length).toBe(1)
  })
})
