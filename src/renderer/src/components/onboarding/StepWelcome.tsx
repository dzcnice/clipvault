/**
 * 欢迎 · 像素保险库
 */

import type { LucideIcon } from 'lucide-react'
import { ClipboardList, HardDrive, KeyRound, PanelsTopLeft } from 'lucide-react'
import { OnboardingLayout } from './OnboardingLayout'

interface Props {
  stepIndex: number
  totalSteps: number
  onNext: () => void
  onEnter?: () => void
}

interface Highlight {
  icon: LucideIcon
  title: string
  desc: string
}

const HIGHLIGHTS: Highlight[] = [
  { icon: HardDrive, title: '项目资料', desc: '本地保存，按项目与环境整理' },
  { icon: PanelsTopLeft, title: '编程任务', desc: '选择上下文，批准后连接模型' },
  { icon: ClipboardList, title: '剪贴板', desc: '复制即入包' },
  { icon: KeyRound, title: '账号与密钥', desc: '多字段加密保存，随时复制' }
]

export function StepWelcome({ stepIndex, totalSteps, onNext, onEnter }: Props): JSX.Element {
  return (
    <OnboardingLayout
      stepId="welcome"
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="欢迎来到 ClipVault"
      description="你的个人 AI 编程工作台：剪贴板、账号资料、项目与任务。"
      onNext={onNext}
      nextLabel="开始"
      hidePrev
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.title}
              className="border-2 border-[var(--line)] bg-[var(--surface)] p-3"
              style={{ boxShadow: 'var(--px-shadow-sm)' }}
            >
              <div
                className="cv-icon-slot mb-2 !h-9 !w-9"
                style={{ background: 'var(--primary-soft)' }}
              >
                <Icon size={16} strokeWidth={2.25} />
              </div>
              <div className="font-pixel text-sm font-bold text-foreground">{item.title}</div>
              <p className="font-body mt-1 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          )
        })}
      </div>
      {onEnter && <button className="cv-btn cv-btn-secondary mt-4" onClick={onEnter}>直接进入工作台，稍后设置</button>}
    </OnboardingLayout>
  )
}
