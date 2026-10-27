// One-shot helper: the main process asks which reminders are due and what the official framing
// text and next target are. All time rules come from @deepseek-ai/dsh-schedule.
import * as Schedule from '@deepseek-ai/dsh-schedule'

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk; if (input.length > 4_000_000) process.exit(2) })
process.stdin.on('end', () => {
  try {
    const { records, now } = JSON.parse(input)
    const oneShot = [], recurring = [], failed = []
    for (const value of records) {
      try {
        const record = Schedule.decodeScheduleRecord(value)
        if (Schedule.isRecurringScheduleRecord(record)) {
          const occurrence = Schedule.resolveRecurringOccurrence(record, now)
          recurring.push({ record, occurrenceAt: occurrence.occurrenceAt, nextScheduledAt: occurrence.nextScheduledAt ?? null })
        } else oneShot.push({ id: record.id, text: Schedule.renderReminderFraming(record) })
      } catch (error) { failed.push({ id: value?.id ?? null, message: error instanceof Error ? error.message : 'invalid record' }) }
    }
    const batch = recurring.length ? Schedule.renderRecurringReminderBatchFraming(recurring.map(item => ({ record: item.record, occurrenceAt: item.occurrenceAt }))) : null
    process.stdout.write(JSON.stringify({ oneShot, recurring: recurring.map(item => ({ id: item.record.id, occurrenceAt: item.occurrenceAt, nextScheduledAt: item.nextScheduledAt })), batch, failed }))
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : 'schedule worker failed' }))
    process.exitCode = 1
  }
})
