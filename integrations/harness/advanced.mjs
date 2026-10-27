// Deployment policy around official services; no replacement agent loop or task scheduler.
import Goal from '@deepseek-ai/dsh-goal'
import * as GoalTools from '@deepseek-ai/dsh-tool-goal'
import * as GoalDriver from '@deepseek-ai/dsh-goal-round-driver'
import PlanMode from '@deepseek-ai/dsh-plan-mode'
import * as Todo from '@deepseek-ai/dsh-tool-todo'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as Delegate from '@deepseek-ai/dsh-tool-subagent'
import * as SubagentControl from '@deepseek-ai/dsh-tool-subagent-control'
import Query from '@deepseek-ai/dsh-session-query-sqlite'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import Compaction from '@deepseek-ai/dsh-compaction-basic'

export const name = 'clipvault-advanced'
export const inject = ['agents', 'tools', 'sessionProjections', 'systemPrompt', 'sessionPersistence']
export async function apply(ctx) {
  await ctx.plugin(Goal, { defaultMaxGoalRounds: 8 }).await()
  await ctx.plugin(GoalTools, { blockedAfterConsecutiveRounds: 3 }).await()
  await ctx.plugin(GoalDriver).await()
  await ctx.plugin(PlanMode, { section: '当前为计划模式。可以读取和分析资料、记录待办；不能修改项目文件、运行命令、联网或使用账号资源。完成方案后使用 exit_plan_mode 展示完整计划供用户审阅。批准计划不会取消后续具体操作的审批。' }).await()
  await ctx.plugin(Todo, { allowParallelInProgress: true }).await()
  await ctx.plugin(Query, { path: ':memory:', openAt: 'first-search', maxLimit: 50 }).await()
  await ctx.plugin(TokenMeter).await()
  await ctx.plugin(Compaction, { headroomTokens: 8192, maxTokens: 4096, retainRatio: 0.16, auto: true }).await()
  await ctx.plugin(Subagents, { maxActiveSubagents: 2 }).await()
  await ctx.plugin(Spawn, { providerName: 'spawn' }).await()
  await ctx.plugin(Delegate, { provider: 'spawn', maxDepth: 1 }).await()
  await ctx.plugin(SubagentControl).await()

  const root = process.env.CV_SESSION_ID
  const planMode = ctx.get('planMode')
  const localRead = new Set(['workbench_list_files', 'workbench_read_file', 'workbench_verify_file', 'clipboard_search', 'clipboard_read', 'resource_list'])
  const planning = new Set([...localRead, 'todo_write', 'ask_user_question', 'exit_plan_mode', 'get_goal', 'create_goal', 'update_goal', 'subagent', 'send_message', 'wait', 'list_subagents', 'close_agent', 'interrupt_agent', 'submit_result'])
  // Unlike prompt-only plan mode, this monotonic guard cannot be overridden by another listener.
  ctx.tools.guard(exec => {
    const agent = exec.agent
    if (!agent) return 'This deployment requires an owning agent.'
    const child = agent.session.id !== root
    const mode = planMode.get(agent)
    if (child && !localRead.has(exec.name) && !['todo_write', 'send_message', 'submit_result'].includes(exec.name)) return 'Delegated agents are read-only; return findings to the parent.'
    if ((mode.active || mode.pending === true) && !planning.has(exec.name)) return 'Plan mode is read-only. Ask the user to approve the plan before executing actions.'
    return undefined
  })
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.id !== root) return
    const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/policy`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: root }), signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error('Session policy unavailable')
    const policy = await response.json()
    if (typeof policy.planMode === 'boolean') planMode.set(agent, policy.planMode)
  }, { global: true })
  ctx.systemPrompt.section({ name: 'clipvault:delegation', text: '子 Agent 最多同时两个，深度一层，只读分析；所有修改由父会话处理。子 Agent 共用本轮模型请求额度。只有用户明确提出持续目标时才创建 goal，不要从普通任务推断目标。', order: 1000 })
}
