/**
 * Build the ClipVault v3 brand mark and Windows icon set from the generated
 * transparent master. Existing legacy assets stay untouched.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const ROOT = path.join(__dirname, '..')
const RESOURCES = path.join(ROOT, 'resources')
const BRAND_SOURCE = path.join(RESOURCES, 'brand', 'clipvault-logo-v3-source.png')
const LOGO_PATH = path.join(RESOURCES, 'logo-app-v3.png')
const RENDERER_LOGO_PATH = path.join(
  ROOT,
  'src',
  'renderer',
  'src',
  'assets',
  'clipvault-logo-v3.png'
)
const APP_ICON_PATH = path.join(RESOURCES, 'icon-square-v3.png')
const RUNTIME_ICON_PATH = path.join(RESOURCES, 'icon-v3.png')
const ICO_PATH = path.join(RESOURCES, 'icon-v3.ico')

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

function resolveSource() {
  if (fs.existsSync(BRAND_SOURCE)) return BRAND_SOURCE

  const fallback = path.join(RESOURCES, 'icon.png')
  if (fs.existsSync(fallback)) return fallback

  throw new Error('No ClipVault logo source found')
}

async function normalizedMark(inputPath, canvasSize, contentSize) {
  const mark = await sharp(inputPath)
    .trim({ background: TRANSPARENT, threshold: 10 })
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer()

  const offset = Math.round((canvasSize - contentSize) / 2)
  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: TRANSPARENT
    }
  })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer()
}

function createPixelTileSvg() {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <polygon
        points="128,48 896,48 896,80 944,80 944,128 976,128 976,896 944,896 944,944 896,944 896,976 128,976 128,944 80,944 80,896 48,896 48,128 80,128 80,80 128,80"
        fill="#2b2438"
      />
      <polygon
        points="152,104 872,104 872,128 920,128 920,176 944,176 944,848 920,848 920,896 872,896 872,920 152,920 152,896 104,896 104,848 80,848 80,176 104,176 104,128 152,128"
        fill="#f6f0e4"
      />
    </svg>
  `)
}

async function convert() {
  const inputPath = resolveSource()
  console.log('Brand source:', inputPath)

  const logoMaster = await normalizedMark(inputPath, 1024, 896)
  await Promise.all([
    sharp(logoMaster).png().toFile(LOGO_PATH),
    sharp(logoMaster)
      .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toFile(RENDERER_LOGO_PATH)
  ])

  const appMark = await sharp(inputPath)
    .trim({ background: TRANSPARENT, threshold: 10 })
    .resize(700, 700, {
      fit: 'contain',
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer()

  const iconMaster = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: TRANSPARENT
    }
  })
    .composite([
      { input: createPixelTileSvg(), left: 0, top: 0 },
      { input: appMark, left: 162, top: 162 }
    ])
    .png()
    .toBuffer()

  await sharp(iconMaster).png().toFile(APP_ICON_PATH)
  await sharp(iconMaster)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(RUNTIME_ICON_PATH)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const tmpFiles = []
  for (const size of sizes) {
    const tmpPath = path.join(RESOURCES, `_tmp_icon_v3_${size}.png`)
    await sharp(iconMaster)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .sharpen(size <= 32 ? 1.2 : 0.6)
      .png()
      .toFile(tmpPath)
    tmpFiles.push(tmpPath)
  }

  const ico = await pngToIco(tmpFiles)
  fs.writeFileSync(ICO_PATH, ico)
  for (const tmpPath of tmpFiles) fs.unlinkSync(tmpPath)

  console.log('Logo written:', LOGO_PATH)
  console.log('App icon PNG written:', APP_ICON_PATH, RUNTIME_ICON_PATH)
  console.log('Windows icon written:', ICO_PATH)
}

convert().catch((error) => {
  console.error('Error generating ClipVault icons:', error)
  process.exit(1)
})
