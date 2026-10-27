const path = require('path')
const { spawn } = require('child_process')
const fs = require('node:fs')
const { createHash } = require('node:crypto')

exports.default = async function(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  // electron-builder can omit node_modules inside extraResources. Copy the exact
  // verified runtime manifest after its filters, then fail on any missing/extra file.
  const source = path.resolve(__dirname, '../resources/harness-runtime')
  const target = path.join(context.appOutDir, 'resources/harness-runtime')
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'))
  for (const [name, hash] of Object.entries(manifest.files)) {
    const input = path.resolve(source, name), output = path.resolve(target, name)
    for (const [root, file] of [[source, input], [path.resolve(target), output]]) {
      const relative = path.relative(root, file)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid runtime manifest path')
    }
    const info = fs.lstatSync(input)
    if (!info.isFile() || info.isSymbolicLink() || createHash('sha256').update(fs.readFileSync(input)).digest('hex') !== hash) throw new Error('Runtime source integrity check failed')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(input, output)
    if (createHash('sha256').update(fs.readFileSync(output)).digest('hex') !== hash) throw new Error('Packaged runtime integrity check failed')
  }
  fs.copyFileSync(path.join(source, 'manifest.json'), path.join(target, 'manifest.json'))
  const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.relative(target, path.join(directory, entry.name)).replaceAll('\\', '/')])
  if (files(target).some(name => name !== 'manifest.json' && !Object.hasOwn(manifest.files, name))) throw new Error('Unlisted file in packaged runtime')
  console.log('Verified packaged Harness runtime:', Object.keys(manifest.files).length, 'files')
  
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(__dirname, '../resources/icon-v3.ico')
  const rceditPath = path.join(__dirname, '../node_modules/rcedit/bin/rcedit-x64.exe')
  
  console.log('Setting icon for:', exePath)
  console.log('Icon path:', iconPath)
  
  return new Promise((resolve, reject) => {
    const proc = spawn(rceditPath, ['--set-icon', iconPath,
      '--set-file-version', context.packager.appInfo.version, '--set-product-version', context.packager.appInfo.version,
      '--set-version-string', 'ProductName', context.packager.appInfo.productName,
      '--set-version-string', 'FileDescription', context.packager.appInfo.productName, exePath])
    
    proc.stdout.on('data', (data) => console.log(data.toString()))
    proc.stderr.on('data', (data) => console.error(data.toString()))
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('Icon set successfully!')
        resolve()
      } else {
        console.error('Failed to set icon, exit code:', code)
        resolve() // 不阻止打包继续
      }
    })
    
    proc.on('error', (err) => {
      console.error('Failed to set icon:', err.message)
      resolve() // 不阻止打包继续
    })
  })
}
