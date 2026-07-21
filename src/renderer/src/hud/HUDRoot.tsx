/**
 * HUD 独立渲染入口（v2.0 Sprint 6 · TASK-031）
 *
 * 通过 main.tsx 检测 location.hash === '#hud' 决定挂载 HUDRoot 而不是 App。
 */

import CommandRoot from './CommandRoot'

export function HUDRoot(): JSX.Element {
  return (
    <div className="flex h-screen w-screen items-start justify-center bg-transparent p-4">
      <CommandRoot />
    </div>
  )
}

export default HUDRoot
