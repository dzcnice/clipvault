import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { outboundRedact } from '../workbench/redaction'
import type { WorkspaceTurn, WorkspaceTurnFile } from '../../types/session'

const MAX_FILES = 200, MAX_DIFF_LINES = 4000, MAX_LINE = 2000
const count = (value: unknown): number => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0
const text = (value: unknown, max = 2048): string => outboundRedact(String(value ?? '').slice(0, max)).text

/**
 * 校验并脱敏 Host 送回的一轮 workspace-changes 摘要。
 * 路径与差异行都可能含有秘密，入库前逐项脱敏；超出上限的部分直接丢弃。
 */
export function sanitizeWorkspaceTurn(input: Record<string, unknown>): WorkspaceTurn {
  const summary = (input.summary ?? {}) as Record<string, unknown>
  const rawFiles = Array.isArray(summary.files) ? summary.files.slice(0, MAX_FILES) : []
  const diffs = new Map<number, Record<string, unknown>>()
  for (const diff of Array.isArray(input.diffs) ? input.diffs as Array<Record<string, unknown>> : []) if (Number.isSafeInteger(diff?.index)) diffs.set(diff.index as number, diff)
  let budget = MAX_DIFF_LINES
  const files = rawFiles.map((value, index): WorkspaceTurnFile => {
    const file = value as Record<string, unknown>, diff = diffs.get(index)
    const entry: WorkspaceTurnFile = { path: text(file.path), display: text(file.display ?? file.path), added: count(file.added), deleted: count(file.deleted), ...(file.binary ? { binary: true } : {}), ...(file.oversized ? { oversized: true } : {}) }
    if (diff?.kind === 'text' && Array.isArray(diff.hunks) && budget > 0) {
      entry.coarse = diff.coarse === true
      entry.hunks = (diff.hunks as Array<Record<string, unknown>>).map(hunk => {
        const lines = (Array.isArray(hunk.lines) ? hunk.lines : []).slice(0, Math.max(0, budget)).map(line => text(line, MAX_LINE))
        budget -= lines.length
        return { oldStart: count(hunk.oldStart), newStart: count(hunk.newStart), lines }
      }).filter(hunk => hunk.lines.length)
    }
    return entry
  })
  return { turn: count(summary.turn), at: Date.now(), total: count(summary.total), added: count(summary.added), deleted: count(summary.deleted), files }
}

/** 会话上下文面板用：按轮次倒序。 */
export function workspaceTurns(receipts: Array<{ operation: string; data: Record<string, unknown> }>): WorkspaceTurn[] {
  return receipts.filter(item => item.operation === 'workspace_changes').map(item => item.data as unknown as WorkspaceTurn).sort((a, b) => b.at - a.at).slice(0, 20)
}

/** Host 退出后删除官方记录器留下的快照目录（正常情况下 Session 释放时已删除）。 */
export async function removeWorkspaceScratch(home: string): Promise<void> {
  const entries = await readdir(home, { withFileTypes: true }).catch(() => [])
  await Promise.all(entries.filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-workspace-changes-')).map(entry => rm(join(home, entry.name), { recursive: true, force: true }).catch(() => {})))
}
