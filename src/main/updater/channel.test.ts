import { describe, it, expect } from 'vitest'
import { resolveChannel, isValidChannel } from './channel'

describe('updater channel', () => {
  it('stable → allowPrerelease=false, channel=latest', () => {
    expect(resolveChannel('stable')).toEqual({
      allowPrerelease: false,
      channel: 'latest'
    })
  })
  it('beta → allowPrerelease=true, channel=beta', () => {
    expect(resolveChannel('beta')).toEqual({
      allowPrerelease: true,
      channel: 'beta'
    })
  })
  it('isValidChannel', () => {
    expect(isValidChannel('stable')).toBe(true)
    expect(isValidChannel('beta')).toBe(true)
    expect(isValidChannel('alpha')).toBe(false)
    expect(isValidChannel(null)).toBe(false)
  })
})
