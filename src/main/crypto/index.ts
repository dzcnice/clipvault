/**
 * 基于 Electron safeStorage 的凭证加密层
 *
 * 设计定位（P0-1）：
 * - 对接 OS 原生密钥环（Windows DPAPI / macOS Keychain / Linux libsecret）
 * - 用于"免密模式"下保护 DEK，或作为未设置主密码时的最低加密保障
 *
 * Why：避免将密钥明文存入 SQLite；降级路径确保功能在不支持平台也可用
 */

import { safeStorage } from 'electron'

/** 检查当前平台是否支持 safeStorage（未解锁或不支持返回 false） */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * 使用 safeStorage 加密字符串，输出 base64
 * - 若不可用则抛错，由调用方决定降级策略
 */
export function encryptString(plain: string): string {
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage 不可用，无法加密数据')
  }
  const buffer = safeStorage.encryptString(plain)
  return buffer.toString('base64')
}

/** 使用 safeStorage 解密 base64 字符串 */
export function decryptString(cipherBase64: string): string {
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage 不可用，无法解密数据')
  }
  const buffer = Buffer.from(cipherBase64, 'base64')
  return safeStorage.decryptString(buffer)
}

/** 使用 safeStorage 加密 Buffer（用于加密 DEK 这类二进制密钥） */
export function encryptBuffer(plain: Buffer): Buffer {
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage 不可用，无法加密数据')
  }
  return safeStorage.encryptString(plain.toString('base64'))
}

/** 使用 safeStorage 解密 Buffer */
export function decryptBuffer(cipher: Buffer): Buffer {
  if (!isEncryptionAvailable()) {
    throw new Error('safeStorage 不可用，无法解密数据')
  }
  const base64 = safeStorage.decryptString(cipher)
  return Buffer.from(base64, 'base64')
}
