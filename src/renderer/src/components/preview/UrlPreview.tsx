/**
 * UrlPreview (Sprint 11 · TASK-060)
 *
 * 调 IPC preview.fetchUrlMeta 抓 og:* meta 展示卡片。
 */

import React, { useEffect, useState } from 'react'
import type { UrlMetaWire } from '../../../../preload/tools-api'

interface Sprint11PreviewAPI {
  fetchUrlMeta: (
    url: string,
    timeoutMs?: number
  ) => Promise<{ success: boolean; data?: UrlMetaWire; error?: string }>
}

function getApi(): Sprint11PreviewAPI | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { preview?: Sprint11PreviewAPI }
    }
  ).api
  return api?.preview ?? null
}

export interface UrlPreviewProps {
  url: string
  className?: string
}

export const UrlPreview: React.FC<UrlPreviewProps> = ({ url, className }) => {
  const [meta, setMeta] = useState<UrlMetaWire | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const api = getApi()
      if (!api) {
        setLoading(false)
        return
      }
      setLoading(true)
      const r = await api.fetchUrlMeta(url, 3000)
      if (cancelled) return
      setMeta(r.data ?? { url, error: r.error })
      setLoading(false)
    })()
    return (): void => {
      cancelled = true
    }
  }, [url])

  if (loading) {
    return (
      <div className={className} style={{ color: '#666', fontSize: 12 }}>
        加载中 {url}…
      </div>
    )
  }
  if (!meta || meta.error) {
    return (
      <div className={className}>
        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#0550ae' }}>
          {url}
        </a>
        {meta?.error && (
          <div style={{ color: '#ef4444', fontSize: 11 }}>{meta.error}</div>
        )}
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={{
        display: 'flex',
        gap: 10,
        padding: 10,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        maxWidth: 480
      }}
    >
      {meta.image && (
        <img
          src={meta.image}
          alt=""
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {meta.favicon && (
            <img src={meta.favicon} alt="" width={14} height={14} />
          )}
          <span
            style={{
              fontSize: 11,
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {new URL(url).hostname}
          </span>
        </div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>
          {meta.title ?? url}
        </div>
        {meta.description && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginTop: 4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {meta.description}
          </div>
        )}
      </div>
    </a>
  )
}

export default UrlPreview
