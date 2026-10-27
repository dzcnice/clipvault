import AttachmentStore, { AttachmentError } from '@deepseek-ai/dsh-attachment'
import { createHash } from 'node:crypto'

/** Main owns encrypted snapshots. The Host only reads explicitly admitted, redacted files. */
export default class VaultAttachments extends AttachmentStore {
  imageLimits = { maxImageBytes: 0, maxImagesPerMessage: 0, maxMessageImageBytes: 0, maxImagePixels: 0, maxImageDimension: 0, mediaTypes: [] }
  async validateImage() { throw new AttachmentError('图片请先使用本地 OCR', 'UNSUPPORTED_IMAGE_TYPE') }
  async saveImage() { return this.validateImage() }
  async readImage() { return this.validateImage() }
  async *readFileStream(ref, signal) {
    if (!/^[a-f0-9]{64}$/.test(ref.attachmentId) || !Number.isSafeInteger(ref.bytes) || ref.bytes > 512_000) throw new AttachmentError('附件引用无效', 'INVALID_ATTACHMENT_REF')
    let offset = 0
    const hash = createHash('sha256')
    do {
      signal?.throwIfAborted()
      const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/attachment`, { method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: process.env.CV_SESSION_ID, ref, offset }), signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]) })
      if (!response.ok) throw new AttachmentError('附件不可读取', 'ATTACHMENT_READ_FAILED')
      const { data, done } = await response.json(), bytes = Buffer.from(data, 'base64')
      if (bytes.length > 65536 || (!done && !bytes.length)) throw new AttachmentError('附件分块无效', 'ATTACHMENT_CORRUPT')
      hash.update(bytes); offset += bytes.length
      if (offset > ref.bytes) throw new AttachmentError('附件长度无效', 'ATTACHMENT_CORRUPT')
      yield bytes
      if (done) break
    } while (offset <= ref.bytes)
    if (offset !== ref.bytes || hash.digest('hex') !== ref.attachmentId) throw new AttachmentError('附件完整性校验失败', 'ATTACHMENT_CORRUPT')
  }
}
export function verifyAttachments(ctx) {
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    if (agent.session.id !== process.env.CV_SESSION_ID && (agent.session.header.parentSession !== process.env.CV_SESSION_ID || agent.session.header.delegationDepth !== 1)) throw new Error('附件会话越界')
    for (const message of messages) for (const block of message.content ?? []) if (block.type === 'file') {
      for await (const bytes of ctx.attachments.readFileStream(block.attachment, signal)) { void bytes }
    }
    return next()
  })
}
