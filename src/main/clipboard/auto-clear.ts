/**
 * TASK-068 剪贴板自动清空（Sprint 13）
 *
 * 当用户复制敏感凭证（密码、API key 等）到系统剪贴板后，
 * 启动 N 秒倒计时；到期校验剪贴板内容仍是当初注册的那条
 * （sha256 比对），未被新内容覆盖时主动清空。
 *
 * 关键设计：
 *   - 单例 + EventEmitter 模式，便于 IPC 注册广播事件
 *   - hash 校验保证不误清用户自己复制的新内容
 *   - schedule 多次会自动取消上一次（最后写入者生效）
 *   - 模块独立，不直接耦合 monitor.ts / credential-handlers
 *     由整合人在外部调用点接线（schedule on copy / cancel on monitor 检测新内容）
 */

import { clipboard } from 'electron'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  AutoClearScheduledEvent,
  AutoClearSkippedEvent,
  AutoClearStatus
} from '../../types/auto-clear'

export interface AutoClearOptions {
  /** TTL 毫秒，默认 30000 */
  ttlMs?: number
}

/** 默认 30s 自动清空 */
export const DEFAULT_AUTO_CLEAR_TTL_MS = 30_000

export class ClipboardAutoClear extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private scheduledHash: string | null = null
  private scheduledAt: number = 0
  private ttlMs: number = DEFAULT_AUTO_CLEAR_TTL_MS

  /**
   * 注册一次自动清空。
   * 由 credential-handlers / CLI 等敏感复制点调用。
   * 若已有挂起任务会被静默覆盖。
   */
  schedule(secret: string, ttlMs?: number): void {
    if (typeof secret !== 'string' || secret.length === 0) {
      // 空内容不调度，避免无意义计时器
      return
    }
    this.cancelInternal(false)
    this.ttlMs = ttlMs && ttlMs > 0 ? ttlMs : DEFAULT_AUTO_CLEAR_TTL_MS
    this.scheduledHash = createHash('sha256').update(secret).digest('hex')
    this.scheduledAt = Date.now()

    const event: AutoClearScheduledEvent = {
      type: 'scheduled',
      hash: this.scheduledHash,
      ttlMs: this.ttlMs,
      scheduledAt: this.scheduledAt
    }
    this.emit('scheduled', event)

    this.timer = setTimeout(() => this.flush(), this.ttlMs)
    // Node 环境下避免阻止进程退出（Electron 主进程通常无影响，测试有用）
    if (typeof this.timer.unref === 'function') {
      this.timer.unref()
    }
  }

  /** 主动取消（用户复制了其他内容 / UI 取消按钮） */
  cancel(): void {
    this.cancelInternal(true)
  }

  private cancelInternal(emit: boolean): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      if (emit) this.emit('cancelled', { type: 'cancelled' })
    }
    this.scheduledHash = null
    this.scheduledAt = 0
  }

  /** 立即清空（UI 提供 "立即清空" 按钮） */
  flushNow(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    this.flush()
  }

  /** 到期清空：校验当前剪贴板 hash 仍与 scheduledHash 相等才清 */
  private flush(): void {
    const expected = this.scheduledHash
    this.timer = null
    if (!expected) return

    let current = ''
    try {
      current = clipboard.readText()
    } catch {
      // 测试 / 沙箱环境下 clipboard 可能不可用，直接走 skipped 路径
      this.scheduledHash = null
      this.scheduledAt = 0
      const skipped: AutoClearSkippedEvent = {
        type: 'skipped',
        reason: 'content-changed'
      }
      this.emit('skipped', skipped)
      return
    }
    const currentHash = createHash('sha256').update(current).digest('hex')
    if (currentHash === expected) {
      try {
        clipboard.writeText('')
      } catch {
        // 写失败也算尝试过，不抛错
      }
      this.emit('cleared', { type: 'cleared' })
    } else {
      const skipped: AutoClearSkippedEvent = {
        type: 'skipped',
        reason: 'content-changed'
      }
      this.emit('skipped', skipped)
    }
    this.scheduledHash = null
    this.scheduledAt = 0
  }

  /** 剩余毫秒数，未调度返回 0 */
  getRemainingMs(): number {
    if (!this.scheduledAt || !this.timer) return 0
    return Math.max(0, this.ttlMs - (Date.now() - this.scheduledAt))
  }

  /** 当前状态快照，IPC status 通道使用 */
  getStatus(): AutoClearStatus {
    return {
      active: this.timer !== null,
      remainingMs: this.getRemainingMs(),
      ttlMs: this.ttlMs
    }
  }

  /** 测试钩子：重置内部状态 */
  _resetForTests(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.scheduledHash = null
    this.scheduledAt = 0
    this.ttlMs = DEFAULT_AUTO_CLEAR_TTL_MS
    this.removeAllListeners()
  }
}

/** 全局单例 */
export const clipboardAutoClear = new ClipboardAutoClear()
