import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({}))
import { looksLikeAccountList, parseAccountCombo } from './account-combo'
import { classifyClip } from './classify'
import { parseResourceText } from '../workbench/input'

describe('account strings', () => {
  it.each([
    ['synthetic.user@example.com|Syn7hetic-Pass|backup.box@example.org', '|', 'synthetic.user@example.com', 'Syn7hetic-Pass'],
    ['synthetic_user----Fake2026pass', '----', 'synthetic_user', 'Fake2026pass'],
    ['synthetic.user@example.com:Fake2026pass', ':', 'synthetic.user@example.com', 'Fake2026pass'],
    ['13800000000\tSyntheticPass99', '\t', '13800000000', 'SyntheticPass99']
  ])('parses %s', (line, separator, username, password) => {
    expect(parseAccountCombo(line)).toMatchObject({ separator, username, password })
  })
  it.each([
    'https://example.com/a|b',
    '10:30',
    'host: localhost',
    'name:abcdef123',
    'C:\\Users\\someone\\file.txt',
    'a|b',
    'hello world|this is text',
    'synthetic_user----short',
    'key|value|other',
    'const a = b || c'
  ])('does not treat %s as an account string', line => {
    expect(parseAccountCombo(line)).toBeNull()
  })
  it('classifies account lists as credentials but leaves normal prose, tables and code alone', () => {
    expect(classifyClip({ type: 'text', text: 'synthetic.user@example.com|Syn7hetic-Pass|backup' }).category).toBe('credential')
    expect(classifyClip({ type: 'text', text: 'a1@example.com|Pass-0001x\na2@example.com|Pass-0002x\na3@example.com|Pass-0003x' }).category).toBe('credential')
    expect(classifyClip({ type: 'text', text: '| 名称 | 说明 |\n|---|---|\n| a | b |' }).category).not.toBe('credential')
    expect(classifyClip({ type: 'text', text: '今天开会：讨论发布计划，然后吃饭' }).category).toBe('text')
    expect(looksLikeAccountList('first line of prose\nsecond line of prose\nuser@example.com|Pass-0001x')).toBe(false)
  })
  it('splits a pasted account string into username, password and extra fields for intake', () => {
    const draft = parseResourceText('synthetic.user@example.com|Syn7hetic-Pass|JBSWY3DPEHPK3PXPJBSWY3DP|backup.box@example.org')
    expect(draft.suggested?.kind).toBe('account')
    expect(draft.fields).toEqual([
      { name: 'username', value: 'synthetic.user@example.com', secret: false },
      { name: 'password', value: 'Syn7hetic-Pass', secret: true },
      { name: '验证码种子', value: 'JBSWY3DPEHPK3PXPJBSWY3DP', secret: true },
      { name: '备用联系方式', value: 'backup.box@example.org', secret: false }
    ])
  })
})
