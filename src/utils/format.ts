export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value)} ${units[index]}`
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return 'unter 1 Sek.'
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes} Min. ${seconds} Sek.` : `${seconds} Sek.`
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)} %`
}
