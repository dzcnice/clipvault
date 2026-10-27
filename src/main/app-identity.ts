import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Keep the independently packaged workbench away from the installed app's updater and startup entry. */
export function isWorkbenchPreview(): boolean {
  return ['clipvault-workbench-preview', 'clipvault workbench preview'].includes((app.getName?.() ?? '').toLowerCase())
}

export function configureWorkbenchProfile(): void {
  if (!isWorkbenchPreview()) return
  const profile = join(app.getPath('appData'), 'clipvault-workbench-preview')
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
}
