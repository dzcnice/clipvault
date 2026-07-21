/**
 * Onboarding 状态管理 Hook · v3.1 无密码个人版
 *
 * React useState + localStorage 持久化。
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  type OnboardingState,
  type OnboardingStepId
} from '../../../types/onboarding'

const INITIAL_STATE: OnboardingState = {
  currentStep: 'welcome',
  completedSteps: [],
  importTriggered: false
}

const VALID_STEPS = new Set(ONBOARDING_STEPS.map((s) => s.id))

function readState(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return INITIAL_STATE
    const parsed = JSON.parse(raw) as Partial<OnboardingState> & {
      /** 旧字段：读入时忽略 */
      masterPasswordReady?: boolean
      veraConfigured?: boolean
    }
    const merged: OnboardingState = {
      currentStep: parsed.currentStep ?? INITIAL_STATE.currentStep,
      completedSteps: parsed.completedSteps ?? [],
      importTriggered: parsed.importTriggered ?? false
    }
    // 旧版步骤（vera/network/overlay/master-password）映射回 welcome
    if (!VALID_STEPS.has(merged.currentStep as OnboardingStepId)) {
      merged.currentStep = 'welcome'
    }
    merged.completedSteps = (merged.completedSteps ?? []).filter((id) =>
      VALID_STEPS.has(id as OnboardingStepId)
    ) as OnboardingStepId[]
    return merged
  } catch {
    return INITIAL_STATE
  }
}

function persistState(next: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* localStorage 不可用时静默失败 */
  }
}

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

export function markOnboarded(value: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, value ? 'true' : 'false')
  } catch {
    /* noop */
  }
}

export interface UseOnboardingResult {
  state: OnboardingState
  stepIndex: number
  totalSteps: number
  isFirstStep: boolean
  isLastStep: boolean
  next: () => void
  prev: () => void
  skip: () => void
  goTo: (id: OnboardingStepId) => void
  markImportTriggered: () => void
  complete: () => void
  reset: () => void
}

export function useOnboarding(): UseOnboardingResult {
  const [state, setState] = useState<OnboardingState>(() => readState())

  useEffect(() => {
    persistState(state)
  }, [state])

  const stepIndex = ONBOARDING_STEPS.findIndex((s) => s.id === state.currentStep)
  const totalSteps = ONBOARDING_STEPS.length

  const goTo = useCallback((id: OnboardingStepId) => {
    setState((prev) => ({ ...prev, currentStep: id }))
  }, [])

  const next = useCallback(() => {
    setState((prev) => {
      const idx = ONBOARDING_STEPS.findIndex((s) => s.id === prev.currentStep)
      const nextStep = ONBOARDING_STEPS[idx + 1]
      const completed = prev.completedSteps.includes(prev.currentStep)
        ? prev.completedSteps
        : [...prev.completedSteps, prev.currentStep]
      return {
        ...prev,
        currentStep: nextStep ? nextStep.id : prev.currentStep,
        completedSteps: completed
      }
    })
  }, [])

  const prev = useCallback(() => {
    setState((cur) => {
      const idx = ONBOARDING_STEPS.findIndex((s) => s.id === cur.currentStep)
      const prevStep = ONBOARDING_STEPS[idx - 1]
      return prevStep ? { ...cur, currentStep: prevStep.id } : cur
    })
  }, [])

  const skip = useCallback(() => {
    setState((cur) => {
      const step = ONBOARDING_STEPS.find((s) => s.id === cur.currentStep)
      if (!step?.skippable) return cur
      const idx = ONBOARDING_STEPS.findIndex((s) => s.id === cur.currentStep)
      const nextStep = ONBOARDING_STEPS[idx + 1]
      return {
        ...cur,
        currentStep: nextStep ? nextStep.id : cur.currentStep
      }
    })
  }, [])

  const markImportTriggered = useCallback(() => {
    setState((cur) => ({ ...cur, importTriggered: true }))
  }, [])

  const complete = useCallback(() => {
    markOnboarded(true)
    setState((cur) => ({
      ...cur,
      completedSteps: ONBOARDING_STEPS.map((s) => s.id)
    }))
  }, [])

  const reset = useCallback(() => {
    markOnboarded(false)
    setState(INITIAL_STATE)
  }, [])

  return {
    state,
    stepIndex: stepIndex < 0 ? 0 : stepIndex,
    totalSteps,
    isFirstStep: stepIndex <= 0,
    isLastStep: stepIndex === totalSteps - 1,
    next,
    prev,
    skip,
    goTo,
    markImportTriggered,
    complete,
    reset
  }
}
