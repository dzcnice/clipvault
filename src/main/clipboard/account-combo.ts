/**
 * 账号串：一行里用分隔符连起来的「账号 + 密码（+ 附加信息）」，例如
 *   name@example.com|P4ssw0rd!|备用邮箱
 *   myname----P4ssw0rd
 *   name@example.com:P4ssw0rd
 * 只做格式识别，不判断真假；宁可漏判，也不把网址、时间、路径、键值对当成账号。
 */
export interface AccountCombo { username: string; password: string; extras: string[]; separator: string }

const EMAIL = /^[\w.+-]{1,64}@[\w-]+(?:\.[\w-]+)+$/
const USERNAME = /^[\w.@+-]{3,64}$/
const PHONE = /^\+?\d{6,15}$/

function passwordLike(value: string): boolean {
  if (value.length < 6 || value.length > 128 || /\s/.test(value) || /^https?:/i.test(value)) return false
  if (EMAIL.test(value)) return false
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter(pattern => pattern.test(value)).length
  return kinds >= 2 || (value.length >= 10 && /\d/.test(value))
}

export function parseAccountCombo(line: string): AccountCombo | null {
  const text = line.trim()
  if (!text || text.length > 600 || /^https?:\/\//i.test(text) || /^[A-Z]:[\\/]/i.test(text) || /\s{2,}/.test(text.replace(/\t/g, ''))) return null
  for (const separator of ['----', '|', '\t', ':']) {
    const parts = separator === '----' ? text.split(/-{3,}/) : text.split(separator)
    if (parts.length < 2 || parts.length > 8) continue
    const [user, pass, ...extras] = parts.map(part => part.trim())
    if (!user || !pass) continue
    // 冒号最容易误判（时间、键值对、协议）：只接受「邮箱:密码」。
    const userOk = separator === ':' ? EMAIL.test(user) && parts.length === 2 : EMAIL.test(user) || PHONE.test(user) || USERNAME.test(user)
    if (userOk && passwordLike(pass)) return { username: user, password: pass, extras: extras.filter(Boolean), separator }
  }
  return null
}

/** 整段文字是不是账号串清单：至少一半的非空行（最多看 20 行）能解析成账号串。 */
export function looksLikeAccountList(text: string): boolean {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 20)
  if (!lines.length) return false
  const hits = lines.filter(line => parseAccountCombo(line)).length
  return hits >= 1 && hits * 2 >= lines.length
}
