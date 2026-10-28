/** Render the built desktop app in a disposable profile; no browser driver or user vault access. */
const { mkdtempSync, writeFileSync, existsSync, readFileSync, appendFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { spawn } = require('node:child_process')
const root = resolve(__dirname, '..'), main = join(root, 'out/main/index.js')
if (!existsSync(main)) throw new Error('Run npm run build first')
const profile = mkdtempSync(join(tmpdir(), 'clipvault-workbench-preview-desktop-'))
writeFileSync(join(profile, 'clipvault-prefs.json'), JSON.stringify({ clipboardMonitorEnabled: false, autoUpdateCheck: false, onboardingTipsSeen: true }))
writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'clipvault-desktop-acceptance', version: require('../package.json').version, main: 'bootstrap.cjs' }))
writeFileSync(join(profile, 'bootstrap.cjs'), `
const { app } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const profile = ${JSON.stringify(profile)}
app.setPath('userData', profile)
app.setName('ClipVault Desktop Acceptance')
app.on('quit', (_event, exitCode) => writeFileSync(join(profile, 'exit.json'), JSON.stringify({ exitCode })))
let captured = false
const report = { passed: false, profile, screenshots: [], errors: [], pages: [] }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
app.on('browser-window-created', (_event, window) => {
  if (captured) return
  captured = true
  const contents = window.webContents
  contents.on('preload-error', () => report.errors.push('preload-error'))
  contents.on('render-process-gone', (_e, details) => report.errors.push('renderer:' + details.reason))
  contents.once('did-finish-load', async () => {
    try {
      // This disposable fixture bypasses first-run introduction, not vault authentication.
      await contents.executeJavaScript("localStorage.setItem('clipvault:onboarded:v2','true')")
      const loaded = new Promise(resolve => contents.once('did-finish-load', resolve))
      contents.reload(); await loaded
      for (const theme of ['light', 'dark']) for (const [route, width, height, title] of [['workbench',1280,820,'新会话'],['workbench',960,640,'新会话'],['projects',960,640,'项目'],['clipboard',960,640,'剪贴板'],['resources',1280,820,'资源库'],['more',960,640,'更多'],['inbox',960,640,'收件箱'],['settings',960,640,'设置'],['history',960,640,'搜索会话历史'],['legacy-tasks',960,640,'历史任务']]) {
        await contents.executeJavaScript('document.documentElement.setAttribute("data-theme", ' + JSON.stringify(theme) + ')')
        window.unmaximize()
        window.setSize(width, height)
        await wait(500)
        await contents.executeJavaScript('location.hash = ' + JSON.stringify('#/' + route))
        let page
        for (let attempt = 0; attempt < 30; attempt++) {
          await wait(150)
          page = await contents.executeJavaScript("({title:document.querySelector('h1')?.textContent||'',text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,api:!!window.api?.workbench})")
          if (page.title.includes(title) && !page.text.includes('正在读取本地资料')) break
        }
        const actual = window.getSize()
        if (!page.api || !page.title.includes(title) || page.overflow || actual[0] !== width || actual[1] !== height || /启动失败|无法打开保险库/.test(page.text)) throw new Error('Desktop page failed: ' + route + ' at ' + actual.join('x') + ' title=' + JSON.stringify(page.title) + ' overflow=' + page.overflow + ' api=' + page.api)
        report.pages.push({ theme, route, requestedSize: [width,height], actualSize: window.getSize(), minimumSize: window.getMinimumSize(), resizable: window.isResizable(), title: page.title, documentOverflow: page.overflow })
        const path = join(profile, route + '-' + width + '-' + theme + '.png')
        writeFileSync(path, (await contents.capturePage()).toPNG()); report.screenshots.push(path)
      }
      report.passed = report.errors.length === 0
    } catch (error) { report.errors.push(error.message) }
    writeFileSync(join(profile, 'report.json'), JSON.stringify(report, null, 2))
    process.stdout.write('DESKTOP_REPORT:' + JSON.stringify(report) + '\\n')
    setTimeout(() => app.quit(), 100)
  })
})
require(${JSON.stringify(main)})
`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
delete env.NODE_OPTIONS
const child = spawn(join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron'), [profile], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let passed = false
child.stdout.on('data', chunk => {
  appendFileSync(join(profile, 'stdout.log'), chunk)
  for (const line of chunk.toString().split(/\r?\n/)) if (line.startsWith('DESKTOP_REPORT:')) { passed = JSON.parse(line.slice(15)).passed; process.stdout.write(line + '\n') }
})
child.stderr.on('data', chunk => appendFileSync(join(profile, 'stderr.log'), chunk))
const timer = setTimeout(() => { process.stderr.write('Desktop acceptance timed out: ' + profile + '\n'); child.kill() }, 60000)
child.once('error', error => { clearTimeout(timer); process.stderr.write(error.message + '\n'); process.exitCode = 1 })
child.once('exit', code => {
  clearTimeout(timer)
  if (existsSync(join(profile, 'report.json'))) {
    const report = JSON.parse(readFileSync(join(profile, 'report.json'), 'utf8'))
    passed = report.passed && code === 0
    writeFileSync(join(profile, 'report.json'), JSON.stringify({ ...report, passed, processExitCode: code, cleanExit: code === 0 }, null, 2))
  }
  child.stdout.destroy(); child.stderr.destroy()
  process.exitCode = passed ? 0 : 1
})
