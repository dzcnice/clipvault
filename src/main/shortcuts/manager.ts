/**
 * 快捷键 Manager（v2.0 TASK-007）
 *
 * 功能：
 *   - 从 DB 读取用户自定义 accelerator（表 shortcuts）
 *   - 注册到 globalShortcut；注册失败时记录 isRegistered=false
 *   - register / unregister / update / reset 全生命周期管理
 *   - 暴露 list() 供 IPC 查询
 */

import { BrowserWindow, globalShortcut } from 'electron'
import { logger } from '../utils/logger'
import { getDatabase } from '../../db/connection'
import type { ShortcutCommand, ShortcutCommandId, ShortcutRecord } from './types'
import { buildDefaultCommands } from './registry'

interface ShortcutRow {
  command_id: string
  accelerator: string
  is_default: number
  updated_at: number
}

export class ShortcutManager {
  private mainWindow: BrowserWindow | null = null
  private commands: ShortcutCommand[] = []
  /** 当前运行的 accelerator：command_id -> accelerator */
  private active = new Map<ShortcutCommandId, string>()
  /** 当前是否成功注册 */
  private registered = new Map<ShortcutCommandId, boolean>()

  /** 初始化：绑定窗口、读取 DB、注册全部快捷键 */
  init(window: BrowserWindow): void {
    this.mainWindow = window
    this.commands = buildDefaultCommands(() => this.mainWindow)
    this.loadFromDb()
    this.registerAll()
  }

  /** 从 DB 读取自定义 accelerator，对缺失项使用默认 */
  private loadFromDb(): void {
    try {
      const db = getDatabase()
      const rows = db.prepare('SELECT * FROM shortcuts').all() as ShortcutRow[]
      const dbMap = new Map<string, ShortcutRow>()
      for (const row of rows) dbMap.set(row.command_id, row)

      for (const cmd of this.commands) {
        const row = dbMap.get(cmd.id)
        this.active.set(cmd.id, row?.accelerator || cmd.defaultAccelerator)
      }
    } catch (err) {
      logger.warn('[Shortcuts] loadFromDb failed, falling back to defaults:', err)
      for (const cmd of this.commands) {
        this.active.set(cmd.id, cmd.defaultAccelerator)
      }
    }
  }

  /** 把一条记录写入 DB（INSERT OR REPLACE） */
  private persist(commandId: ShortcutCommandId, accelerator: string, isDefault: boolean): void {
    try {
      const db = getDatabase()
      db.prepare(
        `INSERT OR REPLACE INTO shortcuts (command_id, accelerator, is_default, updated_at)
         VALUES (?, ?, ?, ?)`
      ).run(commandId, accelerator, isDefault ? 1 : 0, Date.now())
    } catch (err) {
      logger.error('[Shortcuts] persist failed:', err)
    }
  }

  /** 尝试注册单个 accelerator；返回是否成功 */
  private tryRegister(cmd: ShortcutCommand, accelerator: string): boolean {
    if (!accelerator) {
      this.registered.set(cmd.id, false)
      return false
    }
    try {
      const ok = globalShortcut.register(accelerator, () => cmd.handler({ commandId: cmd.id }))
      this.registered.set(cmd.id, ok)
      if (!ok) {
        logger.warn(`[Shortcuts] failed to register ${cmd.id}=${accelerator}`)
      }
      return ok
    } catch (err) {
      logger.error(`[Shortcuts] error registering ${cmd.id}=${accelerator}:`, err)
      this.registered.set(cmd.id, false)
      return false
    }
  }

  /** 注册当前 active 中的全部 */
  private registerAll(): void {
    for (const cmd of this.commands) {
      // v2.0 Sprint 6：hud.toggle 由 hud/manager.ts 独立接管 globalShortcut，
      // Manager 层仅在 list() 中展示，不重复注册。
      if (cmd.id === 'hud.toggle') {
        this.registered.set(cmd.id, true)
        continue
      }
      const acc = this.active.get(cmd.id) ?? cmd.defaultAccelerator
      this.tryRegister(cmd, acc)
    }
  }

  /** 取消所有系统注册（用户自定义值仍保留在 DB） */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    for (const id of Array.from(this.registered.keys())) {
      this.registered.set(id, false)
    }
  }

  /** 外部 API：列出当前所有快捷键 */
  list(): ShortcutRecord[] {
    return this.commands.map((cmd) => {
      const current = this.active.get(cmd.id) ?? cmd.defaultAccelerator
      return {
        commandId: cmd.id,
        label: cmd.label,
        defaultAccelerator: cmd.defaultAccelerator,
        currentAccelerator: current,
        isDefault: current === cmd.defaultAccelerator,
        isRegistered: this.registered.get(cmd.id) ?? false
      }
    })
  }

  /**
   * 外部 API：设置某条快捷键
   * 步骤：先取消该条旧 accelerator 的注册 -> 注册新值 -> 持久化。
   * 若新值注册失败（如被其他应用占用），保留旧值并返回 false。
   */
  set(commandId: ShortcutCommandId, accelerator: string): boolean {
    const cmd = this.commands.find((c) => c.id === commandId)
    if (!cmd) {
      logger.warn('[Shortcuts] unknown command id:', commandId)
      return false
    }

    const oldAcc = this.active.get(commandId)
    if (oldAcc) {
      try {
        globalShortcut.unregister(oldAcc)
      } catch (err) {
        logger.warn('[Shortcuts] failed to unregister old accelerator:', err)
      }
    }

    const ok = this.tryRegister(cmd, accelerator)
    if (!ok) {
      // 回滚：重新注册旧值
      if (oldAcc) this.tryRegister(cmd, oldAcc)
      return false
    }

    this.active.set(commandId, accelerator)
    const isDefault = accelerator === cmd.defaultAccelerator
    this.persist(commandId, accelerator, isDefault)
    return true
  }

  /** 外部 API：重置某条（或全部）到默认值 */
  reset(commandId?: ShortcutCommandId): ShortcutRecord[] {
    const targets = commandId
      ? this.commands.filter((c) => c.id === commandId)
      : this.commands

    for (const cmd of targets) {
      const oldAcc = this.active.get(cmd.id)
      if (oldAcc) {
        try {
          globalShortcut.unregister(oldAcc)
        } catch {
          /* ignore */
        }
      }
      this.active.set(cmd.id, cmd.defaultAccelerator)
      this.tryRegister(cmd, cmd.defaultAccelerator)
      this.persist(cmd.id, cmd.defaultAccelerator, true)
    }

    return this.list()
  }
}

// 单例（与 v1 保持一致的"全进程一个 manager"习惯）
export const shortcutManager = new ShortcutManager()
