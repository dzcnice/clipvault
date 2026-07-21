const assert = require('assert')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const RESOURCES = path.join(ROOT, 'resources')

async function validatePng(name, width, height, minCoverage, maxCoverage) {
  const filePath = path.join(RESOURCES, name)
  const metadata = await sharp(filePath).metadata()

  assert.equal(metadata.format, 'png', `${name} must be a PNG`)
  assert.equal(metadata.width, width, `${name} width`)
  assert.equal(metadata.height, height, `${name} height`)
  assert.equal(metadata.hasAlpha, true, `${name} must have alpha`)

  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({
    resolveWithObject: true
  })
  const alphaIndex = info.channels - 1
  const pixelCount = info.width * info.height
  let visiblePixels = 0

  for (let index = alphaIndex; index < data.length; index += info.channels) {
    if (data[index] > 0) visiblePixels += 1
  }

  const cornerOffsets = [
    alphaIndex,
    (info.width - 1) * info.channels + alphaIndex,
    (pixelCount - info.width) * info.channels + alphaIndex,
    (pixelCount - 1) * info.channels + alphaIndex
  ]
  for (const offset of cornerOffsets) {
    assert.equal(data[offset], 0, `${name} corners must be transparent`)
  }

  const coverage = visiblePixels / pixelCount
  assert(
    coverage >= minCoverage && coverage <= maxCoverage,
    `${name} visible coverage ${coverage.toFixed(3)} is outside the expected range`
  )

  console.log(`${name}: ${width}x${height}, alpha coverage ${(coverage * 100).toFixed(1)}%`)
}

function validateIco() {
  const filePath = path.join(RESOURCES, 'icon-v3.ico')
  const ico = fs.readFileSync(filePath)
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved header')
  assert.equal(ico.readUInt16LE(2), 1, 'ICO type')

  const count = ico.readUInt16LE(4)
  const sizes = []
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16
    const width = ico[offset] || 256
    const height = ico[offset + 1] || 256
    assert.equal(width, height, `ICO frame ${index} must be square`)
    sizes.push(width)
  }

  const expected = [16, 24, 32, 48, 64, 128, 256]
  assert.deepEqual([...sizes].sort((a, b) => a - b), expected, 'ICO frame sizes')
  console.log(`icon-v3.ico: ${sizes.join(', ')}px`)
}

async function main() {
  await validatePng('logo-app-v3.png', 1024, 1024, 0.45, 0.9)
  await validatePng('icon-square-v3.png', 1024, 1024, 0.75, 0.98)
  await validatePng('icon-v3.png', 512, 512, 0.75, 0.98)
  validateIco()
  console.log('ClipVault v3 icon validation passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
