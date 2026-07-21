/**
 * Onboarding · 像素框 + 清晰说明
 */

import type { ReactNode } from 'react'
import { ONBOARDING_STEPS, type OnboardingStepId } from '../../../../types/onboarding'

interface OnboardingLayoutProps {
  stepId: OnboardingStepId
  stepIndex: number
  totalSteps: number
  title: string
  description?: string
  children: ReactNode
  onPrev?: () => void
  onNext?: () => void
  onSkip?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  hidePrev?: boolean
  hideNext?: boolean
  skippable?: boolean
}

export function OnboardingLayout({
  stepId,
  stepIndex,
  totalSteps,
  title,
  description,
  children,
  onPrev,
  onNext,
  onSkip,
  nextLabel = '下一步',
  nextDisabled = false,
  hidePrev = false,
  hideNext = false,
  skippable = false
}: OnboardingLayoutProps): JSX.Element {
  const progress = ((stepIndex + 1) / totalSteps) * 100

  return (
    <div
      className="flex h-screen w-screen items-center justify-center p-6"
      data-testid={`onboarding-step-${stepId}`}
    >
      <div className="cv-panel w-full max-w-2xl space-y-5 p-6 animate-scaleIn">
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>
              步骤 {stepIndex + 1} / {totalSteps}
            </span>
            <div className="flex flex-wrap justify-end gap-1">
              {ONBOARDING_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className="border border-[var(--line)] px-1.5 py-0.5 font-pixel text-[10px] font-bold"
                  style={{
                    background: i <= stepIndex ? 'var(--primary-soft)' : 'var(--surface-2)'
                  }}
                >
                  {s.title}
                </span>
              ))}
            </div>
          </div>
          <div
            className="h-2.5 border-2 border-[var(--line)]"
            style={{ background: 'var(--surface-2)' }}
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
          >
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${progress}%`, background: 'var(--primary)' }}
            />
          </div>
        </div>

        <div>
          <h2 className="font-pixel text-2xl font-bold text-foreground">{title}</h2>
          {description ? (
            <p className="font-body mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div className="min-h-[220px]">{children}</div>

        <div className="flex items-center justify-between border-t-2 border-[var(--line)] pt-4">
          <div>
            {!hidePrev && onPrev ? (
              <button
                type="button"
                className="cv-btn cv-btn-secondary"
                onClick={onPrev}
                data-testid={`onboarding-${stepId}-prev`}
              >
                上一步
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex gap-2">
            {(skippable || ONBOARDING_STEPS[stepIndex]?.skippable) && onSkip ? (
              <button
                type="button"
                className="cv-btn cv-btn-ghost"
                onClick={onSkip}
                data-testid={`onboarding-${stepId}-skip`}
              >
                跳过
              </button>
            ) : null}
            {!hideNext && onNext ? (
              <button
                type="button"
                className="cv-btn cv-btn-primary"
                onClick={onNext}
                disabled={nextDisabled}
                data-testid={`onboarding-${stepId}-next`}
              >
                {nextLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
