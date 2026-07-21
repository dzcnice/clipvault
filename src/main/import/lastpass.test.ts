/**
 * LastPass CSV 导入单元测试
 */
import { describe, it, expect } from 'vitest'
import { parseLastpassCsv } from './lastpass'

describe('parseLastpassCsv', () => {
  it('grouping 映射为 tag', () => {
    const csv = [
      'url,username,password,totp,extra,name,grouping,fav',
      'https://a.com,u,p,,,Alpha,Work/Infra,0',
      'https://b.com,u2,p2,,some note,Beta,,1'
    ].join('\n')
    const r = parseLastpassCsv(csv)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]?.tags).toEqual(expect.arrayContaining(['lastpass', 'Work', 'Infra']))
    expect(r.items[1]?.tags).toContain('favorite')
  })

  it('totp 进 metadata', () => {
    const csv =
      'url,username,password,totp,extra,name,grouping,fav\nhttps://a.com,u,p,otpauth://xxx,,A,,0'
    const r = parseLastpassCsv(csv)
    expect(r.items[0]?.metadata?.totp).toBe('otpauth://xxx')
  })

  it('全空行跳过', () => {
    const csv = 'url,username,password,totp,extra,name,grouping,fav\n,,,,,,,\n'
    const r = parseLastpassCsv(csv)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})
