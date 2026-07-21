/**
 * Sprint 13 / TASK-070 凭证审计异步队列 Logger
 *
 * 调用点：credential-handlers 的 copy/view/reveal 等敏感事件 →
 *   `auditLogger.record({...})` 立即返回（不阻塞 UI）；
 * 队列满 / 时间窗到 → 批量 flush 到 credential_audit 表。
 *
 * 设计目标：
 *   - record() O(1) 无 DB IO，不阻塞 IPC 响应
 *   - 进程退出前 flushSync（由 app quit hook 接线）
 *   - CSV 导出带 \uFEFF BOM（Excel 友好）
 */

import { EventEmitter } from 'node:events'
import {
  batchInsertAuditRecords,
  listAuditRecords,
  clearAuditRecords
} from '../../db/credential-audit-store'
import type {
  CredentialAuditEntry,
  CredentialAuditListParams,
  CredentialAuditListResult,
  RecordAuditInput
} from '../../types/audit'
import type { AuditQueueOptions, QueuedAudit } from './types'

const DEFAULT_FLUSH_INTERVAL = 500
const DEFAULT_FLUSH_THRESHOLD = 50

export class AuditLogger extends EventEmitter {
  private queue: QueuedAudit[] = []
  private timer: NodeJS.Timeout | null = null
  private readonly flushIntervalMs: number
  private readonly flushThreshold: number
  /** 只允许一个 flush 同步执行（防重入） */
  private flushing = false

  constructor(opts: AuditQueueOptions = {}) {
    super()
    this.flushIntervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL
    this.flushThreshold = opts.flushThreshold ?? DEFAULT_FLUSH_THRESHOLD
  }

  /** 非阻塞入队 */
  record(input: RecordAuditInput): void {
    this.queue.push({ ...input, enqueuedAt: Date.now() })
    if (this.queue.length >= this.flushThreshold) {
      this.flush()
      return
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.flushIntervalMs)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  /** 同步 flush（用于 before-quit hook） */
  flush(): number {
    if (this.flushing) return 0
    if (this.queue.length === 0) return 0
    this.flushing = true
    const batch = this.queue.splice(0, this.queue.length)
    try {
      const n = batchInsertAuditRecords(batch)
      this.emit('flushed', { count: n })
      return n
    } catch (err) {
      // 失败的记录回吐队列头部（避免丢失；下次重试）
      this.queue.unshift(...batch)
      this.emit('error', err)
      return 0
    } finally {
      this.flushing = false
    }
  }

  list(params?: CredentialAuditListParams): CredentialAuditListResult {
    // 查询前先 flush，保证最新记录可见
    this.flush()
    return listAuditRecords(params)
  }

  clear(credentialId?: string): number {
    return clearAuditRecords(credentialId)
  }

  /**
   * 导出 CSV（UTF-8 + BOM）。列：timestamp_iso, action, credential_id,
   * credential_name, actor, metadata_json
   */
  exportCsv(params?: CredentialAuditListParams): string {
    const { items } = this.list({ ...params, limit: 1000 })
    const header = [
      'timestamp_iso',
      'action',
      'credential_id',
      'credential_name',
      'actor',
      'metadata'
    ].join(',')
    const rows = items.map((e) => csvRow(e))
    return '\uFEFF' + header + '\n' + rows.join('\n')
  }

  /** 测试钩子：获取当前队列长度 */
  _queueSize(): number {
    return this.queue.length
  }

  _reset(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.queue = []
    this.flushing = false
  }
}

function csvEscape(val: string | null | undefined): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function csvRow(e: CredentialAuditEntry): string {
  const iso = new Date(e.timestamp).toISOString()
  return [
    csvEscape(iso),
    csvEscape(e.action),
    csvEscape(e.credentialId),
    csvEscape(e.credentialName),
    csvEscape(e.actor),
    csvEscape(e.metadata)
  ].join(',')
}

/** 全局单例（整合人在 credential-handlers 里引入 auditLogger.record(...)） */
export const auditLogger = new AuditLogger()
