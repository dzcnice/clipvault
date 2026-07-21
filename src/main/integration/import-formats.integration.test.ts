/**
 * 集成测试 · 场景 6（五种密码管理器格式导入）
 *
 * 用 kdbxweb 即时生成 KDBX fixture；.1pux 手写 zip; Chrome/LastPass/Bitwarden 用纯文本。
 * 目标：不是"测通过"而是观察格式边界、异常路径。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as kdbxweb from 'kdbxweb'

import { parseBitwardenJson } from '../import/bitwarden'
import { parseChromeCsv } from '../import/chrome'
import { parseLastpassCsv } from '../import/lastpass'
import { parseOnepassword } from '../import/onepassword'
import { parseKeepassKdbx, ensureArgon2 } from '../import/keepass'

// ============== 1. Bitwarden ==============
describe('集成 · τ2.6A Bitwarden JSON', () => {
  it('解析标准导出（login/note/card）', () => {
    const exportJson = JSON.stringify({
      encrypted: false,
      folders: [{ id: 'f1', name: 'Personal' }],
      items: [
        {
          type: 1,
          name: 'GitHub',
          folderId: 'f1',
          login: {
            username: 'alice',
            password: 'secret!',
            uris: [{ uri: 'https://github.com' }],
            totp: 'JBSWY3DPEHPK3PXP'
          },
          notes: 'work account'
        },
        {
          type: 2,
          name: 'my note',
          notes: '机密笔记',
          folderId: 'f1'
        },
        {
          type: 3,
          name: 'Visa',
          card: {
            cardholderName: 'Alice',
            number: '4111111111111111',
            expMonth: '12',
            expYear: '2030',
            code: '123',
            brand: 'Visa'
          }
        },
        {
          type: 99, // 未知类型 → skipped
          name: '??'
        }
      ]
    })
    const res = parseBitwardenJson(exportJson)
    expect(res.source).toBe('bitwarden')
    expect(res.items.length).toBe(3)
    expect(res.skipped).toBe(1)
    const login = res.items.find((i) => i.name === 'GitHub')
    expect(login?.value).toBe('secret!')
    expect(login?.metadata?.username).toBe('alice')
    expect(login?.metadata?.totp).toBe('JBSWY3DPEHPK3PXP')
    expect(login?.tags).toContain('bitwarden')
    expect(login?.tags).toContain('Personal')
  })

  it('加密导出应直接报错', () => {
    const encryptedJson = JSON.stringify({ encrypted: true, items: [] })
    expect(() => parseBitwardenJson(encryptedJson)).toThrow(/加密导出/)
  })

  it('畸形 JSON 抛错', () => {
    expect(() => parseBitwardenJson('{not-json')).toThrow(/解析失败/)
  })
})

// ============== 2. Chrome CSV ==============
describe('集成 · τ2.6B Chrome CSV', () => {
  it('按 Chrome 格式导出', () => {
    const csv = `name,url,username,password,note
GitHub,https://github.com,alice,secret1!,
Twitter,https://twitter.com,bob,pwd2,with comma test
`
    const r = parseChromeCsv(csv)
    expect(r.source).toBe('chrome')
    expect(r.items.length).toBe(2)
    expect(r.items[0]!.value).toBe('secret1!')
    expect(r.items[0]!.metadata?.url).toBe('https://github.com')
  })

  it('缺 password 与 username 的行被跳过', () => {
    const csv = `name,url,username,password,note
Orphan,https://x,,,\n`
    const r = parseChromeCsv(csv)
    expect(r.skipped).toBe(1)
    expect(r.items.length).toBe(0)
  })
})

// ============== 3. LastPass CSV ==============
describe('集成 · τ2.6C LastPass CSV', () => {
  it('grouping 按 / 拆成多级 tag', () => {
    const csv = `url,username,password,totp,extra,name,grouping,fav
https://github.com,alice,pw1,,,"GitHub","Work/Dev",1
https://slack.com,bob,pw2,seed,notes,Slack,Team,0
`
    const r = parseLastpassCsv(csv)
    expect(r.items.length).toBe(2)
    const gh = r.items.find((i) => i.name === 'GitHub')
    expect(gh?.tags).toContain('lastpass')
    expect(gh?.tags).toContain('Work')
    expect(gh?.tags).toContain('Dev')
    expect(gh?.tags).toContain('favorite') // fav=1
    const slack = r.items.find((i) => i.name === 'Slack')
    expect(slack?.tags).not.toContain('favorite') // fav=0
  })
})

// ============== 4. 1Password (.1pux) ==============
/** 构造一个最小 .1pux：zip 包含单文件 export.data JSON */
function buildMiniOnePuxBase64(exportData: Record<string, unknown>): string {
  const name = 'export.data'
  const dataBytes = Buffer.from(JSON.stringify(exportData), 'utf-8')
  const uncompressedSize = dataBytes.length
  // 使用 stored method 0
  const compressedSize = uncompressedSize
  const raw = dataBytes

  // Local file header
  const nameBytes = Buffer.from(name, 'utf-8')
  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4) // version needed
  lfh.writeUInt16LE(0, 6) // flags
  lfh.writeUInt16LE(0, 8) // method 0 stored
  lfh.writeUInt16LE(0, 10) // time
  lfh.writeUInt16LE(0, 12) // date
  lfh.writeUInt32LE(0, 14) // crc32 (不验证，手写 0)
  lfh.writeUInt32LE(compressedSize, 18)
  lfh.writeUInt32LE(uncompressedSize, 22)
  lfh.writeUInt16LE(nameBytes.length, 26)
  lfh.writeUInt16LE(0, 28) // extra length
  const lfhBlock = Buffer.concat([lfh, nameBytes, raw])

  // Central directory
  const cdh = Buffer.alloc(46)
  cdh.writeUInt32LE(0x02014b50, 0)
  cdh.writeUInt16LE(20, 4) // version made by
  cdh.writeUInt16LE(20, 6) // version needed
  cdh.writeUInt16LE(0, 8) // flags
  cdh.writeUInt16LE(0, 10) // method
  cdh.writeUInt16LE(0, 12) // time
  cdh.writeUInt16LE(0, 14) // date
  cdh.writeUInt32LE(0, 16) // crc32
  cdh.writeUInt32LE(compressedSize, 20)
  cdh.writeUInt32LE(uncompressedSize, 24)
  cdh.writeUInt16LE(nameBytes.length, 28)
  cdh.writeUInt16LE(0, 30) // extra
  cdh.writeUInt16LE(0, 32) // comment
  cdh.writeUInt16LE(0, 34) // disk
  cdh.writeUInt16LE(0, 36) // internal attrs
  cdh.writeUInt32LE(0, 38) // external attrs
  cdh.writeUInt32LE(0, 42) // local header offset
  const cdhBlock = Buffer.concat([cdh, nameBytes])

  // EOCD
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk
  eocd.writeUInt16LE(0, 6) // disk with cd
  eocd.writeUInt16LE(1, 8) // entries on this disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(cdhBlock.length, 12) // cd size
  eocd.writeUInt32LE(lfhBlock.length, 16) // cd offset
  eocd.writeUInt16LE(0, 20) // comment length

  const zip = Buffer.concat([lfhBlock, cdhBlock, eocd])
  return zip.toString('base64')
}

