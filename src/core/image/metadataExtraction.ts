import type { CaptureMetadata } from '../types'

const MAX_TEXT_LENGTH = 200

export async function extractCaptureMetadata(
  buffer: ArrayBuffer,
  archiveModifiedAt?: string,
): Promise<CaptureMetadata> {
  const metadata: CaptureMetadata = {
    ...(archiveModifiedAt ? { archiveModifiedAt } : {}),
    warnings: [],
  }

  try {
    const { parse } = await import('exifr')
    const raw = await parse(new Uint8Array(buffer), {
      ifd0: { pick: ['Make', 'Model', 'Orientation', 'Software'] },
      exif: { pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'SubSecTimeOriginal', 'LensModel'] },
      gps: true,
      mergeOutput: true,
      sanitize: true,
      reviveValues: false,
      xmp: false,
      iptc: false,
      icc: false,
      jfif: false,
      ihdr: false,
    }) as Record<string, unknown> | undefined

    if (!raw) return metadata
    const latitude = finiteNumber(raw.latitude)
    const longitude = finiteNumber(raw.longitude)
    if (latitude !== undefined && longitude !== undefined) {
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        metadata.latitude = latitude
        metadata.longitude = longitude
      } else {
        metadata.warnings.push('Ungültige GPS-Koordinaten wurden verworfen.')
      }
    }

    const altitude = finiteNumber(raw.GPSAltitude)
    if (altitude !== undefined) {
      const altitudeRef = raw.GPSAltitudeRef
      const belowSeaLevel = altitudeRef === 1 || (altitudeRef instanceof Uint8Array && altitudeRef[0] === 1)
      metadata.altitudeMeters = belowSeaLevel ? -altitude : altitude
    }
    const offset = validOffset(raw.OffsetTimeOriginal)
    const captured = normalizeDate(
      raw.DateTimeOriginal ?? raw.CreateDate,
      offset,
      cleanSubseconds(raw.SubSecTimeOriginal),
    )
    if (captured) {
      metadata.capturedAt = captured
      metadata.captureTimeHasTimezone = offset !== undefined
    }
    metadata.cameraMake = cleanText(raw.Make)
    metadata.cameraModel = cleanText(raw.Model)
    metadata.lensModel = cleanText(raw.LensModel)
    metadata.software = cleanText(raw.Software)
    const orientation = finiteNumber(raw.Orientation)
    if (orientation !== undefined && orientation >= 1 && orientation <= 8) {
      metadata.orientation = Math.round(orientation)
    }
  } catch {
    metadata.warnings.push('Vorhandene EXIF-Metadaten konnten nicht vollständig gelesen werden.')
  }

  return metadata
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, MAX_TEXT_LENGTH) : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function validOffset(value: unknown): string | undefined {
  const offset = cleanText(value)
  return offset && /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset) ? offset : undefined
}

function cleanSubseconds(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const digits = value.trim().match(/^\d+$/)?.[0]
  return digits ? digits.slice(0, 3).padEnd(3, '0') : undefined
}

function normalizeDate(value: unknown, offset?: string, subseconds?: string): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
  if (typeof value !== 'string') return undefined

  const match = value.trim().match(
    /^(\d{4}):(0[1-9]|1[0-2]):(0[1-9]|[12]\d|3[01])[ T]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?/,
  )
  if (match) {
    const [, year, month, day, hour, minute, second, inlineSubseconds] = match
    if (Number(year) < 1 || Number(day) > new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()) return undefined
    const milliseconds = (subseconds ?? inlineSubseconds?.slice(0, 3).padEnd(3, '0')) || '000'
    const localIso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}`
    const date = offset
      ? new Date(`${localIso}${offset}`)
      : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds))
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }

  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}
