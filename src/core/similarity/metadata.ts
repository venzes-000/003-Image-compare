import type { CaptureMetadata, MetadataAssessment } from '../types'

const EARTH_RADIUS_METERS = 6_371_008.8

export function assessMetadata(
  left: CaptureMetadata | undefined,
  right: CaptureMetadata | undefined,
): MetadataAssessment {
  if (!left || !right) return unavailable()

  const evidence: Array<{ score: number; weight: number }> = []
  const reasons: string[] = []
  let supports = 0
  let conflicts = 0
  let gpsDistanceMeters: number | undefined
  let captureTimeDifferenceSeconds: number | undefined
  let sameCameraModel: boolean | undefined

  if (hasCoordinates(left) && hasCoordinates(right)) {
    gpsDistanceMeters = haversineDistanceMeters(
      left.latitude,
      left.longitude,
      right.latitude,
      right.longitude,
    )
    const score = Math.exp(-Math.LN2 * gpsDistanceMeters / 50)
    evidence.push({ score, weight: 0.45 })
    if (gpsDistanceMeters <= 25) {
      supports += 1
      reasons.push(`GPS-Aufnahmeorte liegen nur ${formatDistance(gpsDistanceMeters)} auseinander.`)
    } else if (gpsDistanceMeters >= 5_000) {
      conflicts += 1
      reasons.push(`GPS-Aufnahmeorte liegen ${formatDistance(gpsDistanceMeters)} auseinander.`)
    } else {
      reasons.push(`GPS-Abstand der Aufnahmeorte: ${formatDistance(gpsDistanceMeters)}.`)
    }
  }

  if (left.capturedAt && right.capturedAt) {
    const leftTime = Date.parse(left.capturedAt)
    const rightTime = Date.parse(right.capturedAt)
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      captureTimeDifferenceSeconds = Math.abs(leftTime - rightTime) / 1_000
      evidence.push({
        score: Math.exp(-Math.LN2 * captureTimeDifferenceSeconds / 120),
        weight: 0.35,
      })
      if (captureTimeDifferenceSeconds <= 2) {
        supports += 1
        reasons.push('EXIF-Aufnahmezeiten stimmen praktisch überein.')
      } else if (
        captureTimeDifferenceSeconds > 86_400 &&
        left.captureTimeHasTimezone &&
        right.captureTimeHasTimezone
      ) {
        conflicts += 1
        reasons.push(`EXIF-Aufnahmezeiten unterscheiden sich um ${formatDuration(captureTimeDifferenceSeconds)}.`)
      } else {
        reasons.push(`Abstand der EXIF-Aufnahmezeiten: ${formatDuration(captureTimeDifferenceSeconds)}.`)
      }
    }
  }

  const leftCamera = cameraKey(left)
  const rightCamera = cameraKey(right)
  if (leftCamera && rightCamera) {
    sameCameraModel = leftCamera === rightCamera
    evidence.push({ score: sameCameraModel ? 1 : 0, weight: 0.2 })
    reasons.push(sameCameraModel ? 'Kamerahersteller und Modell stimmen überein.' : 'Die Kameramodelle unterscheiden sich.')
  }

  if (evidence.length === 0) return unavailable()
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0)
  const contextScore = Math.round(
    evidence.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight * 100,
  )
  const status: MetadataAssessment['status'] = conflicts > 0
    ? 'conflicts'
    : supports >= 2
      ? 'corroborates'
      : 'neutral'

  return {
    status,
    contextScore,
    ...(gpsDistanceMeters === undefined ? {} : { gpsDistanceMeters }),
    ...(captureTimeDifferenceSeconds === undefined ? {} : { captureTimeDifferenceSeconds }),
    ...(sameCameraModel === undefined ? {} : { sameCameraModel }),
    reasons,
  }
}

export function haversineDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  for (const value of [latitudeA, longitudeA, latitudeB, longitudeB]) {
    if (!Number.isFinite(value)) throw new RangeError('GPS coordinates must be finite.')
  }
  if (Math.abs(latitudeA) > 90 || Math.abs(latitudeB) > 90 || Math.abs(longitudeA) > 180 || Math.abs(longitudeB) > 180) {
    throw new RangeError('GPS coordinates are outside their valid range.')
  }
  const toRadians = Math.PI / 180
  const latitudeDelta = (latitudeB - latitudeA) * toRadians
  const longitudeDelta = (longitudeB - longitudeA) * toRadians
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA * toRadians) * Math.cos(latitudeB * toRadians) *
    Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

function hasCoordinates(metadata: CaptureMetadata): metadata is CaptureMetadata & { latitude: number; longitude: number } {
  return Number.isFinite(metadata.latitude) && Number.isFinite(metadata.longitude)
}

function cameraKey(metadata: CaptureMetadata): string | undefined {
  const make = normalize(metadata.cameraMake)
  const model = normalize(metadata.cameraModel)
  return model ? `${make ?? ''}|${model}` : undefined
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US')
  return normalized || undefined
}

function unavailable(): MetadataAssessment {
  return { status: 'unavailable', reasons: ['Keine gemeinsam vergleichbaren EXIF-Metadaten vorhanden.'] }
}

function formatDistance(meters: number): string {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1).replace('.', ',')} km`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1).replace('.', ',')} h`
  return `${(seconds / 86_400).toFixed(1).replace('.', ',')} Tage`
}
