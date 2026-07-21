/**
 * QRCode 组件：展示已生成的二维码 SVG 字符串
 *
 * 二维码生成在主进程完成（qrcode 库），renderer 仅渲染 svg 字符串。
 */

import { cn } from '@renderer/lib/utils'

interface QRCodeProps {
  /** 主进程返回的 SVG 字符串 */
  svg: string
  /** 直接渲染尺寸 px */
  size?: number
  className?: string
}

export function QRCode({ svg, size = 200, className }: QRCodeProps): JSX.Element {
  return (
    <div
      className={cn('inline-block rounded bg-white p-2', className)}
      style={{ width: size, height: size }}
      // svg 字符串来自主进程信任边界内（qrcode 库的 toString 输出），
      // 但仍建议上层避免直接拼接外部内容。
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="配对二维码"
      role="img"
    />
  )
}
