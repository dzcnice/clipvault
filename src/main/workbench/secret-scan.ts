export type SecretHitKind = 'known' | 'format' | 'assignment'
export interface SecretHit { kind: SecretHitKind; label: string; start: number; end: number }

const placeholder = /^(?:x{4,}|\*{4,}|\.{3,}|<[^>]+>|\$\{[^}]*\}|\$[A-Z_]+|(?:your|my|example|sample|test|dummy|fake|placeholder|changeme|replace)[-_a-z0-9]*|.*(?:xxxx|[-_]?here))$/i
const formats: Array<[string, RegExp]> = [
  ['openai_key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['aws_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['google_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['private_key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['url_credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s/@]+)@/gi]
]
const key = '(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|密码|密钥|令牌)'
const quoted = new RegExp(`(?<![\\w.-])([\\w.-]*${key}[\\w-]*["']?\\s*[:=：]\\s*)(["'\x60])([^"'\x60\\s]{8,})\\2`, 'gi')
const envLine = new RegExp('^(\\s*(?:export\\s+)?[A-Z0-9_]*(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|AUTHORIZATION)[A-Z0-9_]*\\s*=\\s*)([^\\s#\'"$][^\\s#]{7,})\\s*$', 'gm')
const classes = (value: string): number => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(regex => regex.test(value)).length
const excluded = (value: string): boolean => placeholder.test(value) || /(.)\1{7,}/.test(value) || value.includes('${')

/** Known stored values remain authoritative even if they resemble example placeholders. */
export function scanSecrets(text: string, known: string[] = []): SecretHit[] {
  const hits: SecretHit[] = []
  for (const value of known) {
    if (value.length < 6) continue
    for (const form of new Set([value, JSON.stringify(value).slice(1, -1)])) {
      let index = text.indexOf(form)
      while (index >= 0) {
        if (value.length >= 12 || (!/[A-Za-z0-9]/.test(text[index - 1] ?? '') && !/[A-Za-z0-9]/.test(text[index + form.length] ?? ''))) hits.push({ kind: 'known', label: 'stored_secret', start: index, end: index + form.length })
        index = text.indexOf(form, index + 1)
      }
    }
  }
  for (const [label, regex] of formats) for (const match of text.matchAll(regex)) {
    const value = label === 'url_credential' ? match[1]! : match[0].replace(/^sk-(?:ant-|proj-)?/, '')
    if (label !== 'private_key' && excluded(value)) continue
    hits.push({ kind: 'format', label, start: match.index, end: match.index + match[0].length })
  }
  for (const match of text.matchAll(quoted)) {
    const value = match[3]!
    if (excluded(value) || /^[A-Z][A-Z0-9_]+$/.test(value) || (classes(value) < 2 && value.length < 16)) continue
    hits.push({ kind: 'assignment', label: 'quoted_literal', start: match.index + match[1]!.length, end: match.index + match[0].length })
  }
  for (const match of text.matchAll(envLine)) {
    const value = match[2]!
    if (excluded(value) || /^[A-Z][A-Z0-9_]+$/.test(value) || (classes(value) < 2 && value.length < 16)) continue
    hits.push({ kind: 'assignment', label: 'env_literal', start: match.index + match[1]!.length, end: match.index + match[0].length })
  }
  return hits.sort((a, b) => a.start - b.start || b.end - a.end)
}
export function redactScanned(text: string, known: string[]): { text: string; redacted: boolean } {
  const hits = scanSecrets(text, known)
  let cursor = 0, result = ''
  for (const hit of hits) {
    if (hit.start >= cursor) result += text.slice(cursor, hit.start) + '[已隐藏敏感字段]'
    cursor = Math.max(cursor, hit.end)
  }
  return { text: result + text.slice(cursor), redacted: hits.length > 0 }
}
