/**
 * CSV 解析器单元测试
 */
import { describe, it, expect } from 'vitest'
import { parseCsv, csvToObjects, normalizeTag } from './types'

describe('parseCsv', () => {
  it('基本逗号分隔', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ])
  })

  it('引号内逗号不切分', () => {
    expect(parseCsv('a,b\n"x,y",z')).toEqual([
      ['a', 'b'],
      ['x,y', 'z']
    ])
  })

  it('双引号转义', () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([['a'], ['she said "hi"']])
  })

  it('CRLF 兼容', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
})

describe('csvToObjects', () => {
  it('首行 header', () => {
    expect(csvToObjects('n,v\nalice,1\nbob,2')).toEqual([
      { n: 'alice', v: '1' },
      { n: 'bob', v: '2' }
    ])
  })
  it('空输入', () => {
    expect(csvToObjects('')).toEqual([])
  })
})

describe('normalizeTag', () => {
  it('过滤无效 tag', () => {
    expect(normalizeTag('')).toBeNull()
    expect(normalizeTag('(none)')).toBeNull()
    expect(normalizeTag('None')).toBeNull()
    expect(normalizeTag(' work ')).toBe('work')
  })
})
