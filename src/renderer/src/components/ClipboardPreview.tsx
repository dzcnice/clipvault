/**
 * ClipboardPreview (Sprint 11 · TASK-060)
 *
 * 根据 contentType 路由到对应子组件。
 * 作为新的可选预览容器；不取代现有 ClipboardList 的行为。
 */

import React from 'react'
import { CodePreview } from './preview/CodePreview'
import { JsonPreview } from './preview/JsonPreview'
import { UrlPreview } from './preview/UrlPreview'
import { ImagePreview } from './preview/ImagePreview'

export type ClipboardContentType =
  | 'text'
  | 'code'
  | 'json'
  | 'url'
  | 'image'

export interface ClipboardPreviewProps {
  contentType: ClipboardContentType
  content: string
  /** code 专用：语言标签 */
  language?: string
  /** image 专用：src */
  imageSrc?: string
  className?: string
}

export const ClipboardPreview: React.FC<ClipboardPreviewProps> = ({
  contentType,
  content,
  language,
  imageSrc,
  className
}) => {
  switch (contentType) {
    case 'code':
      return (
        <CodePreview
          code={content}
          language={language}
          className={className}
        />
      )
    case 'json':
      return <JsonPreview text={content} className={className} />
    case 'url':
      return <UrlPreview url={content} className={className} />
    case 'image':
      return (
        <ImagePreview src={imageSrc ?? content} className={className} />
      )
    case 'text':
    default:
      return (
        <div
          className={className}
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            padding: 8,
            fontSize: 13
          }}
        >
          {content}
        </div>
      )
  }
}

export default ClipboardPreview
