/**
 * Sprint 14 · TASK-072 AutoUpdater 发布通道
 *
 * 将 'stable' / 'beta' 映射到 electron-updater 的 allowPrerelease & channel 字段
 */

import type { UpdateChannel } from '../../types/updater'

export interface ChannelConfig {
  allowPrerelease: boolean
  channel: string
}

export function resolveChannel(channel: UpdateChannel): ChannelConfig {
  switch (channel) {
    case 'beta':
      return { allowPrerelease: true, channel: 'beta' }
    case 'stable':
    default:
      return { allowPrerelease: false, channel: 'latest' }
  }
}

const VALID_CHANNELS: ReadonlySet<UpdateChannel> = new Set<UpdateChannel>([
  'stable',
  'beta'
])

export function isValidChannel(v: unknown): v is UpdateChannel {
  return typeof v === 'string' && VALID_CHANNELS.has(v as UpdateChannel)
}