describe('集成 · τ2.6D 1Password (.1pux)', () => {
  it('裸 JSON export.data 可被解析', () => {
    const json = JSON.stringify({
      accounts: [
        {
          vaults: [
            {
              attrs: { name: 'Private' },
              items: [
                {
                  uuid: 'x1',
                  categoryUuid: '001',
                  overview: { title: 'GitHub', url: 'https://github.com' },
                  details: {
                    loginFields: [
                      { designation: 'username', value: 'alice' },
                      { designation: 'password', value: 'pw1!' }
                    ],
                    notesPlain: 'account note'
                  }
                },
                {
                  uuid: 'x2',
                  categoryUuid: '003',
                  overview: { title: 'Secret Note' },
                  details: { notesPlain: 'top secret stuff' }
                },
                {
                  uuid: 'x3',
                  categoryUuid: '002',
                  overview: { title: 'Visa' },
                  details: {
                    sections: [
                      {
                        fields: [{ id: 'ccnum', value: { string: '4111111111111111' } }]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    })
    const res = parseOnepassword(json)
    expect(res.source).toBe('onepassword')
    expect(res.items.length).toBe(3)
    const login = res.items.find((i) => i.name === 'GitHub')
    expect(login?.value).toBe('pw1!')
    expect(login?.metadata?.username).toBe('alice')
    expect(login?.tags).toContain('1password')
    expect(login?.tags).toContain('vault:Private')
  })

  it('手工 zip 构造的 .1pux（method 0）可被解压', () => {
    const b64 = buildMiniOnePuxBase64({
      accounts: [
        { vaults: [{ items: [{ uuid: '1', categoryUuid: '003', overview: { title: 'N' }, details: { notesPlain: 'hi' } }] }] }
      ]
    })
    const res = parseOnepassword(b64, true)
    expect(res.items.length).toBe(1)
  })

  it('【FIXED BUG-CARD-1】信用卡字段名 "cardNumber" / "ccnum" / "number" / "cc-number" 均可识别', () => {
    // 一个使用 "cardNumber" 字段名的条目 → 修复后能正确拿到卡号
    const json = JSON.stringify({
      accounts: [{ vaults: [{ items: [{
        uuid: 'c1',
        categoryUuid: '002',
        overview: { title: 'CardWithAlternateField' },
        details: { sections: [{ fields: [{ id: 'cardNumber', value: { string: '4111111111111111' } }] }] }
      }] }] }]
    })
    const res = parseOnepassword(json)
    expect(res.items.length).toBe(1)
    expect(res.items[0]!.value).toBe('4111111111111111')
  })
})

// ============== 5. KeePass (.kdbx) ==============
describe('集成 · τ2.6E KeePass (.kdbx)', () => {
  beforeAll(() => {
    ensureArgon2()
  })

  async function buildKdbxBase64(password: string): Promise<string> {
    const cred = new kdbxweb.Credentials(
      kdbxweb.ProtectedValue.fromString(password),
      null
    )
    await cred.ready
    const db = kdbxweb.Kdbx.create(cred, 'IntegrationTest')
    const root = db.getDefaultGroup()
    const group = db.createGroup(root, 'Work')
    const entry = db.createEntry(group)
    entry.fields.set('Title', 'GitHub')
    entry.fields.set('UserName', 'alice')
    entry.fields.set(
      'Password',
      kdbxweb.ProtectedValue.fromString('kdbx-pw-1!')
    )
    entry.fields.set('URL', 'https://github.com')
    entry.fields.set('otp', kdbxweb.ProtectedValue.fromString('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP'))

    const data = await db.save()
    return Buffer.from(new Uint8Array(data)).toString('base64')
  }

  it('正确密码解析出带 TOTP 的条目（type=api_key）', async () => {
    const b64 = await buildKdbxBase64('correct-horse-battery')
    const res = await parseKeepassKdbx(b64, 'correct-horse-battery')
    expect(res.source).toBe('keepass')
    expect(res.items.length).toBe(1)
    const it = res.items[0]!
    expect(it.name).toBe('GitHub')
    expect(it.type).toBe('api_key') // 有 TOTP → api_key
    expect(it.metadata?.totp).toContain('otpauth://totp')
    expect(it.tags).toContain('keepass')
    expect(it.tags).toContain('Work')
  })

  it('错误密码返回 E_WRONG_PASSWORD 错误码', async () => {
    const b64 = await buildKdbxBase64('right-pw')
    await expect(parseKeepassKdbx(b64, 'wrong-pw')).rejects.toMatchObject({
      code: 'E_WRONG_PASSWORD'
    })
  })

  it('完全无效 base64 抛 E_INVALID_KDBX', async () => {
    await expect(
      parseKeepassKdbx(Buffer.from('not-a-kdbx').toString('base64'), 'any')
    ).rejects.toMatchObject({ code: 'E_INVALID_KDBX' })
  })
})

// ============== 6. CSV 解析边界 ==============
describe('集成 · τ2.6F CSV 解析边界', () => {
  it('含引号内逗号的字段应保留（不被切分）', () => {
    const csv = `name,url,username,password,note
"Test, with comma",https://x,alice,pw1,"notes with, comma"
`
    const r = parseChromeCsv(csv)
    expect(r.items.length).toBe(1)
    expect(r.items[0]!.name).toBe('Test, with comma')
    expect(r.items[0]!.metadata?.note).toBe('notes with, comma')
  })

  it('含双引号转义的字段', () => {
    const csv = `name,url,username,password,note
"Contains ""quotes""",https://x,a,b,
`
    const r = parseChromeCsv(csv)
    expect(r.items[0]!.name).toBe('Contains "quotes"')
  })

  it('CRLF 与 LF 混合', () => {
    const csv = 'name,url,username,password,note\r\nX,https://a,u,p,\nY,https://b,u,p,\r\n'
    const r = parseChromeCsv(csv)
    expect(r.items.length).toBe(2)
  })

  it('空表（仅 header）', () => {
    const csv = `name,url,username,password,note\n`
    const r = parseChromeCsv(csv)
    expect(r.items.length).toBe(0)
  })
})
