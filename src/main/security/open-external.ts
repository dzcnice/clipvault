/**
 * v2.1 G3-2 · shell.openExternal 白名单网关
 *
 * 背景：`window.open` / `setWindowOpenHandler` 若无过滤，
 * 渲染端一旦被 XSS 注入任意 URL 即可借 `shell.openExternal`
 * 启动本机默认应用（如 `file://`、自定义协议、恶意深链）。
 *
 * 策略（保守）：
 *   - 协议白名单：`https:`、`http:`、`mailto:`
 *     （http 保留给 localhost / 文档本地预览；mailto 给反馈链接）
 *   - 非白名单 → 记 warn 日志 + 拒绝（返回 false）
 *
 * 若后续需要限制域名，可在 ALLOWED_HOSTS 里配置；当前为空集合 = 不限制域名。
 */

import { shell } from 'electron'
import { logger } from '../utils/logger'

/** 协议白名单（带尾冒号，和 URL.protocol 一致） */
const ALLOWED_PROTOCOLS = new Set<string>(['https:', 'http:', 'mailto:'])

/**
 * 白名单校验后再调 `shell.openExternal`。
 *
 * @returns true 表示已放行并调用 openExternal；false 表示已拦截
 */
export function safeOpenExternal(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) {
    logger.warn('[security] blocked openExternal: empty url')
    return false
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    logger.warn(`[security] blocked openExternal (invalid url): ${url}`)
    return false
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    logger.warn(`[security] blocked openExternal: ${url}`)
    return false
  }
  void shell.openExternal(url)
  return true
}

/** 测试可见：返回当前允许的协议集合（只读快照） */
export function _allowedProtocolsForTest(): string[] {
  return Array.from(ALLOWED_PROTOCOLS)
}
