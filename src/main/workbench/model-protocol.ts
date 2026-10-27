import { randomUUID } from 'node:crypto'

interface Block { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string | Block[] }
interface Message { role: string; content: string | Block[] }
function plain(content: string | Block[] | undefined): string {
  if (typeof content === 'string') return content
  return (content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')
}
/** 仅转换纯文本与函数调用，不开启上游提供方的文件、终端或搜索工具。 */
export function toOpenAI(data: Record<string, unknown>, stream = false): Record<string, unknown> {
  const messages: Record<string, unknown>[] = []
  const system = plain(data.system as string | Block[] | undefined)
  if (system) messages.push({ role: 'system', content: system })
  for (const message of data.messages as Message[]) {
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
    if (blocks.some(block => !['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking'].includes(block.type))) throw new Error('模型协议暂不支持此种资料类型')
    const calls = blocks.filter(block => block.type === 'tool_use').map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }))
    if (message.role === 'assistant') messages.push({ role: 'assistant', content: plain(blocks) || null, ...(calls.length ? { tool_calls: calls } : {}) })
    else {
      for (const block of blocks.filter(block => block.type === 'tool_result')) messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: plain(block.content) })
      if (plain(blocks)) messages.push({ role: 'user', content: plain(blocks) })
    }
  }
  const tools = (data.tools as Array<{ name: string; description?: string; input_schema: unknown }> | undefined)?.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description ?? '', parameters: tool.input_schema } }))
  return { model: data.model, messages, ...(tools?.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
    stream, max_completion_tokens: Math.min(8192, Math.max(256, Number(data.max_tokens) || 4096)) }
}
interface ChatReply {
  id?: string; model?: string; choices?: Array<{ finish_reason: string; message: { content?: string | null; refusal?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}
/** 缓冲完整响应检查秘密后，再发给官方 Harness 的 Messages 适配器。 */
export function fromOpenAI(reply: string, model: string, allowedTools?: string[]): string {
  const data = JSON.parse(reply) as ChatReply, choice = data.choices?.[0]
  if (!choice?.message || choice.message.refusal) throw new Error('模型没有返回可用消息')
  const blocks: Block[] = []
  if (choice.message.content) blocks.push({ type: 'text', text: choice.message.content })
  for (const call of choice.message.tool_calls ?? []) {
    if (call.type !== 'function' || !call.id || !call.function?.name || !(allowedTools ? allowedTools.includes(call.function.name) : call.function.name.startsWith('workbench_'))) throw new Error('模型返回了未支持的工具')
    const input: unknown = JSON.parse(call.function.arguments)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('模型工具参数无效')
    blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
  }
  if (!blocks.length) throw new Error('模型响应为空')
  const events: Record<string, unknown>[] = [{ type: 'message_start', message: { id: data.id ?? randomUUID(), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: 0 } } }]
  blocks.forEach((block, index) => {
    events.push({ type: 'content_block_start', index, content_block: block.type === 'text' ? { type: 'text', text: '' } : { type: 'tool_use', id: block.id, name: block.name, input: {} } })
    events.push({ type: 'content_block_delta', index, delta: block.type === 'text' ? { type: 'text_delta', text: block.text } : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    events.push({ type: 'content_block_stop', index })
  })
  events.push({ type: 'message_delta', delta: { stop_reason: blocks.some(block => block.type === 'tool_use') ? 'tool_use' : choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null }, usage: { output_tokens: data.usage?.completion_tokens ?? 0 } }, { type: 'message_stop' })
  return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}
