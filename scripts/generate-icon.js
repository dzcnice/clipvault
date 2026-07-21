const pngToIco = require('png-to-ico').default || require('png-to-ico')
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const inputPath = path.join(__dirname, '../resources/icon.png')
const squarePath = path.join(__dirname, '../resources/icon-square.png')
const outputPath = path.join(__dirname, '../resources/icon.ico')

async function convert() {
  try {
    // 先将图片裁剪为正方形 256x256
    await sharp(inputPath)
      .resize(256, 256, { fit: 'cover' })
      .toFile(squarePath)
    console.log('Square PNG created:', squarePath)

    // 转换为 ico
    const buf = await pngToIco(squarePath)
    fs.writeFileSync(outputPath, buf)
    console.log('Icon generated successfully:', outputPath)
  } catch (err) {
    console.error('Error generating icon:', err)
    process.exit(1)
  }
}

convert()
