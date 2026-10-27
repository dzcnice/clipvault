const PLACEHOLDER = /^(?:x{4,}|\*{4,}|\.{3,}|<[^>]+>|\$\{[^}]*\}|\$[A-Z_]+|(?:your|my|example|sample|test|dummy|fake|placeholder|changeme|replace)[-_a-z0-9]*|.*(?:xxxx|[-_]?here))$/i
const FORMATS = [
  ['openai_key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g],
  ['github_token', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ['aws_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['google_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['private_key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['url_credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s/@]+)@/gi]
]
const KEY = '(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|authorization|密码|密钥|令牌)'
const QUOTED = new RegExp(`(\\b[\\w.-]*${KEY}[\\w-]*["']?\\s*[:=：]\\s*)(["'\`])([^"'\`\\s]{8,})\\2`, 'gi')
const ENVLINE = new RegExp(`^(\\s*(?:export\\s+)?[A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*\\s*=\\s*)([^\\s#'"$][^\\s#]{7,})\\s*$`, 'gm')
const classes = v => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(v)).length
function scan(text, known = []) {
  const hits = []
  for (const k of known) {
    if (k.length < 6) continue
    for (const f of new Set([k, JSON.stringify(k).slice(1, -1)])) {
      let i = text.indexOf(f)
      while (i >= 0) {
        const edge = k.length >= 12 || (!/[A-Za-z0-9]/.test(text[i - 1] ?? '') && !/[A-Za-z0-9]/.test(text[i + f.length] ?? ''))
        if (edge) hits.push({ kind: 'known', start: i, end: i + f.length })
        i = text.indexOf(f, i + 1)
      }
    }
  }
  for (const [label, re] of FORMATS) for (const m of text.matchAll(re)) {
    const value = label === 'url_credential' ? m[1] : m[0]
    if (label !== 'private_key' && (PLACEHOLDER.test(value.replace(/^sk-(?:ant-|proj-)?/, '')) || /(.)\1{7,}/.test(value) || value.startsWith('${'))) continue
    hits.push({ kind: 'format', label, start: m.index, end: m.index + m[0].length })
  }
  for (const m of text.matchAll(QUOTED)) { const v = m[3]; if (PLACEHOLDER.test(v) || /^[A-Z][A-Z0-9_]+$/.test(v) || (classes(v) < 2 && v.length < 16)) continue; hits.push({ kind: 'assignment', start: m.index + m[1].length, end: m.index + m[0].length }) }
  for (const m of text.matchAll(ENVLINE)) { const v = m[2]; if (PLACEHOLDER.test(v)) continue; hits.push({ kind: 'assignment', start: m.index + m[1].length, end: m.index + m[0].length }) }
  return hits
}
const mustBlock = (t, k) => scan(t, k).some(h => h.kind !== 'assignment')
const KNOWN = ['Hunter2-Staging!', 'q9Zt8mPw']
const clean = [
  'interface Login { password: string }', 'const token = await getToken()', 'headers.authorization = `Bearer ${t}`',
  'api_key: process.env.API_KEY', 'password: z.string().min(8)', 'if (!token) return null', 'url += `?token=${token}`',
  'password = getpass.getpass()', 'password: ${DB_PASSWORD}', 'API_KEY=your-api-key-here', 'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx',
  '请把密码：放在资源库里', '"password": { "type": "string" }', 'password_hash TEXT NOT NULL', 'const secretName = getName()',
  'token: Token | null', 'def login(username: str, password: str) -> bool:', 'export const TOKEN_KEY = "auth"', 'Authorization: Bearer <YOUR_TOKEN>',
  'const pwd = form.get("pwd")', 'apiKey: string;', 'DB_PASSWORD=${DB_PASSWORD}', 'password="changeme"', 'token = "test-token"', 'const jwtSecretEnv = "JWT_SECRET"',
  'retryCount = 0; while (retryCount < MAX) {', 'curl -H "Authorization: Bearer $TOKEN" https://api.example.com', 'git clone https://github.com/a/b.git',
  'ssh-keygen -t ed25519', 'eyJhbGciOiJIUzI1NiJ9 is the header', 'const PASSWORD_MIN = 8', 'tokens.forEach(token => count(token))',
  'postgres://${DB_USER}:${DB_PASS}@localhost/app', 'sk-learn is a library', 'password: process.env.DB_PASSWORD ?? ""'
]
const block = ['my pass is Hunter2-Staging! ok', 'pin=q9Zt8mPw;', 'sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z', 'ghp_' + 'aB3'.repeat(12), 'AKIAIOSFODNN7EXAMPLF',
  '-----BEGIN OPENSSH PRIVATE KEY-----', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'postgres://admin:S3cr3t!pw@db.example.com/app',
  '{"pw":"Hunter2-Staging!"}']
const replaceOnly = ['DB_PASSWORD=Pa55w0rd!2026', 'const apiKey = "a8f5f167f44f4964e6c998dee827110c"', "password: 'Tr0ub4dor&3'", 'export CLIENT_SECRET=9fJ2kLm4Qx']
let fail = 0
for (const s of clean) { const h = scan(s, KNOWN); if (h.length) { fail++; console.log('FALSE-POSITIVE', s, JSON.stringify(h)) } }
for (const s of block) if (!mustBlock(s, KNOWN)) { fail++; console.log('MISSED-BLOCK  ', s) }
for (const s of replaceOnly) { const h = scan(s, KNOWN); if (!h.length || mustBlock(s, KNOWN)) { fail++; console.log('REPLACE-WRONG ', s, JSON.stringify(h)) } }
console.log(`clean=${clean.length} block=${block.length} replaceOnly=${replaceOnly.length} failures=${fail}`)
