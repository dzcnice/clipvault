/**
 * CodePreview · 等宽字体 + 行号 + 轻量 token 着色
 *
 * 不引入 shiki 依赖（体积与主进程无关）；用正则做关键字 / 字符串 / 注释高亮。
 */

import React, { useMemo } from 'react'

export interface CodePreviewProps {
  code: string
  language?: string
  maxLines?: number
  className?: string
}

type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number'

interface Token {
  kind: TokenKind
  text: string
}

const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|typeof|interface|type|extends|implements|public|private|protected|static|null|undefined|true|false|def|lambda|pass|with|as|yield|match|case|break|continue|package|struct|enum|fn|mut|pub|use|mod)\b/g

const TOKEN_COLORS: Record<TokenKind, string> = {
  plain: 'inherit',
  keyword: '#7c3aed',
  string: '#0d9488',
  comment: '#9ca3af',
  number: '#c2410c'
}

function tokenizeLine(line: string): Token[] {
  if (!line) return [{ kind: 'plain', text: ' ' }]

  // line comment
  const commentIdx = line.indexOf('//')
  if (commentIdx >= 0) {
    const before = line.slice(0, commentIdx)
    const comment = line.slice(commentIdx)
    return [...tokenizeCodePart(before), { kind: 'comment', text: comment }]
  }
  // hash comment (python/shell-ish)
  const hashIdx = line.indexOf('#')
  if (hashIdx >= 0 && !line.slice(0, hashIdx).includes('"') && !line.slice(0, hashIdx).includes("'")) {
    const before = line.slice(0, hashIdx)
    const comment = line.slice(hashIdx)
    return [...tokenizeCodePart(before), { kind: 'comment', text: comment }]
  }

  return tokenizeCodePart(line)
}

function tokenizeCodePart(part: string): Token[] {
  if (!part) return []
  const tokens: Token[] = []
  // Split strings first (simple double/single quotes)
  const strRe = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = strRe.exec(part)) !== null) {
    if (m.index > last) {
      tokens.push(...tokenizeKeywordsAndNumbers(part.slice(last, m.index)))
    }
    tokens.push({ kind: 'string', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < part.length) {
    tokens.push(...tokenizeKeywordsAndNumbers(part.slice(last)))
  }
  return tokens.length ? tokens : [{ kind: 'plain', text: part }]
}

function tokenizeKeywordsAndNumbers(part: string): Token[] {
  if (!part) return []
  const tokens: Token[] = []
  const re = new RegExp(`${KEYWORDS.source}|\\b\\d+(?:\\.\\d+)?\\b`, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(part)) !== null) {
    if (m.index > last) {
      tokens.push({ kind: 'plain', text: part.slice(last, m.index) })
    }
    const text = m[0]
    const kind: TokenKind = /^\d/.test(text) ? 'number' : 'keyword'
    tokens.push({ kind, text })
    last = m.index + text.length
  }
  if (last < part.length) {
    tokens.push({ kind: 'plain', text: part.slice(last) })
  }
  return tokens.length ? tokens : [{ kind: 'plain', text: part }]
}

export const CodePreview: React.FC<CodePreviewProps> = ({
  code,
  language,
  maxLines = 200,
  className
}) => {
  const allLines = code.split('\n')
  const lines = allLines.slice(0, maxLines)
  const truncated = allLines.length > maxLines

  const tokenized = useMemo(() => lines.map((line) => tokenizeLine(line)), [lines])

  return (
    <div
      className={className}
      style={{
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: 8,
        overflow: 'hidden',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13
      }}
    >
      {language && (
        <div
          style={{
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.05)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase'
          }}
        >
          {language}
        </div>
      )}
      <pre style={{ margin: 0, padding: 8, overflow: 'auto' }}>
        {tokenized.map((tokens, i) => (
          <div key={i} style={{ display: 'flex' }}>
            <span
              style={{
                minWidth: 32,
                textAlign: 'right',
                paddingRight: 10,
                color: '#999',
                userSelect: 'none'
              }}
            >
              {i + 1}
            </span>
            <span style={{ whiteSpace: 'pre' }}>
              {tokens.map((t, j) => (
                <span key={j} style={{ color: TOKEN_COLORS[t.kind] }}>
                  {t.text}
                </span>
              ))}
            </span>
          </div>
        ))}
        {truncated && (
          <div style={{ color: '#999', paddingLeft: 42 }}>…（已截断）</div>
        )}
      </pre>
    </div>
  )
}

export default CodePreview
