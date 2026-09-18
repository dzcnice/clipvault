import { describe, it, expect } from 'vitest'
import { sidebarUpdateLabel } from './SidebarUpdateButton'

describe('sidebarUpdateLabel', () => {
  it('unpackaged 显示开发版，不显示检查中', () => {
    expect(
      sidebarUpdateLabel({ packaged: false, status: 'checking', busy: false })
    ).toBe('开发版')
    expect(
      sidebarUpdateLabel({ packaged: false, status: 'idle', busy: true })
    ).toBe('开发版')
    expect(
      sidebarUpdateLabel({ packaged: false, status: 'not-available', busy: false })
    ).toBe('开发版')
  })

  it('packaged 按真实状态文案', () => {
    expect(
      sidebarUpdateLabel({ packaged: true, status: 'checking', busy: false })
    ).toBe('检查中…')
    expect(
      sidebarUpdateLabel({ packaged: true, status: 'not-available', busy: false })
    ).toBe('已是最新')
    expect(
      sidebarUpdateLabel({ packaged: true, status: 'idle', busy: false })
    ).toBe('检查更新')
    expect(
      sidebarUpdateLabel({
        packaged: true,
        status: 'available',
        busy: false,
        version: '3.3.0'
      })
    ).toBe('更新 3.3.0')
    expect(
      sidebarUpdateLabel({
        packaged: true,
        status: 'downloading',
        busy: false,
        percent: 41.2
      })
    ).toBe('下载 41%')
  })
})
