import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, renameSync, rmSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { harnessNode } from './harness-node.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const destination = join(root, 'resources/harness-runtime')
// Build from an empty directory so removed or renamed chunks cannot enter the installer.
const output = join(root, 'out', `harness-staging-${randomUUID()}`)
const expected = '0.2.1-rc.2'
for (const name of ['dsh', 'dsh-sdk-client', 'dsh-sdk-jsonrpc-server', 'dsh-session', 'dsh-agent-loop']) {
  const pkg = JSON.parse(readFileSync(require.resolve(`@deepseek-ai/${name}/package.json`), 'utf8'))
  if (pkg.version !== expected) throw new Error(`Official Harness package version mismatch: ${name}`)
}
if (process.versions.electron) throw new Error('Build with standalone Node.js')
if (!process.versions.node.startsWith('22.')) throw new Error('Build tools require Node.js 22')
const standaloneNode = await harnessNode(root)
mkdirSync(output, { recursive: true })
const result = await build({
  absWorkingDir: root, entryPoints: { worker: 'integrations/harness/worker.mjs', 'host-worker': 'integrations/harness/host-worker.mjs', runtime: 'integrations/harness/runtime.mjs', 'history-worker': 'integrations/harness/history-worker.mjs', 'pwsh-worker': 'integrations/harness/pwsh-worker.mjs', 'windows-acl-runner': 'integrations/harness/windows-acl-runner.mjs', 'schedule-worker': 'integrations/harness/schedule-worker.mjs' },
  outdir: output, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', target: 'node22', format: 'esm',
  splitting: true, metafile: true, legalComments: 'eof', external: ['@mongodb-js/zstd', 'koffi', '*.node'],
  plugins: [{ name: 'pin-upstream-package-identity', setup(builder) {
    builder.onLoad({ filter: /node_modules[\\/]@deepseek-ai[\\/].*[\\/]lib[\\/].*\.js$/ }, args => {
      const source = readFileSync(args.path, 'utf8')
      const expression = 'createRequire(import.meta.url)("../package.json")'
      if (!source.includes(expression)) return undefined
      const identity = readFileSync(resolve(dirname(args.path), '../package.json'), 'utf8')
      return { contents: source.replaceAll(expression, `(${identity})`), loader: 'js' }
    })
  } }],
  banner: { js: "import { createRequire as __cvCreateRequire } from 'node:module'; const require = __cvCreateRequire(import.meta.url);" }
})
const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
copyFileSync(standaloneNode.path, join(output, nodeName))
function copyTree(from, to, javascriptOnly = false) {
  mkdirSync(to, { recursive: true })
  for (const item of readdirSync(from, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Runtime native dependencies must not be linked')
    if (item.isDirectory()) copyTree(join(from, item.name), join(to, item.name), javascriptOnly)
    else if (!javascriptOnly || /\.(js|cjs|mjs|json)$/.test(item.name)) copyFileSync(join(from, item.name), join(to, item.name))
  }
}
const koffiRoot = dirname(require.resolve('koffi'))
const koffiTarget = join(output, 'node_modules/koffi')
mkdirSync(koffiTarget, { recursive: true })
for (const file of ['index.js', 'index.cjs', 'package.json', 'LICENSE.txt']) copyFileSync(join(koffiRoot, file), join(koffiTarget, file))
copyTree(join(koffiRoot, 'lib'), join(koffiTarget, 'lib'))
copyTree(join(koffiRoot, 'src'), join(koffiTarget, 'src'), true)
const nativeName = `@koromix/koffi-${process.platform}-${process.arch}`
copyTree(join(root, 'node_modules', nativeName), join(output, 'node_modules', nativeName))
function filesIn(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? filesIn(join(path, item.name)) : [join(path, item.name)])
}
const hashes = {}
for (const path of [...Object.keys(result.metafile.outputs).map(path => resolve(root, path)), join(output, nodeName), ...filesIn(join(output, 'node_modules'))]) {
  hashes[relative(output, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex')
}
const packages = new Map()
const licenseRoot = join(output, 'licenses')
mkdirSync(licenseRoot, { recursive: true })
for (const name of readdirSync(join(root, 'integrations/harness/licenses'))) {
  if (name.startsWith('NODE-') && name !== `NODE-${standaloneNode.version}-LICENSE.txt`) continue
  copyFileSync(join(root, 'integrations/harness/licenses', name), join(licenseRoot, name))
}
if (!existsSync(join(licenseRoot, `NODE-${standaloneNode.version}-LICENSE.txt`))) throw new Error('Bundled Node license is missing')
function recordPackage(path) {
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
  if (!pkg.name) return
  const licenseFiles = readdirSync(path).filter(name => /^(license|licence|copying|notice)(\.|$)/i.test(name))
  for (const file of licenseFiles) {
    const name = `${pkg.name.replaceAll('/', '__')}__${file}`
    copyFileSync(join(path, file), join(licenseRoot, name))
  }
  packages.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, license: pkg.license ?? 'SEE SOURCE', source: pkg.repository ?? null, notices: licenseFiles })
}
for (const input of Object.keys(result.metafile.inputs)) {
  let path = dirname(resolve(root, input))
  while (path.startsWith(join(root, 'node_modules'))) {
    if (existsSync(join(path, 'package.json'))) {
      recordPackage(path)
      break
    }
    path = dirname(path)
  }
}
recordPackage(koffiRoot)
recordPackage(join(root, 'node_modules', nativeName))
for (const path of filesIn(licenseRoot)) hashes[relative(output, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex')
writeFileSync(join(output, 'manifest.json'), JSON.stringify({
  format: 1, source: 'https://github.com/deepseek-ai/deepseek-harness', sourceCommit: '687f282e8625c6b8d11ff58211a90524be2e4317',
  sourceTag: 'dsh-v0.2.1-rc.2', version: expected, sdkVersion: expected, nodeVersion: standaloneNode.version,
  platform: process.platform, arch: process.arch, node: nodeName, files: hashes,
  composition: 'official core, advanced services and pwsh + ClipVault approval broker; Windows ACL commands in temporary snapshots; no OnSet code', packages: [...packages.values()]
}, null, 2))
const previous = join(root, 'out', `harness-previous-${randomUUID()}`)
if (existsSync(destination)) {
  if (!lstatSync(destination).isDirectory() || lstatSync(destination).isSymbolicLink()) throw new Error('Runtime output must be an ordinary directory')
  renameSync(destination, previous)
}
try { renameSync(output, destination) }
catch (error) { if (existsSync(previous)) renameSync(previous, destination); throw error }
// Only this build's generated predecessor is removed, after the replacement is complete.
if (existsSync(previous) && dirname(previous) === join(root, 'out') && !lstatSync(previous).isSymbolicLink()) rmSync(previous, { recursive: true })
process.stdout.write(`Official Harness ${expected}: ${Object.keys(hashes).length} runtime files, ${packages.size} bundled packages\n`)
