/**
 * 动效占位 · v3 已去掉 framer-motion 依赖。
 * 保留空导出避免旧 import 路径炸掉；新代码请用 CSS class（animate-fadeIn 等）。
 */

export const fadeIn = {}
export const slideUp = {}
export const springScale = {}
export const listStagger = {}
export const listItem = {}
export const drawerSlide = {}
export const hudReveal = {}
export const springBase = {}

export function reduceMotion<T>(preset: T, _enable: boolean): T {
  return preset
}
