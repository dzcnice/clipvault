const path = require('path')
const { spawn } = require('child_process')

exports.default = async function(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }
  
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(__dirname, '../resources/icon-v3.ico')
  const rceditPath = path.join(__dirname, '../node_modules/rcedit/bin/rcedit-x64.exe')
  
  console.log('Setting icon for:', exePath)
  console.log('Icon path:', iconPath)
  
  return new Promise((resolve, reject) => {
    const proc = spawn(rceditPath, ['--set-icon', iconPath, exePath])
    
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
