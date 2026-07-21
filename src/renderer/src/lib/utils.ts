/**
 * 通用工具：cn(...) 合并 Tailwind class
 *
 * 使用 clsx 处理条件 class，再用 tailwind-merge 解决冲突类（后者覆盖前者）
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
