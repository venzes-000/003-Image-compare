import { useEffect, useState } from 'react'
import { Ban, CircleCheck, LoaderCircle, Pause, Play } from 'lucide-react'
import type { AnalysisPhase, AnalysisProgress as Progress } from '../core/types'
import { formatDuration, formatPercent } from '../utils/format'

const PHASES: Array<{ key: AnalysisPhase; label: string }> = [
  { key: 'validating-zip', label: 'ZIP-Datei prüfen' },
  { key: 'collecting-files', label: 'Bilddateien erfassen' },
  { key: 'creating-previews', label: 'Vorschaubilder erzeugen' },
  { key: 'calculating-fingerprints', label: 'Visuelle Fingerabdrücke berechnen' },
  { key: 'searching-candidates', label: 'Kandidaten suchen' },
  { key: 'comparing-candidates', label: 'Kandidaten genauer vergleichen' },
  { key: 'creating-groups', label: 'Gruppen erstellen' },
  { key: 'preparing-results', label: 'Ergebnisse vorbereiten' },
]

interface AnalysisProgressProps {
  progress: Progress
  paused: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}

export function AnalysisProgress({ progress, paused, onPause, onResume, onCancel }: AnalysisProgressProps) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const phaseIndex = PHASES.findIndex((phase) => phase.key === progress.phase)
  const elapsed = progress.startedAt ? now - progress.startedAt : 0
  const executionLabel = progress.execution?.mode === 'worker-pool'
    ? `${progress.execution.workerCount} Bild-Worker aktiv`
    : progress.execution?.mode === 'main-thread'
      ? 'Hauptthread-Kompatibilitätsmodus'
      : undefined
  const currentPhaseElapsed = progress.phaseStartedAt ? Math.max(0, now - progress.phaseStartedAt) : 0
  return (
    <section className="progress-panel card" aria-live="polite" aria-labelledby="progress-title">
      <div className="progress-topline">
        <div><span className="eyebrow">Analyse läuft</span><h2 id="progress-title">{paused ? 'Analyse pausiert' : progress.message}</h2></div>
        <strong className="progress-percent">{formatPercent(progress.percent)}</strong>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Analysefortschritt"><span style={{ width: `${progress.percent}%` }} /></div>
      <dl className="progress-stats">
        <div><dt>Bilder</dt><dd>{progress.processed.toLocaleString('de-DE')} / {progress.total.toLocaleString('de-DE')}</dd></div>
        <div><dt>Kandidaten</dt><dd>{progress.candidates.toLocaleString('de-DE')}</dd></div>
        <div><dt>Vergangene Zeit</dt><dd>{formatDuration(elapsed)}</dd></div>
        {executionLabel && <div><dt>Verarbeitung</dt><dd>{executionLabel}</dd></div>}
        {progress.phaseStartedAt && <div><dt>Aktuelle Phase</dt><dd>{formatDuration(currentPhaseElapsed)}</dd></div>}
      </dl>
      {progress.warning && <p className="notice-message" role="alert">{progress.warning}</p>}
      <ol className="phase-list">
        {PHASES.map((phase, index) => {
          const complete = index < phaseIndex || progress.phase === 'completed'
          const active = index === phaseIndex
          return <li className={complete ? 'complete' : active ? 'active' : ''} key={phase.key}>{complete ? <CircleCheck size={16} aria-hidden="true" /> : active ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <span className="phase-dot" />}{phase.label}</li>
        })}
      </ol>
      <div className="progress-actions">
        {paused ? <button className="button secondary" type="button" onClick={onResume}><Play size={18} aria-hidden="true" /> Analyse fortsetzen</button> : <button className="button secondary" type="button" onClick={onPause}><Pause size={18} aria-hidden="true" /> Analyse pausieren</button>}
        <button className="button ghost danger-text" type="button" onClick={onCancel}><Ban size={18} aria-hidden="true" /> Analyse abbrechen</button>
      </div>
    </section>
  )
}
