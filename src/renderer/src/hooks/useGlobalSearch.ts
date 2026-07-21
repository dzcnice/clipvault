/**
 * 全局搜索聚焦 ref 管理（C-2）
 *
 * 每个 page 的 search input 通过 SearchBar 的 registerGlobal=true 注册自身，
 * 快捷键 shortcut:focus-search 触发时调 focusGlobalSearch() 聚焦当前活跃 ref。
 *
 * 注意：为了避免 react-hooks/refs 规则（render 期间读取 ref.current），
 * 我们在 useEffect 里读取 ref 并登记全局槽
 */

import { useEffect, type RefObject } from 'react'

let activeInput: HTMLInputElement | null = null

export function registerGlobalSearchInput(el: HTMLInputElement | null): void {
  activeInput = el
}

export function focusGlobalSearch(): void {
  if (activeInput) {
    activeInput.focus()
    activeInput.select()
  }
}

/**
 * 注册 / 注销全局搜索聚焦目标
 * @param enabled 是否把当前 SearchBar 注册为全局目标
 * @param ref     输入框 ref
 */
export function useRegisterGlobalSearch(
  enabled: boolean,
  ref: RefObject<HTMLInputElement>
): void {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    registerGlobalSearchInput(el)
    return () => {
      if (activeInput === el) registerGlobalSearchInput(null)
    }
  }, [enabled, ref])
}
