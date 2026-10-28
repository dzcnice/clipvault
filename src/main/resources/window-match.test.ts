import { describe, expect, it } from 'vitest'
import { matchScore } from '../../utils/window-match'

describe('foreground window matching', () => {
  const github = { name: 'GitHub', loginUrl: 'https://github.com/login', aliases: ['gh'] }
  it('scores host, brand and name matches and ignores unrelated or empty windows', () => {
    expect(matchScore({ title: 'Sign in to github.com - Google Chrome', process: 'chrome' }, github)).toBe(3)
    expect(matchScore({ title: 'Sign in to GitHub · GitHub - Google Chrome', process: 'chrome' }, github)).toBe(2)
    expect(matchScore({ title: '微信', process: 'WeChat' }, github)).toBe(0)
    expect(matchScore({ title: '', process: '' }, github)).toBe(0)
    expect(matchScore({ title: 'x', process: 'y' }, { name: 'a', endpoint: 'not a url' })).toBe(0)
  })
})
