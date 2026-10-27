import * as store from '../../db/workbench-store'
import { isUnlocked, onVaultLocked } from '../crypto/vault'
import { redactScanned, scanSecrets, type SecretHit } from './secret-scan'

let cached: string[] = [], signature = ''
export function invalidateSecretCache(): void { cached = []; signature = '' }
onVaultLocked(invalidateSecretCache)

/** Main-process only. Metadata revisions invalidate secrets, including historical field versions. */
export function allResourceSecrets(): string[] {
  if (!isUnlocked()) { invalidateSecretCache(); throw new Error('请先解锁本地资料库') }
  const resources = store.listResources()
  const stamp = JSON.stringify(resources.map(item => [item.id, item.version, item.state]))
  if (stamp !== signature) {
    cached = store.resourceSecrets(resources.map(item => item.id))
    signature = stamp
  }
  return [...cached]
}
export function redactForOutput(text: string, secrets = allResourceSecrets()): { text: string; redacted: boolean } {
  return redactScanned(text, secrets)
}
export const outboundRedact = redactForOutput
export function findBlockingSecret(text: string, secrets = allResourceSecrets()): SecretHit | null { return scanSecrets(text, secrets).find(hit => hit.kind !== 'assignment') ?? null }
export function findPossibleSecret(text: string): SecretHit | null { return scanSecrets(text, []).find(hit => hit.kind === 'assignment') ?? null }
export function containsSecrets(text: string, secrets: string[]): boolean {
  return secrets.some(secret => secret && (text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1))))
}
export function redactOutboundValue(value: unknown, secrets = allResourceSecrets()): unknown {
  if (typeof value === 'string') return redactForOutput(value, secrets).text
  if (Array.isArray(value)) return value.map(item => redactOutboundValue(item, secrets))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactOutboundValue(item, secrets)]))
  return value
}
