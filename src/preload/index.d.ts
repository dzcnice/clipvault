/**
 * Preload API 类型声明 · v3.0 个人本地版
 */

import type { API } from './index'

declare global {
  interface Window {
    api: API
  }
}

export {}
