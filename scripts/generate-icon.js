/**
 * 从品牌主视觉生成 Windows / 通用图标
 *
 * 优先使用 docs/design/logo 下的保险箱设计稿（圆角 App Icon 版），
 * 回退到 resources/icon.png。
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const ROOT = path.join(__dirname, '..')
const RESOURCES = path.join(ROOT, 'resources')
const LOGO_DIR = path.join(ROOT, 'docs', 'design', 'logo')

/** 优先：设计稿 (2) 圆角立体保险箱；否则 icon.png */
function resolveSource() {
  const preferred = path.join(LOGO_DIR, 'ChatGPT Image 2026年4月28日 10_42_56 (2).png')
  if (fs.existsSync(preferred)) return preferred
  const fallback = path.join(RESOURCES, 'icon.png')
  if (fs.existsSync(fallback)) return fallback
  throw new Error('No logo source found')
}

async function convert() {
  const inputPath = resolveSource()
  const squarePath = path.join(RESOURCES, 'icon-square.png')
  const iconPngPath = path.join(RESOURCES, 'icon.png')
  const outputPath = path.join(RESOURCES, 'icon.ico')

  console.log('Source:', inputPath)

  const master = await sharp(inputPath)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  await sharp(master).resize(512, 512).png().toFile(iconPngPath)
  await sharp(master).resize(512, 512).png().toFile(squarePath)
  console.log('PNG written:', iconPngPath, squarePath)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const tmpFiles = []
  for (const s of sizes) {
    const tmp = path.join(RESOURCES, `_tmp_icon_${s}.png`)
    await sharp(master).resize(s, s).png().toFile(tmp)
    tmpFiles.push(tmp)
  }
  const buf = await pngToIco(tmpFiles)
  fs.writeFileSync(outputPath, buf)
  for (const t of tmpFiles) fs.unlinkSync(t)
  console.log('Icon generated successfully:', outputPath)
}

convert().catch((err) => {
  console.error('Error generating icon:', err)
  process.exit(1)
})
