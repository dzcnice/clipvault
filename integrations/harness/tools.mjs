import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'clipvault-workbench-tools'
export const inject = ['tools']
export function apply(ctx) {
  const definitions = [
    ['workbench_list_files', 'List a directory inside the task workspace. Paths are relative. Private files and symbolic links are excluded.', { path: { type: 'string' } }],
    ['workbench_read_file', 'Read a UTF-8 project file and its SHA-256. Sensitive fields are redacted; never request secrets.', { path: { type: 'string', required: true } }],
    ['workbench_write_file', 'Propose a complete UTF-8 file revision. The user approves the exact diff before writing. Supply the SHA-256 returned by read_file, or empty for a new file.', { path: { type: 'string', required: true }, content: { type: 'string', required: true }, expectedHash: { type: 'string', required: true } }],
    ['workbench_check_api', 'Ask the local credential broker to check a selected resource at its saved endpoint. No credentials are returned. Requires user approval. Provide expected text to verify the intended capability.', { resourceId: { type: 'string', required: true }, field: { type: 'string', required: true }, expectedText: { type: 'string', required: true } }],
    ['workbench_verify_file', 'Verify a project file by JSON parsing or checking required text. This does not execute project code. Report this scope accurately.', { path: { type: 'string', required: true }, mode: { type: 'string', enum: ['json', 'contains'], required: true }, expectedText: { type: 'string' } }],
    ['workbench_run_check', 'Run node --test, npm test, or npm run test/typecheck/lint/build locally in a text snapshot, reusing installed project dependencies. Requires user approval; no credential environment is injected. This is not an OS sandbox: trusted project scripts can access host files and network. No shell chaining or dependency installation.', { command: { type: 'string', required: true } }]
  ]
  if (process.env.CV_HARNESS_NATIVE === '1') definitions.push(
    ['clipboard_search', 'Search local clipboard history. Returns at most 20 redacted previews; secret entries have only an id.', { query: { type: 'string' }, category: { type: 'string' }, projectId: { type: 'string' }, since: { type: 'number' }, limit: { type: 'number' } }],
    ['clipboard_read', 'Read redacted clipboard text or local OCR text. Sensitive entries cannot be read; suggest saving them as a resource.', { id: { type: 'string', required: true } }],
    ['resource_list', 'Find resource metadata by project or text. Returns ids and field roles, never field values.', { projectId: { type: 'string' }, query: { type: 'string' } }],
    ['resource_use', 'Ask the main-process broker to check an API or open a confirmed login assistant using stored fields. Requires approval for each use. Never receives secrets.', { resourceId: { type: 'string', required: true }, action: { type: 'string', enum: ['check_api', 'fill_login'], required: true }, field: { type: 'string' }, expectedText: { type: 'string' } }],
    ['memory_remember', 'Ask to remember one short, stable fact or preference about the user for future conversations (name to use, preferred language, tech stack, answer style). The user must approve each note. Never store secrets, credentials or one-off task details.', { note: { type: 'string', required: true } }],
    ['resource_propose','Propose resource metadata changes, or a new metadata-only note when resourceId is omitted. Values cannot be changed. A review card requires user confirmation.', { resourceId: { type: 'string' }, patch: { type: 'object', required: true, properties: { name: { type: 'string' }, purpose: { type: 'string' }, projectId: { type: 'string' }, environment: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } }]
  )
  for (const [toolName, description, parameters] of definitions) ctx.tools.register(defineTool({
    name: toolName, description, parameters,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, execution) {
      const response = await fetch(`${process.env.CV_BRIDGE_URL}/tool`, {
        method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ operation: toolName, args, scope: { agentId: execution.agent?.session.id, planMode: ctx.get('planMode')?.get(execution.agent).active === true } }), signal: execution.signal
      })
      if (!response.ok) throw new Error('工作台操作未获批准、已停止或失败，请查看任务记录')
      return await response.text()
    }
  }))
}
