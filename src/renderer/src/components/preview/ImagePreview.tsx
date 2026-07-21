/**
 * ImagePreview (Sprint 11 · TASK-060)
 *
 * 缩略图 + 尺寸信息。
 */

import React, { useEffect, useState } from 'react'

export interface ImagePreviewProps {
  /** 图像 src（可为 data: 或 file:// 或 http） */
  src: string
  alt?: string
  maxWidth?: number
  maxHeight?: number
  className?: string
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  alt,
  maxWidth = 320,
  maxHeight = 240,
  className
}) => {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDims(null)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(false)
    // ρ3 · P1-8：src 切换时取消旧 Image 加载，避免 onload 延后触发污染新 state
    let cancelled = false
    const img = new Image()
    img.onload = (): void => {
      if (cancelled) return
      setDims({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = (): void => {
      if (cancelled) return
      setError(true)
    }
    img.src = src
    return (): void => {
      cancelled = true
      img.onload = null
      img.onerror = null
      // 把 src 置空以便浏览器中止未完成的加载
      img.src = ''
    }
  }, [src])

  if (error) {
    return (
      <div className={className} style={{ color: '#ef4444', fontSize: 12 }}>
        图片加载失败
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8
      }}
    >
      <img
        src={src}
        alt={alt ?? 'preview'}
        style={{
          maxWidth,
          maxHeight,
          objectFit: 'contain',
          borderRadius: 4
        }}
      />
      <div style={{ fontSize: 11, color: '#666' }}>
        {dims ? `${dims.w} × ${dims.h}` : '—'}
      </div>
    </div>
  )
}

export default ImagePreview
