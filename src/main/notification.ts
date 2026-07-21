/**
 * 通知管理
 */

import { Notification, nativeImage } from 'electron'
import { join } from 'path'

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
  timeoutType?: 'default' | 'never'
}

let notificationsEnabled = true

/**
 * 显示通知
 */
export function showNotification(options: NotificationOptions): void {
  if (!notificationsEnabled || !Notification.isSupported()) {
    return
  }

  const iconPath = join(__dirname, '../../resources/icon-v3.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  const notification = new Notification({
    title: options.title,
    body: options.body,
    silent: options.silent ?? false,
    icon: icon,
    urgency: options.urgency ?? 'normal',
    timeoutType: options.timeoutType ?? 'default'
  })

  notification.show()
}

/**
 * 显示复制成功通知
 */
export function showCopyNotification(itemName: string): void {
  showNotification({
    title: '已复制到剪贴板',
    body: itemName.length > 50 ? itemName.substring(0, 50) + '...' : itemName,
    silent: true,
    timeoutType: 'default'
  })
}

/**
 * 显示密钥复制成功通知
 */
export function showCredentialCopyNotification(credentialName: string): void {
  showNotification({
    title: '密钥已复制',
    body: `"${credentialName}" 已复制到剪贴板`,
    silent: true,
    timeoutType: 'default'
  })
}

/**
 * 显示剪贴板项目复制通知
 */
export function showClipboardCopyNotification(preview: string): void {
  showNotification({
    title: '已复制',
    body: preview.length > 50 ? preview.substring(0, 50) + '...' : preview,
    silent: true,
    timeoutType: 'default'
  })
}

/**
 * 显示备份完成通知
 */
export function showBackupNotification(success: boolean, message?: string): void {
  showNotification({
    title: success ? '备份完成' : '备份失败',
    body: message ?? (success ? '数据已成功备份' : '备份过程中出现错误'),
    silent: true,
    timeoutType: 'default'
  })
}

/**
 * 启用/禁用通知
 */
export function setNotificationsEnabled(enabled: boolean): void {
  notificationsEnabled = enabled
}

/**
 * 获取通知启用状态
 */
export function isNotificationsEnabled(): boolean {
  return notificationsEnabled
}
