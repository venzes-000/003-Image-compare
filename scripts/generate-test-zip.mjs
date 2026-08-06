import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import JSZip from 'jszip'
import { PNG } from 'pngjs'

const DEFAULT_OUTPUT = path.join('e2e', 'fixtures', 'baustellenfotos-test.zip')
const FIXTURE_DATE = new Date('2026-01-01T00:00:00.000Z')

function parseOutputPath(argv) {
  const outputIndex = argv.indexOf('--output')
  if (outputIndex === -1) return path.resolve(process.cwd(), DEFAULT_OUTPUT)

  const value = argv[outputIndex + 1]
  if (!value) throw new Error('Nach --output fehlt ein Zielpfad.')
  return path.resolve(process.cwd(), value)
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function createPng(width, height, pixelAt) {
  const png = new PNG({ width, height })

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const [red, green, blue, alpha = 255] = pixelAt(x, y, width, height)
      png.data[index] = clampChannel(red)
      png.data[index + 1] = clampChannel(green)
      png.data[index + 2] = clampChannel(blue)
      png.data[index + 3] = clampChannel(alpha)
    }
  }

  return png
}

function sampleNearest(source, sourceX, sourceY, fallback = [238, 237, 232, 255]) {
  const x = Math.round(sourceX)
  const y = Math.round(sourceY)
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return fallback

  const index = (y * source.width + x) * 4
  return [
    source.data[index],
    source.data[index + 1],
    source.data[index + 2],
    source.data[index + 3],
  ]
}

function createConstructionMotif(width, height) {
  return createPng(width, height, (x, y) => {
    const u = x / Math.max(1, width - 1)
    const v = y / Math.max(1, height - 1)

    // Himmel und Erdreich bilden eine grobe Baustellenszene. Harte Konturen,
    // diagonale Warnmarkierungen und feine Texturen liefern stabile Hash-Fixtures.
    let red = 176 - 36 * v
    let green = 207 - 57 * v
    let blue = 224 - 91 * v

    if (v > 0.58) {
      red = 154 + 34 * v
      green = 126 + 27 * v
      blue = 89 + 18 * v
    }

    const pipe = u > 0.14 && u < 0.86 && v > 0.64 && v < 0.77
    if (pipe) {
      red = 51
      green = 112
      blue = 151
    }

    const excavatorBody = u > 0.54 && u < 0.78 && v > 0.42 && v < 0.62
    const excavatorArm = Math.abs(v - (0.78 - u * 0.58)) < 0.035 && u > 0.29 && u < 0.64
    if (excavatorBody || excavatorArm) {
      red = 232
      green = 166
      blue = 33
    }

    const wheelA = (u - 0.59) ** 2 + ((v - 0.64) * 1.5) ** 2 < 0.0038
    const wheelB = (u - 0.75) ** 2 + ((v - 0.64) * 1.5) ** 2 < 0.0038
    if (wheelA || wheelB) {
      red = 48
      green = 50
      blue = 48
    }

    const barrier = u > 0.07 && u < 0.32 && v > 0.47 && v < 0.68
    if (barrier) {
      const stripe = Math.floor((u * 7 + v * 5) * 8) % 2 === 0
      red = stripe ? 221 : 247
      green = stripe ? 68 : 239
      blue = stripe ? 49 : 224
    }

    const texture = ((x * 17 + y * 29 + (x ^ y) * 3) % 13) - 6
    return [red + texture, green + texture, blue + texture, 255]
  })
}

function resize(source, width, height) {
  return createPng(width, height, (x, y) => {
    const sourceX = (x / Math.max(1, width - 1)) * (source.width - 1)
    const sourceY = (y / Math.max(1, height - 1)) * (source.height - 1)
    return sampleNearest(source, sourceX, sourceY)
  })
}

function brighten(source, amount) {
  return createPng(source.width, source.height, (x, y) => {
    const [red, green, blue, alpha] = sampleNearest(source, x, y)
    return [red + amount, green + amount, blue + amount, alpha]
  })
}

