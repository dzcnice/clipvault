import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { within } from './files'

export const HARNESS_VERSION = '0.2.1-rc.2'
export const HARNESS_COMMIT = '687f282e8625c6b8d11ff58211a90524be2e4317'
export interface RuntimeManifest { version: string; sourceCommit: string; node: string; files: Record<string, string>; platform: string; arch: string }
export async function verifyRuntime(directory: string): Promise<RuntimeManifest> {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as RuntimeManifest
  if (manifest.version !== HARNESS_VERSION || manifest.sourceCommit !== HARNESS_COMMIT || manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error('运行时版本或平台不匹配，请重新构建')
  for (const required of ['worker.mjs', 'runtime.mjs', manifest.node]) if (!manifest.files[required]) throw new Error('运行时缺少关键文件')
  for (const [name, expected] of Object.entries(manifest.files)) {
    const path = resolve(directory, name)
    if (!within(resolve(directory), path)) throw new Error('运行时清单路径无效')
    const hash = createHash('sha256').update(await readFile(path)).digest('hex')
    if (hash !== expected) throw new Error('运行时文件校验失败，请重新构建')
  }
  return manifest
}

/** 不继承父进程 API key、代理、NODE_OPTIONS 或 shell 注入变量。 */
export function workerEnvironment(home: string, bridge: string, token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SystemDrive', 'OS', 'PROCESSOR_ARCHITECTURE']) if (process.env[key]) env[key] = process.env[key]
  return { ...env, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TEMP: home, TMP: home,
    DSH_HOME: home, CV_BRIDGE_URL: bridge, CV_BRIDGE_TOKEN: token, DO_NOT_TRACK: '1', OTEL_SDK_DISABLED: 'true' }
}
