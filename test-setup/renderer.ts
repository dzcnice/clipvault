/**
 * 全局测试 setup：
 *  - jsdom 环境下注入 jest-dom 匹配器、mock window.api / navigator.clipboard / matchMedia
 *  - node 环境下为 no-op
 *
 * 说明：vitest 4 已移除 environmentMatchGlobs，本项目采用"全局 config + 文件顶部 @vitest-environment jsdom 指令"切换环境。
 */

const isJsdom =
  typeof window !== 'undefined' && typeof document !== 'undefined'

if (isJsdom) {
  // 动态 import jest-dom 匹配器（仅 jsdom 下注册）
  await import('@testing-library/jest-dom/vitest')

  // 每个 test 后自动 cleanup React 组件（@testing-library/react 未自动挂载 afterEach 时兜底）
  const { cleanup } = await import('@testing-library/react')
  const { afterEach } = await import('vitest')
  afterEach(() => {
    cleanup()
  })

  // matchMedia polyfill（jsdom 默认不提供）
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: (): void => {},
        removeListener: (): void => {},
        addEventListener: (): void => {},
        removeEventListener: (): void => {},
        dispatchEvent: (): boolean => false
      })
    })
  }

  // 默认提供一个最小 window.api mock，子测试可按需覆盖
  if (!(window as unknown as { api?: unknown }).api) {
    Object.defineProperty(window, 'api', {
      writable: true,
      configurable: true,
      value: {
        vault: {},
        clipboard: {},
        credential: {},
        sprint11: {
          totp: {},
          password: {}
        }
      }
    })
  }

  // clipboard mock（jsdom 默认不提供 clipboard）
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: {
        writeText: async (): Promise<void> => undefined,
        readText: async (): Promise<string> => ''
      }
    })
  }
}