function applyJpegLikeArtifacts(source) {
  return createPng(source.width, source.height, (x, y) => {
    const [red, green, blue, alpha] = sampleNearest(source, x, y)
    const blockBias = ((Math.floor(x / 8) + Math.floor(y / 8)) % 3 - 1) * 2
    const quantize = (value, step) => Math.round((value + blockBias) / step) * step
    return [quantize(red, 10), quantize(green, 12), quantize(blue, 14), alpha]
  })
}

function crop(source, left, top, width, height) {
  return createPng(width, height, (x, y) => sampleNearest(source, x + left, y + top))
}

function rotate(source, angleInDegrees) {
  const radians = (angleInDegrees * Math.PI) / 180
  const cosine = Math.cos(-radians)
  const sine = Math.sin(-radians)
  const centerX = (source.width - 1) / 2
  const centerY = (source.height - 1) / 2

  return createPng(source.width, source.height, (x, y) => {
    const offsetX = x - centerX
    const offsetY = y - centerY
    const sourceX = offsetX * cosine - offsetY * sine + centerX
    const sourceY = offsetX * sine + offsetY * cosine + centerY
    return sampleNearest(source, sourceX, sourceY)
  })
}

function createDifferentMotif(width, height, variant) {
  return createPng(width, height, (x, y) => {
    const u = x / Math.max(1, width - 1)
    const v = y / Math.max(1, height - 1)

    if (variant === 'checker') {
      const light = (Math.floor(x / 18) + Math.floor(y / 18)) % 2 === 0
      return light ? [66, 126, 84, 255] : [217, 228, 205, 255]
    }

    const wave = Math.sin(u * Math.PI * 8 + v * Math.PI * 3)
    return [42 + 32 * wave, 74 + 48 * v, 151 + 62 * u, 255]
  })
}

function encodePng(png) {
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    bitDepth: 8,
    deflateLevel: 9,
  })
}

function addFile(zip, name, data, compression = 'DEFLATE') {
  zip.file(name, data, {
    date: FIXTURE_DATE,
    createFolders: false,
    compression,
    compressionOptions: compression === 'DEFLATE' ? { level: 6 } : undefined,
  })
}

async function main() {
  const outputPath = parseOutputPath(process.argv.slice(2))
  const base = createConstructionMotif(240, 160)
  const baseBytes = encodePng(base)
  const zip = new JSZip()

  addFile(zip, 'baustelle/bauabschnitt-a/original.png', baseBytes)
  addFile(zip, 'baustelle/bauabschnitt-a/kopie-anderer-name.png', baseBytes)
  addFile(zip, 'baustelle/bauabschnitt-a/skaliert-180x120.png', encodePng(resize(base, 180, 120)))
  addFile(zip, 'baustelle/bauabschnitt-a/heller.png', encodePng(brighten(base, 24)))
  addFile(zip, 'baustelle/bauabschnitt-a/jpeg-artige-kompression.png', encodePng(applyJpegLikeArtifacts(base)))
  addFile(zip, 'baustelle/bauabschnitt-a/leichter-zuschnitt.png', encodePng(crop(base, 12, 8, 216, 144)))
  addFile(zip, 'baustelle/bauabschnitt-a/leicht-gedreht.png', encodePng(rotate(base, 3)))
  addFile(zip, 'baustelle/bauabschnitt-b/anderes-motiv-karos.png', encodePng(createDifferentMotif(220, 150, 'checker')))
  addFile(zip, 'baustelle/bauabschnitt-c/anderes-motiv-wellen.png', encodePng(createDifferentMotif(200, 170, 'waves')))
  addFile(zip, 'hinweise/nicht-unterstuetzt.txt', 'Diese Datei muss von der Bildanalyse ignoriert werden.\n')
  addFile(zip, 'baustelle/beschaedigt.jpg', Buffer.from('keine gueltige JPEG-Datei\n', 'utf8'), 'STORE')

  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  })

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, archive)
  process.stdout.write(`Test-ZIP erzeugt: ${outputPath} (${archive.length} Bytes)\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Test-ZIP konnte nicht erzeugt werden: ${message}\n`)
  process.exitCode = 1
})
