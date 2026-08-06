import { AlertTriangle, Clipboard } from 'lucide-react'
import type { AppError } from '../core/types'

interface ErrorSummaryProps {
  errors: AppError[]
}

export function ErrorSummary({ errors }: ErrorSummaryProps) {
  if (errors.length === 0) return null
  const copyReport = async () => {
    const report = JSON.stringify({ version: __APP_VERSION__, browser: navigator.userAgent, createdAt: new Date().toISOString(), errors: errors.map(({ code, message, detail, path, phase }) => ({ code, message, detail, path, phase })) }, null, 2)
    await navigator.clipboard.writeText(report)
  }
  return (
    <details className="error-summary card">
      <summary><span><AlertTriangle size={19} aria-hidden="true" /> Fehlerübersicht</span><span className="status warning">{errors.length} Hinweis{errors.length === 1 ? '' : 'e'}</span></summary>
      <ul>{errors.map((error) => <li key={error.id}><strong>{error.message}</strong>{error.path && <span>{error.path}</span>}<small>{error.recoverable ? 'Die übrige Analyse wurde fortgesetzt.' : 'Bitte starten Sie die Analyse nach der Korrektur erneut.'}</small></li>)}</ul>
      <button className="button ghost compact" type="button" onClick={copyReport}><Clipboard size={16} aria-hidden="true" /> Technischen Fehlerbericht kopieren</button>
    </details>
  )
}
