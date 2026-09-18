/**
 * 工作区上下文 · v3 个人本地版
 *
 * 运行时固定 `personal`。类型仍保留 `'team'` 字面量，仅用于：
 * - 读取历史库中可能存在的 team 行（不写入新数据）
 * - 兼容旧调用方入参（IPC 会强制归一化为 personal）
 */

/** 工作区：运行时仅 personal；team 为历史兼容 */
export type WorkspaceContext = 'personal' | 'team'
