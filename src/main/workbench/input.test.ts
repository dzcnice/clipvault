import { describe, expect, it } from 'vitest'
import { parseResourceText } from './input'

describe('local resource intake', () => {
  it('extracts purpose and project without putting the password into metadata', () => {
    const draft = parseResourceText('名称：测试后台\n项目：工作台\n环境：staging\n用途：下次检查登录\n用户名：tester\n密码：IntakeCanary!')
    expect(draft.suggested).toMatchObject({ name: '测试后台', projectName: '工作台', environment: 'staging', purpose: '下次检查登录', kind: 'account' })
    expect(draft.fields).toEqual([{ name: '用户名', value: 'tester', secret: false }, { name: '密码', value: 'IntakeCanary!', secret: true }])
    expect(JSON.stringify(draft.suggested)).not.toContain('IntakeCanary!')
  })
  it('separates URL passwords and query tokens before the address is displayed', () => {
    const draft = parseResourceText('https://alice:HiddenPass@example.com/login?token=HiddenToken&lang=zh')
    expect(draft.endpoint).toBe('https://example.com/login?lang=zh')
    expect(draft.fields).toEqual(expect.arrayContaining([{ name: 'username', value: 'alice', secret: false }, { name: 'password', value: 'HiddenPass', secret: true }, { name: 'token', value: 'HiddenToken', secret: true }]))
    expect(draft.warnings.length).toBeGreaterThan(0)
  })
  it('keeps unrecognized prose local and protected', () => {
    const draft = parseResourceText('这是一个无法确定格式的账号资料')
    expect(draft.fields).toEqual([{ name: '原始资料', value: '这是一个无法确定格式的账号资料', secret: true }])
  })
  it('preserves literal JSON password spaces and conflicting URL credentials', () => {
    const draft = parseResourceText('{"password":"  spaced secret  ","url":"https://a:second-secret@example.com"}')
    expect(draft.fields.find(field => field.name === 'password')?.value).toBe('  spaced secret  ')
    expect(draft.fields.find(field => field.name === '原始资料')?.value).toContain('second-secret')
    expect(draft.endpoint).toBe('https://example.com/')
  })
})
