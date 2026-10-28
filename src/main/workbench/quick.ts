import { app } from 'electron'
import { mkdir, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import * as store from '../../db/workbench-store'
import type { WorkProject } from '../../types/workbench'

/**
 * 随手问的工作目录：与资料目录同级的独立空目录（不能放在资料目录内，
 * 否则项目目录校验会拒绝；也不放进用户主目录的任何代码位置）。
 */
export function quickDirectory(): string {
  const userData = app.getPath('userData')
  return join(dirname(userData), `${basename(userData)}-quick`)
}

export async function quickProject(): Promise<WorkProject> {
  const directory = quickDirectory()
  await mkdir(directory, { recursive: true })
  return store.ensureQuickProject(await realpath(directory))
}
