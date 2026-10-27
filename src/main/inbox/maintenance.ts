import { isUnlocked } from '../crypto/vault'
import { computeSuggestions } from '../clipboard/suggestions'
import { resourceHealth } from '../resources/health'
import { logger } from '../utils/logger'

let timer: ReturnType<typeof setInterval> | undefined
export function refreshLocalSuggestions(): void {
  if (!isUnlocked()) return
  try { computeSuggestions(); resourceHealth(true) } catch { logger.warn('[inbox] 本地建议计算未完成，将在下次重试') }
}
export function startInboxMaintenance(): void {
  if (timer) return
  timer = setInterval(refreshLocalSuggestions, 600000); timer.unref()
}
