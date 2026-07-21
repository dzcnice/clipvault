/**
 * 渲染端全局 Window 类型增强
 *
 * 原 preload/index.d.ts 在跨 tsconfig project 边界时 declare global 不稳定，
 * 此文件在 tsconfig.web.json 的 scope 内重新声明一次，保证 renderer 侧 IntelliSense。
 */

import type { API } from '../../preload'

declare global {
  interface Window {
    api: API
  }
}

export {}
