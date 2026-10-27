import { describe, expect, it } from 'vitest'
import { toOpenAI, fromOpenAI } from './model-protocol'
import { assertReplyHasNoSecrets } from './bridge'

describe('OpenAI-compatible model bridge', () => {
  it('preserves the assistant tool call and its result identity in a resumed exchange', () => {
    const result = toOpenAI({ model: 'fixture', system: [{ type: 'text', text: 'rules' }], messages: [
      { role: 'user', content: 'read file' },
      { role: 'assistant', content: [{ type: 'thinking', text: 'private reasoning' }, { type: 'tool_use', id: 'call-1', name: 'workbench_read_file', input: { path: 'a.ts' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: 'file content' }] }] }
    ], tools: [{ name: 'workbench_read_file', input_schema: { type: 'object' } }] })
    expect(result).toMatchObject({ model: 'fixture', stream: false, messages: [
      { role: 'system', content: 'rules' }, { role: 'user', content: 'read file' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', function: { name: 'workbench_read_file', arguments: '{"path":"a.ts"}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'file content' }
    ] })
    expect(JSON.stringify(result)).not.toContain('private reasoning')
  })
  it('converts text and tool arguments to official Messages events, rejecting malformed calls and secret echoes', () => {
    const reply = fromOpenAI(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: 'check', tool_calls: [{ id: 'call', type: 'function', function: { name: 'workbench_verify_file', arguments: '{"path":"a.json","mode":"json"}' } }] } }] }), 'fixture')
    expect(reply).toContain('message_stop')
    expect(reply).toContain('tool_use')
    expect(() => fromOpenAI('{"choices":[]}', 'fixture')).toThrow()
    const echo = fromOpenAI(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'REPLY-CANARY' } }] }), 'fixture')
    expect(() => assertReplyHasNoSecrets(echo, ['REPLY-CANARY'])).toThrow('受保护')
  })
})
