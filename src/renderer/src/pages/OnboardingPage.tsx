/**
 * Onboarding · v3.1 无密码三步
 */

import { StepImport } from '../components/onboarding/StepImport'
import { StepRecovery } from '../components/onboarding/StepRecovery'
import { StepShortcut } from '../components/onboarding/StepShortcut'
import { StepWelcome } from '../components/onboarding/StepWelcome'
import { useOnboarding } from '../hooks/useOnboarding'

interface Props {
  vaultInitialized: boolean
  onFinished: () => void
}

export default function OnboardingPage({ onFinished }: Props): JSX.Element {
  const ob = useOnboarding()
  const common = { stepIndex: ob.stepIndex, totalSteps: ob.totalSteps }

  const handleComplete = (): void => {
    ob.complete()
    onFinished()
  }

  switch (ob.state.currentStep) {
    case 'welcome':
      return <StepWelcome {...common} onNext={ob.next} />
    case 'shortcut':
      return (
        <StepShortcut
          {...common}
          onPrev={ob.prev}
          onNext={ob.next}
          onSkip={ob.skip}
        />
      )
    case 'recovery':
      return (
        <StepRecovery
          {...common}
          onPrev={ob.prev}
          onNext={ob.next}
          onSkip={ob.skip}
        />
      )
    case 'import':
      return (
        <StepImport
          {...common}
          onPrev={ob.prev}
          onFinish={handleComplete}
          onSkip={handleComplete}
          onTriggered={ob.markImportTriggered}
          onExitToImport={(tab) => {
            ob.markImportTriggered()
            window.location.hash = `#/import?source=${tab}`
            handleComplete()
          }}
        />
      )
    default:
      return <StepWelcome {...common} onNext={ob.next} />
  }
}
