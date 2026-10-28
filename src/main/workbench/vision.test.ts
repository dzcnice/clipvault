import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({}))
import { expandImages, imageMarker, VISION_LIMITS, type VisionImage } from './vision'
import { toOpenAI } from './model-protocol'

const image = (id: string): VisionImage => ({ id, mime: 'image/jpeg', data: `DATA_${id}` })
const ids = Array.from({ length: 6 }, (_, index) => `${index}`.repeat(16).slice(0, 16).replace(/\d/g, d => 'abcdef'[Number(d)] ?? 'a'))

describe('vision markers', () => {
  it('expands markers in user text into ordered image blocks without mutating the request', () => {
    const data = { model: 'x', messages: [{ role: 'user', content: [{ type: 'text', text: `看这张 ${imageMarker('aaaaaaaaaaaaaaaa')} 说说` }] }] }
    const before = JSON.stringify(data)
    const result = expandImages(data, id => image(id))
    expect(JSON.stringify(data)).toBe(before)
    expect(result.count).toBe(1)
    expect((result.data.messages as Array<{ content: unknown }>)[0]!.content).toEqual([
      { type: 'text', text: '看这张 ' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'DATA_aaaaaaaaaaaaaaaa' } }, { type: 'text', text: ' 说说' }])
  })
  it('keeps only the newest images, notes missing ones and never touches tool results or assistant text', () => {
    const messages = [
      ...ids.map(id => ({ role: 'user', content: `图 ${imageMarker(id)}` })),
      { role: 'assistant', content: [{ type: 'text', text: imageMarker(ids[0]!) }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: imageMarker(ids[1]!) }, { type: 'text', text: imageMarker('0123456789abcdef') }] }
    ]
    const result = expandImages({ messages }, id => id === '0123456789abcdef' ? undefined : image(id))
    expect(result.count).toBe(VISION_LIMITS.maxImagesPerRequest)
    const out = result.data.messages as Array<{ role: string; content: Array<{ type: string; text?: string; content?: string }> }>
    expect(out.at(-1)!.content[0]).toMatchObject({ type: 'tool_result', content: imageMarker(ids[1]!) })
    expect(out.at(-1)!.content[1]!.text).toContain('已省略')
    expect(out.at(-2)!.content[0]!.text).toBe(imageMarker(ids[0]!))
    expect(out.slice(0, 2).every(message => message.content.every(block => block.type === 'text' && block.text?.includes('已省略')))).toBe(true)
    expect(out.slice(2, 6).every(message => message.content.some(block => block.type === 'image'))).toBe(true)
  })
  it('replaces every marker with a text note when the model cannot see images', () => {
    const result = expandImages({ messages: [{ role: 'user', content: imageMarker('aaaaaaaaaaaaaaaa') }] }, id => image(id), false)
    expect(result.count).toBe(0)
    expect(JSON.stringify(result.data)).toContain('不支持识图')
  })
  it('converts image blocks to OpenAI-compatible multi-part user content', () => {
    const { data } = expandImages({ messages: [{ role: 'user', content: `问 ${imageMarker('aaaaaaaaaaaaaaaa')}` }] }, id => image(id))
    const body = toOpenAI({ ...data, model: 'm', max_tokens: 100 }) as { messages: Array<{ role: string; content: unknown }> }
    expect(body.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: '问 ' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,DATA_aaaaaaaaaaaaaaaa' } }] })
    expect(() => toOpenAI({ model: 'm', messages: [{ role: 'assistant', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } }] }] })).toThrow('不支持')
  })
})
