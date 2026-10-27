// `schedule` service for the official reminder tools (@deepseek-ai/dsh-tool-schedule).
// Records are built with the official Schedule domain functions; storage, timers and delivery
// live in the main process (encrypted, bound to this Session). This is a host adapter, not the
// official Web ScheduleService, which needs the Web SessionController and storage-domain.
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import * as Schedule from '@deepseek-ai/dsh-schedule'
import * as ScheduleTools from '@deepseek-ai/dsh-tool-schedule'

export const name = 'clipvault-schedule'
export const inject = ['tools', 'systemPrompt']

async function call(action, body = {}, signal) {
  const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/schedule`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, action, sessionId: process.env.CV_SESSION_ID }), signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])])
  })
  if (!response.ok) throw new Error('schedule storage unavailable')
  return response.json()
}

function build(id, request, now, title) {
  if (request.at !== undefined) return Schedule.createAtScheduleRecord(id, request.prompt, request.at, now, title)
  if (request.after_seconds !== undefined) return Schedule.createAfterScheduleRecord(id, request.prompt, request.after_seconds, now, title)
  if (request.every_seconds !== undefined) return Schedule.createEveryScheduleRecord(id, request.prompt, request.every_seconds, now, title)
  if (request.daily !== undefined) return Schedule.createDailyScheduleRecord(id, request.prompt, request.daily, now, title)
  if (request.weekly !== undefined) return Schedule.createWeeklyScheduleRecord(id, request.prompt, request.weekly, now, title)
  if (request.cron !== undefined) return Schedule.createCronScheduleRecord(id, request.prompt, request.cron, now, title)
  throw new Schedule.ScheduleInputError('invalid_selector', 'Exactly one reminder selector is required.')
}
const SELECTORS = { at: 'at', every: 'every_seconds', daily: 'daily', weekly: 'weekly', cron: 'cron' }

export async function apply(ctx) {
  const root = process.env.CV_SESSION_ID
  const own = sessionId => {
    if (sessionId !== root) throw new Schedule.ScheduleInputError('subagent_session', 'Reminders can only be created in the top-level conversation.')
  }
  ctx.provide('schedule', {
    async create(sessionId, request, signal) {
      own(sessionId)
      const selectors = ['at', 'after_seconds', 'every_seconds', 'daily', 'weekly', 'cron'].filter(key => request[key] !== undefined)
      if (selectors.length !== 1) throw new Schedule.ScheduleInputError('invalid_selector', 'Exactly one reminder selector is required.')
      const record = build(Schedule.ScheduleId(`schedule-${randomUUID()}`), request, Date.now(), Schedule.scheduleTitle(request.title))
      return (await call('create', { record }, signal)).record
    },
    async list(request) { own(request.sessionId); return (await call('list')).records },
    async catalog() { return (await call('catalog')).entries },
    async history(request) { own(request.sessionId); return call('history', { id: request.id, limit: request.limit, before: request.before }) },
    async delete(request, signal) { own(request.sessionId); return call('delete', { id: request.id }, signal) },
    async update(request, signal) {
      own(request.sessionId)
      const { current, status } = await call('get', { id: request.id }, signal)
      if (!current) return { id: request.id, updated: false, code: 'schedule_not_found' }
      if (status === 'inactive') return { id: request.id, updated: false, code: 'schedule_ended' }
      if (!isDeepStrictEqual(current, request.expected)) return { id: request.id, updated: false, code: 'schedule_conflict' }
      const title = request.title === undefined ? current.title : Schedule.scheduleTitle(request.title)
      const prompt = request.prompt === undefined ? current.prompt : request.prompt
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Schedule.ScheduleInputError('invalid_prompt', 'prompt must be non-empty.')
      const record = request.change
        ? build(current.id, { prompt, [SELECTORS[request.change.kind]]: request.change[SELECTORS[request.change.kind]] }, Date.now(), title)
        : { ...current, title, prompt }
      if (isDeepStrictEqual(record, current)) return { id: request.id, updated: false, record: current }
      return call('replace', { id: request.id, previous: current, record }, signal)
    }
  })
  await ctx.plugin(ScheduleTools).await()
  ctx.systemPrompt.section({ name: 'clipvault:schedule', text: '用户明确要求稍后提醒、定时继续或周期检查时，使用 schedule_create 创建提醒并写清标题；不要自行推断提醒。到期提醒会作为新消息发回本会话，仍需用户批准发送。时间规则使用用户所在时区 Asia/Shanghai，除非用户另有说明。', order: 1002 })
}
