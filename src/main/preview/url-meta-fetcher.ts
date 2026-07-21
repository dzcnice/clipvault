/**
 * URL 元数据抓取（Sprint 11 · TASK-060）
 *
 * 走 Electron `net.request` 以复用系统代理；正则提取 title / og:* / description / favicon。
 */

import { net } from 'electron'
import { logger } from '../utils/logger'

export interface UrlMeta {
  title?: string
  description?: string
  image?: string
  favicon?: string
  url: string
  error?: string
}

const MAX_BYTES = 256 * 1024 // 仅抓前 256KB 足够拿到 <head>

function matchMeta(html: string, prop: string): string | undefined {
  // 匹配 <meta property="og:xxx" content="..."> 和 name= 两种形式；content 可在前或后
  const attr = prop.includes(':') ? 'property' : 'name'
  const re1 = new RegExp(
    `<meta[^>]+${attr}=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i'
  )
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${prop}["']`,
    'i'
  )
  const m = html.match(re1) ?? html.match(re2)
  return m ? m[1] : undefined
}

function extract(html: string, baseUrl: string): UrlMeta {
  const meta: UrlMeta = { url: baseUrl }
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (t && t[1]) meta.title = t[1].trim().slice(0, 500)

  meta.title = matchMeta(html, 'og:title') ?? meta.title
  meta.description =
    matchMeta(html, 'og:description') ?? matchMeta(html, 'description')
  meta.image = matchMeta(html, 'og:image')

  // favicon 从 <link rel="icon|shortcut icon" href="">
  const fav = html.match(
    /<link[^>]+rel=["'](?:shortcut\s+icon|icon)["'][^>]*href=["']([^"']+)["']/i
  )
  if (fav && fav[1]) {
    try {
      meta.favicon = new URL(fav[1], baseUrl).toString()
    } catch {
      meta.favicon = fav[1]
    }
  } else {
    try {
      meta.favicon = new URL('/favicon.ico', baseUrl).toString()
    } catch {
      // ignore
    }
  }

  // 图片若是相对路径，补绝对
  if (meta.image) {
    try {
      meta.image = new URL(meta.image, baseUrl).toString()
    } catch {
      // ignore
    }
  }
  return meta
}

/**
 * 抓取 URL 的元数据。失败时返回 `{ url, error }`，不会抛出。
 */
export function fetchUrlMeta(
  url: string,
  timeoutMs = 3000
): Promise<UrlMeta> {
  return new Promise((resolve) => {
    let settled = false
    const done = (m: UrlMeta): void => {
      if (settled) return
      settled = true
      resolve(m)
    }

    try {
      // 先 validate
      const parsed = new URL(url)
      if (!/^https?:$/i.test(parsed.protocol)) {
        return done({ url, error: '仅支持 http/https' })
      }
    } catch {
      return done({ url, error: 'URL 非法' })
    }

    let req: ReturnType<typeof net.request>
    try {
      req = net.request({ method: 'GET', url })
    } catch (err) {
      return done({ url, error: (err as Error).message })
    }
    req.setHeader('User-Agent', 'ClipVault/2.0 (+url-preview)')
    req.setHeader('Accept', 'text/html,application/xhtml+xml')

    const timer = setTimeout(() => {
      try {
        req.abort()
      } catch {
        // ignore
      }
      done({ url, error: 'timeout' })
    }, timeoutMs)

    req.on('response', (resp) => {
      const chunks: Buffer[] = []
      let total = 0
      resp.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total <= MAX_BYTES) chunks.push(chunk)
        if (total > MAX_BYTES) {
          try {
            req.abort()
          } catch {
            // ignore
          }
        }
      })
      resp.on('end', () => {
        clearTimeout(timer)
        try {
          const html = Buffer.concat(chunks).toString('utf8')
          done(extract(html, url))
        } catch (err) {
          done({ url, error: (err as Error).message })
        }
      })
      resp.on('error', (err: Error) => {
        clearTimeout(timer)
        logger.warn('[url-meta] response error:', err.message)
        done({ url, error: err.message })
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      done({ url, error: err.message })
    })

    try {
      req.end()
    } catch (err) {
      clearTimeout(timer)
      done({ url, error: (err as Error).message })
    }
  })
}
