/**
 * 1Password 导入单元测试（裸 JSON 路径）
 */
import { describe, it, expect } from 'vitest'
import { parseOnepassword } from './onepassword'

describe('parseOnepassword', () => {
  it('裸 JSON（非压缩） LOGIN 映射', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              attrs: { name: 'Personal' },
              items: [
                {
                  uuid: 'u1',
                  categoryUuid: '001',
                  overview: {
                    title: 'GitHub',
                    url: 'https://github.com',
                    tags: ['dev']
                  },
                  details: {
                    loginFields: [
                      { designation: 'username', value: 'alice' },
                      { designation: 'password', value: 's3cret' }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.source).toBe('onepassword')
    expect(r.items).toHaveLength(1)
    expect(r.items[0]?.value).toBe('s3cret')
    expect(r.items[0]?.metadata?.username).toBe('alice')
    expect(r.items[0]?.tags).toEqual(
      expect.arrayContaining(['1password', 'dev', 'vault:Personal'])
    )
  })

  it('trashed 被跳过', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  trashed: true,
                  categoryUuid: '001',
                  overview: { title: 'X' }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toBe(1)
  })

  it('SECURE_NOTE 映射', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  categoryUuid: '003',
                  overview: { title: 'My Note' },
                  details: { notesPlain: 'hello world' }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.items[0]?.type).toBe('text')
    expect(r.items[0]?.value).toBe('hello world')
  })

  it('非 JSON 非 base64 抛错', () => {
    expect(() => parseOnepassword('not-json-nor-base64')).toThrow()
  })

  it('CREDIT_CARD 使用 cardNumber 字段名（1Password 扩展导出常见）', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  uuid: 'c1',
                  categoryUuid: '002',
                  overview: { title: 'My Visa' },
                  details: {
                    sections: [
                      {
                        fields: [
                          { id: 'cardNumber', value: { string: '4111111111111111' } },
                          { id: 'cvv', value: { concealed: '123' } }
                        ]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.items).toHaveLength(1)
    expect(r.items[0]?.value).toBe('4111111111111111')
    expect(r.items[0]?.tags).toEqual(expect.arrayContaining(['card']))
  })

  it('CREDIT_CARD 使用 cc-number 字段名也能识别', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  categoryUuid: '002',
                  overview: { title: 'Other' },
                  details: {
                    sections: [
                      {
                        fields: [{ id: 'cc-number', value: { string: '5555555555554444' } }]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.items[0]?.value).toBe('5555555555554444')
  })

  it('IDENTITY (categoryUuid=004) 被映射为 text 条目', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  categoryUuid: '004',
                  overview: { title: 'Alice', subtitle: 'Alice Wonderland' },
                  details: {
                    notesPlain: 'personal profile',
                    sections: [
                      {
                        title: 'address',
                        fields: [
                          { id: 'street', value: { string: '1 Rabbit Hole' } },
                          { id: 'city', value: { string: 'Wonderland' } }
                        ]
                      },
                      {
                        title: 'contact',
                        fields: [
                          { id: 'phone', value: { string: '+1-555-0100' } },
                          { id: 'email', value: { email: 'alice@wonder.land' } }
                        ]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.skipped).toBe(0)
    expect(r.items).toHaveLength(1)
    const it0 = r.items[0]!
    expect(it0.type).toBe('text')
    expect(it0.name).toBe('Alice')
    expect(it0.value).toBe('Alice Wonderland')
    expect(it0.tags).toEqual(expect.arrayContaining(['identity', '1password']))
    const customFields = it0.metadata?.customFields as Record<string, unknown>
    expect(customFields['address.street']).toBe('1 Rabbit Hole')
    expect(customFields['address.city']).toBe('Wonderland')
    expect(customFields['contact.phone']).toBe('+1-555-0100')
    expect(customFields['contact.email']).toBe('alice@wonder.land')
  })

  it('IDENTITY 使用字符串 category "IDENTITY" 也能识别', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  category: 'IDENTITY',
                  overview: { title: 'Bob' },
                  details: {}
                }
              ]
            }
          ]
        }
      ]
    }
    const r = parseOnepassword(JSON.stringify(data))
    expect(r.items).toHaveLength(1)
    expect(r.items[0]?.tags).toEqual(expect.arrayContaining(['identity']))
  })
})
