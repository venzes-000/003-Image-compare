export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Downloads sind in dieser Umgebung nicht verfügbar.')
  }
  const safeFileName = sanitizeDownloadFileName(fileName)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = safeFileName
  anchor.hidden = true
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}

export function downloadText(content: string, fileName: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([content], { type: mime }), fileName)
}

export function sanitizeDownloadFileName(fileName: string): string {
  const withoutControlCharacters = [...fileName]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || codePoint === 127 ? '_' : character
    })
    .join('')
  const sanitized = withoutControlCharacters
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 180)
  return sanitized.length > 0 ? sanitized : 'bericht'
}

export function reportFileStem(zipName: string): string {
  const withoutZipExtension = zipName.replace(/\.zip$/i, '')
  return sanitizeDownloadFileName(`${withoutZipExtension || 'bildpruefung'}-bericht`)
}
