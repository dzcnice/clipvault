// Static dependency probe only: never mounts a service, starts a timer, or reads user data.
import { build } from 'esbuild'
const packages = ['dsh-api-session-controller', 'dsh-agent-default-model', 'dsh-client-file-upload', 'dsh-api-remote-access', 'dsh-workspace', 'dsh-typert-registry', 'dsh-storage-domain', 'dsh-storage', 'dsh-schedule']
try {
  const result = await build({ stdin: { contents: packages.map((name, index) => `import * as p${index} from '@deepseek-ai/${name}';`).join('\n') + `\nexport const services = [${packages.map((_, index) => `p${index}`).join(',')}];`, resolveDir: process.cwd(), sourcefile: 'schedule-probe.mjs' }, write: false, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent', external: ['koffi', '*.node', '@mongodb-js/zstd'] })
  process.stdout.write(JSON.stringify({ staticBundle: true, services: packages, bytes: result.outputFiles[0].contents.length, mounted: false }) + '\n')
} catch (error) {
  process.stdout.write(JSON.stringify({ staticBundle: false, errors: error.errors?.map(item => item.text), mounted: false }) + '\n')
  process.exitCode = 1
}
