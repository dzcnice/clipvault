// @vitest-environment jsdom
/**
 * ρ3 · P1-8：ImagePreview 旧 Image 取消 - 避免 src 切换快时 onload 污染新 state
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ImagePreview } from './ImagePreview'

describe('ImagePreview cleanup', () => {
  let originalImage: typeof Image
  let createdImages: Array<{
    src: string | null
    onload: (() => void) | null
    onerror: (() => void) | null
    naturalWidth: number
    naturalHeight: number
  }>

  beforeEach(() => {
    originalImage = window.Image
    createdImages = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).Image = class FakeImage {
      src: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 100
      naturalHeight = 80
      constructor() {
        createdImages.push(this)
      }
    }
  })

  afterEach(() => {
    (window as unknown as { Image: typeof Image }).Image = originalImage
  })

  it('src 切换后旧 Image 被清理：旧 onload 被置 null', () => {
    const { rerender } = render(<ImagePreview src="first.png" />)
    expect(createdImages).toHaveLength(1)
    const firstImg = createdImages[0]!
    expect(typeof firstImg.onload).toBe('function')

    // 切换 src 触发 cleanup
    rerender(<ImagePreview src="second.png" />)
    expect(firstImg.onload).toBeNull()
    expect(firstImg.onerror).toBeNull()
    // 新的 Image 被创建
    expect(createdImages.length).toBeGreaterThanOrEqual(2)
  })

  it('src 切换后迟到的旧 onload 不会影响 state（cancelled 短路）', () => {
    const { rerender, container } = render(<ImagePreview src="slow.png" />)
    const firstImg = createdImages[0]!
    const firstOnload = firstImg.onload

    // src 改变 → cleanup 执行 → onload 被置 null
    rerender(<ImagePreview src="fast.png" />)
    expect(firstImg.onload).toBeNull()

    // 即便我们手动调用"捕获的旧 onload"，闭包里的 cancelled 也应阻止 setState
    // （不会抛错，更不会污染 state）
    act(() => {
      firstOnload?.()
    })

    // 当前视图是新图（dims 未被旧图填充），占位 — 显示
    expect(container.textContent).toContain('—')
  })

  it('匹配的新 Image onload 正常设置 dims', () => {
    const { container } = render(<ImagePreview src="single.png" />)
    const img = createdImages[0]!
    img.naturalWidth = 320
    img.naturalHeight = 240
    act(() => {
      img.onload?.()
    })
    expect(container.textContent).toContain('320 × 240')
  })
})
