/**
 * useKeyIntercept：订阅主进程密钥拦截弹窗事件
 */

import { useCallback, useEffect, useState } from 'react'

export interface InterceptPrompt {
  promptId: string
  detectedKeyType: string
  content: string
  contentType: string
}

export type InterceptAction = 'shareAsCredential' | 'saveLocalOnly' | 'cancel'

export interface UseKeyInterceptReturn {
  prompt: InterceptPrompt | null
  decide: (action: InterceptAction) => void
}

export function useKeyIntercept(): UseKeyInterceptReturn {
  const [prompt, setPrompt] = useState<InterceptPrompt | null>(null)

  useEffect(() => {
    const api = window.api?.keyIntercept
    if (!api?.onPrompt) return undefined
    const off = api.onPrompt((p) => {
      setPrompt(p)
    })
    return off
  }, [])

  const decide = useCallback(
    (action: InterceptAction) => {
      if (!prompt) return
      window.api?.keyIntercept?.sendDecision({
        promptId: prompt.promptId,
        action
      })
      setPrompt(null)
    },
    [prompt]
  )

  return { prompt, decide }
}
