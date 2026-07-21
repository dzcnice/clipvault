/**
 * 片段变量替换（P2）
 * 支持：{date} {time} {datetime} {year} {clip}
 */

export function expandSnippetVariables(
  template: string,
  opts?: { clip?: string; now?: Date }
): string {
  const now = opts?.now ?? new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const m = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  const date = `${y}-${m}-${d}`
  const time = `${hh}:${mm}:${ss}`
  const datetime = `${date} ${time}`
  const clip = opts?.clip ?? ''

  return template
    .replace(/\{datetime\}/gi, datetime)
    .replace(/\{date\}/gi, date)
    .replace(/\{time\}/gi, time)
    .replace(/\{year\}/gi, String(y))
    .replace(/\{clip\}/gi, clip)
}
