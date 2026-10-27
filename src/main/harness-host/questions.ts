import { randomUUID } from 'node:crypto'
import type { QuestionAnswer, QuestionItem, UiQuestion } from '../../types/session'
import { boundedText } from '../workbench/input'
import { outboundRedact } from '../workbench/redaction'

export class SessionQuestions {
  private pending = new Map<string, { question: UiQuestion; settle: (answer: QuestionAnswer | null) => void }>()
  constructor(private readonly changed: (question: UiQuestion) => void) {}
  list(sessionId: string): UiQuestion[] { return [...this.pending.values()].map(item => item.question).filter(item => item.sessionId === sessionId) }
  async request(sessionId: string, input: unknown, signal: AbortSignal): Promise<QuestionAnswer> {
    signal.throwIfAborted()
    if (!Array.isArray(input) || input.length < 1 || input.length > 10) throw new Error('追问格式无效')
    const seen = new Set<string>()
    const questions: QuestionItem[] = input.map(value => {
      const item = value as QuestionItem
      const id = boundedText(item.id, '问题 ID', 100, true)
      if (seen.has(id)) throw new Error('问题 ID 重复')
      seen.add(id)
      const options = item.options?.map(option => ({ label: outboundRedact(boundedText(option.label, '选项', 300, true)).text, description: outboundRedact(boundedText(option.description ?? '', '说明', 1000)).text }))
      if (options && options.length > 20) throw new Error('问题选项过多')
      return { id, question: outboundRedact(boundedText(item.question, '问题', 4000, true)).text, ...(item.detail ? { detail: outboundRedact(boundedText(item.detail, '方案内容', 100000)).text } : {}), options, multiSelect: item.multiSelect === true }
    })
    const question: UiQuestion = { id: randomUUID(), sessionId, questions, state: 'open' }
    return new Promise((resolve, reject) => {
      let settled = false
      const abort = (): void => settle(null)
      const settle = (answer: QuestionAnswer | null): void => {
        if (settled) return
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(question.id)
        question.state = answer ? 'answered' : 'cancelled'; question.answer = answer ?? undefined
        this.changed({ ...question })
        if (answer) resolve(answer); else reject(new Error('追问已取消或过期'))
      }
      const timer = setTimeout(abort, 5 * 60_000)
      timer.unref()
      this.pending.set(question.id, { question, settle }); signal.addEventListener('abort', abort, { once: true })
      this.changed({ ...question }); if (signal.aborted) abort()
    })
  }
  answer(id: string, answer: QuestionAnswer): void {
    const entry = this.pending.get(id)
    if (!entry || !Array.isArray(answer?.answers) || answer.answers.length !== entry.question.questions.length) throw new Error('追问已失效或答案不完整')
    const seen = new Set<string>()
    const answers = answer.answers.map(item => {
      const question = entry.question.questions.find(q => q.id === item.id)
      if (!question || seen.has(item.id) || !Array.isArray(item.selected) || (!question.multiSelect && item.selected.length > 1)) throw new Error('答案格式无效')
      seen.add(item.id)
      const labels = question.options?.map(option => option.label) ?? []
      if (item.selected.some(value => !labels.includes(value))) throw new Error('答案选项无效')
      const custom = outboundRedact(boundedText(item.custom ?? '', '回答', 8000)).text
      return { id: item.id, selected: item.selected, ...(custom ? { custom } : {}) }
    })
    entry.settle({ answers })
  }
}
