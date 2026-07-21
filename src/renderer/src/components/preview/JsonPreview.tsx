/**
 * JsonPreview (Sprint 11 · TASK-060; σ1 · P2-R3 增补大 JSON 防卡)
 *
 * 手写折叠树视图（不引入第三方依赖）。
 *
 * σ1 · P2-R3：超过 200KB 的 JSON 直接走纯文本截断分支，避免 JSON.parse + 深度
 * 递归渲染阻塞 UI；`useMemo` 缓存 parse 结果，避免每次 render 都重解析。
 */

import React, { useMemo, useState } from 'react'

/** 纯文本预览最大长度（~200KB）。超过截断并提示用户。 */
const MAX_TEXT_LENGTH = 200_000
/** 节点递归最大深度；更深的对象/数组显示为 "[...]" 占位。 */
const MAX_NODE_DEPTH = 8

export interface JsonPreviewProps {
  value?: unknown
  /** 字符串形式的 JSON；若与 value 都不给，则空 */
  text?: string
  defaultCollapsed?: boolean
  className?: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const Node: React.FC<{
  name?: string
  value: unknown
  depth: number
  defaultCollapsed: boolean
}> = ({ name, value, depth, defaultCollapsed }) => {
  const [collapsed, setCollapsed] = useState(depth >= 2 && defaultCollapsed)
  const indent = { paddingLeft: depth * 12 }

  // σ1 · P2-R3：超过最大深度仅显示占位符，避免极端嵌套卡线程
  if (depth > MAX_NODE_DEPTH && (Array.isArray(value) || isObj(value))) {
    return (
      <div style={indent}>
        {name !== undefined && <span style={{ color: '#0550ae' }}>"{name}": </span>}
        <span style={{ color: '#999' }}>[...]</span>
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div style={indent}>
        <span
          onClick={() => setCollapsed((c) => !c)}
          style={{ cursor: 'pointer', userSelect: 'none', color: '#666' }}
        >
          {collapsed ? '▶' : '▼'}{' '}
          {name !== undefined && <span style={{ color: '#0550ae' }}>"{name}": </span>}
          [{value.length}]
        </span>
        {!collapsed &&
          value.map((v, i) => (
            <Node
              key={i}
              name={String(i)}
              value={v}
              depth={depth + 1}
              defaultCollapsed={defaultCollapsed}
            />
          ))}
      </div>
    )
  }
  if (isObj(value)) {
    const keys = Object.keys(value)
    return (
      <div style={indent}>
        <span
          onClick={() => setCollapsed((c) => !c)}
          style={{ cursor: 'pointer', userSelect: 'none', color: '#666' }}
        >
          {collapsed ? '▶' : '▼'}{' '}
          {name !== undefined && <span style={{ color: '#0550ae' }}>"{name}": </span>}
          {'{'}
          {keys.length}
          {'}'}
        </span>
        {!collapsed &&
          keys.map((k) => (
            <Node
              key={k}
              name={k}
              value={value[k]}
              depth={depth + 1}
              defaultCollapsed={defaultCollapsed}
            />
          ))}
      </div>
    )
  }
  // primitive
  let display = JSON.stringify(value)
  let color = '#0a3069'
  if (typeof value === 'string') color = '#0a3069'
  else if (typeof value === 'number') color = '#116329'
  else if (typeof value === 'boolean') color = '#8250df'
  else if (value === null) {
    color = '#999'
    display = 'null'
  }
  return (
    <div style={indent}>
      {name !== undefined && <span style={{ color: '#0550ae' }}>"{name}": </span>}
      <span style={{ color }}>{display}</span>
    </div>
  )
}

export const JsonPreview: React.FC<JsonPreviewProps> = ({
  value,
  text,
  defaultCollapsed = true,
  className
}) => {
  // σ1 · P2-R3：解析结果 + 超长降级 memo 化
  // 同 render 下每次 render 都 JSON.parse 大对象会造成明显 lag（1MB JSON ~50ms）。
  const { parsed, parseError, truncated } = useMemo<{
    parsed: unknown
    parseError?: string
    truncated?: { preview: string; original: number }
  }>(() => {
    if (value !== undefined) return { parsed: value }
    if (text === undefined) return { parsed: undefined }
    // 超长 JSON 降级为纯文本截断，避免 JSON.parse 阻塞 UI
    if (text.length > MAX_TEXT_LENGTH) {
      return {
        parsed: undefined,
        truncated: {
          preview: text.slice(0, MAX_TEXT_LENGTH),
          original: text.length
        }
      }
    }
    try {
      return { parsed: JSON.parse(text) }
    } catch (err) {
      return { parsed: undefined, parseError: (err as Error).message }
    }
  }, [value, text])

  if (parseError) {
    return (
      <div className={className} style={{ color: '#ef4444' }}>
        JSON 解析失败：{parseError}
      </div>
    )
  }
  if (truncated) {
    return (
      <div
        className={className}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          padding: 8,
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 8,
          maxHeight: 400,
          overflow: 'auto',
          whiteSpace: 'pre-wrap'
        }}
      >
        <div style={{ color: '#b45309', marginBottom: 6 }}>
          JSON 过长（{truncated.original.toLocaleString()} 字符），已截断至{' '}
          {MAX_TEXT_LENGTH.toLocaleString()} 字符以纯文本显示。
        </div>
        {truncated.preview}
      </div>
    )
  }
  return (
    <div
      className={className}
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        padding: 8,
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
        maxHeight: 400,
        overflow: 'auto'
      }}
    >
      <Node value={parsed} depth={0} defaultCollapsed={defaultCollapsed} />
    </div>
  )
}

export default JsonPreview
