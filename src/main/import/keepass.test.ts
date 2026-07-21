/**
 * KeePass .kdbx 导入单元测试
 *
 * 用 kdbxweb 即时创建 in-memory KDBX，再 save → 得到 ArrayBuffer → base64
 * 塞给 parseKeepassKdbx，避免依赖磁盘样本文件。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as kdbxweb from 'kdbxweb'
import {
  parseKeepassKdbx,
  ensureArgon2,
  E_WRONG_PASSWORD,
  E_INVALID_KDBX
} from './keepass'

// 测试 fixture 生成也会用到 Argon2（save 阶段）
ensureArgon2()

function ab2b64(ab: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(ab)).toString('base64')
}

async function buildSampleKdbx(password: string, keyFile?: Uint8Array): Promise<string> {
  const cred = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(password),
    keyFile ?? null
  )
  await cred.ready
  const db = kdbxweb.Kdbx.create(cred, 'Test DB')

  const root = db.getDefaultGroup()

  // 1) 标准登录条目（Personal 组）
  const personal = db.createGroup(root, 'Personal')
  const e1 = db.createEntry(personal)
  e1.fields.set('Title', 'GitHub')
  e1.fields.set('UserName', 'alice')
  e1.fields.set('Password', kdbxweb.ProtectedValue.fromString('s3cret!'))
  e1.fields.set('URL', 'https://github.com')
  e1.fields.set('Notes', 'work account')
  e1.tags = ['dev']

  // 2) 含 TOTP 的条目 → 应被识别为 api_key
  const work = db.createGroup(root, 'Work')
  const e2 = db.createEntry(work)
  e2.fields.set('Title', 'AWS Console')
  e2.fields.set('UserName', 'root')
  e2.fields.set('Password', kdbxweb.ProtectedValue.fromString('pw2'))
  e2.fields.set('otp', kdbxweb.ProtectedValue.fromString('otpauth://totp/aws?secret=JBSWY3DPEHPK3PXP'))

  // 3) 含自定义字段
  const e3 = db.createEntry(work)
  e3.fields.set('Title', 'Custom')
  e3.fields.set('Password', kdbxweb.ProtectedValue.fromString('pw3'))
  e3.fields.set('API-Key', kdbxweb.ProtectedValue.fromString('xx-yyy'))
  e3.fields.set('Server', 'prod.example.com')

  // 4) 只有 Notes 的 secure-note 型
  const e4 = db.createEntry(personal)
  e4.fields.set('Title', 'My Note')
  e4.fields.set('Notes', 'just a note')

  // 5) 空条目（会被跳过）
  db.createEntry(personal)

  const ab = await db.save()
  return ab2b64(ab)
}

describe('parseKeepassKdbx', () => {
  let sampleB64: string
  const PASSWORD = 'correct-horse-battery-staple'

  beforeAll(async () => {
    sampleB64 = await buildSampleKdbx(PASSWORD)
  }, 30_000)

  it('正确密码：解密并映射全部非空条目', async () => {
    const r = await parseKeepassKdbx(sampleB64, PASSWORD)
    expect(r.source).toBe('keepass')
    // e1..e4 共 4 条，e5 空被跳过
    expect(r.items).toHaveLength(4)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('字段映射：Title/Password/UserName/URL/Notes', async () => {
    const r = await parseKeepassKdbx(sampleB64, PASSWORD)
    const github = r.items.find((i) => i.name === 'GitHub')
    expect(github).toBeDefined()
    expect(github?.value).toBe('s3cret!')
    expect(github?.metadata?.username).toBe('alice')
    expect(github?.metadata?.url).toBe('https://github.com')
    expect(github?.metadata?.note).toBe('work account')
    // tag 来自 group + entry.tags + 默认 keepass
    expect(github?.tags).toEqual(expect.arrayContaining(['keepass', 'Personal', 'dev']))
  }, 30_000)

  it('TOTP 存在时推断为 api_key', async () => {
    const r = await parseKeepassKdbx(sampleB64, PASSWORD)
    const aws = r.items.find((i) => i.name === 'AWS Console')
    expect(aws).toBeDefined()
    expect(aws?.type).toBe('api_key')
    expect(aws?.metadata?.totp).toContain('otpauth://')
    expect(aws?.tags).toEqual(expect.arrayContaining(['Work']))
  }, 30_000)

  it('自定义字段进入 metadata.customFields', async () => {
    const r = await parseKeepassKdbx(sampleB64, PASSWORD)
    const custom = r.items.find((i) => i.name === 'Custom')
    expect(custom).toBeDefined()
    const cf = custom?.metadata?.customFields as
      | Array<{ name: string; value: string; protected: boolean }>
      | undefined
    expect(cf).toBeDefined()
    const names = (cf ?? []).map((x) => x.name).sort()
    expect(names).toContain('API-Key')
    expect(names).toContain('Server')
    const apiKey = cf?.find((x) => x.name === 'API-Key')
    expect(apiKey?.value).toBe('xx-yyy')
    expect(apiKey?.protected).toBe(true)
    const server = cf?.find((x) => x.name === 'Server')
    expect(server?.protected).toBe(false)
  }, 30_000)

  it('只有 Notes 的条目 → type=text', async () => {
    const r = await parseKeepassKdbx(sampleB64, PASSWORD)
    const note = r.items.find((i) => i.name === 'My Note')
    expect(note).toBeDefined()
    expect(note?.type).toBe('text')
    expect(note?.value).toBe('just a note')
  }, 30_000)

  it('错误密码 → E_WRONG_PASSWORD', async () => {
    await expect(parseKeepassKdbx(sampleB64, 'wrong-password')).rejects.toMatchObject({
      code: E_WRONG_PASSWORD
    })
  }, 30_000)

  it('损坏文件 → E_INVALID_KDBX', async () => {
    // 随便塞点 base64 噪声
    const junk = Buffer.from('not a real kdbx file at all, just some bytes here').toString(
      'base64'
    )
    await expect(parseKeepassKdbx(junk, 'whatever')).rejects.toMatchObject({
      code: E_INVALID_KDBX
    })
  }, 30_000)

  it('密钥文件：构造时带 keyFile → 需同样 keyFile 才能解开', async () => {
    const keyFile = new Uint8Array(32)
    for (let i = 0; i < 32; i++) keyFile[i] = i
    // 注意：kdbxweb.Credentials 的 setKeyFile 会"消费"传入的 binary，
    // 因此先 base64 保存拷贝，再把 keyFile 传给 build。
    const keyFileB64 = Buffer.from(keyFile).toString('base64')
    const b64 = await buildSampleKdbx('pw', new Uint8Array(keyFile))

    // 正确 keyFile
    const r = await parseKeepassKdbx(b64, 'pw', keyFileB64)
    expect(r.source).toBe('keepass')
    expect(r.items.length).toBeGreaterThan(0)

    // 无 keyFile → 失败
    await expect(parseKeepassKdbx(b64, 'pw')).rejects.toMatchObject({
      code: E_WRONG_PASSWORD
    })
  }, 30_000)
})
