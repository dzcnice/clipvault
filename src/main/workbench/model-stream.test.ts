import { describe, expect, it } from 'vitest'
import { SafeFrameQueue, forwardModelStream } from './model-stream'
import type { ServerResponse } from 'node:http'

describe('safe native model streaming', () => {
  it('releases long safe text before the response ends', () => {
    const output: unknown[] = [], queue = new SafeFrameQueue(() => [], event => output.push(event))
    queue.push({ type: 'content_block_delta', delta: { text: 'a'.repeat(600) } })
    expect(output).toHaveLength(0)
    queue.push({ type: 'content_block_delta', delta: { text: 'b'.repeat(600) } })
    expect(output).toHaveLength(1)
    queue.push({ type: 'message_stop' })
    expect(output).toHaveLength(3)
  })
  it('withholds secrets split across chunks and blocks escaped tool arguments', () => {
    const output: unknown[] = [], secret = 'SYNTHETIC-SPLIT-PASSWORD', queue = new SafeFrameQueue(() => [secret], event => output.push(event))
    queue.push({ type: 'content_block_delta', delta: { text: 'ordinary text '.repeat(70) } })
    queue.push({ type: 'content_block_delta', delta: { text: 'SYNTHETIC-SPLIT-' } })
    expect(() => queue.push({ type: 'content_block_delta', delta: { text: 'PASSWORD' } })).toThrow('敏感')
    expect(JSON.stringify(output)).not.toContain('SYNTHETIC-SPLIT-')
    const escaped = 'synthetic-"-newline\n', guarded = new SafeFrameQueue(() => [escaped], () => { throw new Error('Secret emitted') })
    expect(() => guarded.push({ type: 'content_block_delta', delta: { partial_json: JSON.stringify({ value: escaped }) } })).toThrow('敏感')
  })
  it('converts OpenAI SSE and allows the advertised official question tool only', async () => {
    const chunks = [
      { id: 'synthetic', choices: [{ delta: { tool_calls: [{ index: 0, id: 'question-call', function: { name: 'ask_user_question', arguments: '{"questions":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '[]}' } }] }, finish_reason: 'tool_calls' }] }
    ]
    const upstream = (): Response => new Response(chunks.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n')
    let text = ''
    const output = { headersSent: false, writeHead: () => output, write(value: string) { text += value }, end() {} } as unknown as ServerResponse
    await forwardModelStream(upstream(), output, { openAI: true, model: 'synthetic', allowedTools: ['ask_user_question'], secrets: () => [], signal: new AbortController().signal })
    expect(text).toContain('ask_user_question'); expect(text).toContain('message_stop')
    await expect(forwardModelStream(upstream(), output, { openAI: true, model: 'synthetic', allowedTools: [], secrets: () => [], signal: new AbortController().signal })).rejects.toThrow('未授权工具')
  })
})
