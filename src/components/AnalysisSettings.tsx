import { Cpu, Database, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { settingsForMode } from '../core/config/limits'
import type { AnalysisSettings as Settings, SensitivityMode } from '../core/types'

interface AnalysisSettingsProps {
  settings: Settings
  cacheEnabled: boolean
  disabled: boolean
  onChange: (settings: Settings) => void
  onCacheChange: (enabled: boolean) => void
  onClearCache: () => void
}

const MODES: Array<{ value: SensitivityMode; title: string; detail: string }> = [
  { value: 'strict', title: 'Streng', detail: 'Beinahe identische Aufnahmen, möglichst wenige Fehlalarme.' },
  { value: 'balanced', title: 'Ausgeglichen', detail: 'Empfohlen für den ersten Durchlauf.' },
  { value: 'sensitive', title: 'Sensitiv', detail: 'Findet mehr Zuschnitte und Varianten; mehr manuelle Prüfung.' },
]

export function AnalysisSettings({ settings, cacheEnabled, disabled, onChange, onCacheChange, onClearCache }: AnalysisSettingsProps) {
  const selectMode = (mode: SensitivityMode) => onChange(settingsForMode(mode, settings.workerCount))
  return (
    <section className="settings card" aria-labelledby="settings-title">
      <div className="section-heading">
        <span className="step-number">2</span>
        <div><h2 id="settings-title">Prüfung einstellen</h2><p>Die Werte lassen sich später mit echten Baustellenfotos kalibrieren.</p></div>
      </div>
      <fieldset className="mode-picker" disabled={disabled}>
        <legend>Empfindlichkeit</legend>
        {MODES.map((mode) => (
          <label className={settings.mode === mode.value ? 'mode active' : 'mode'} key={mode.value}>
            <input type="radio" name="mode" value={mode.value} checked={settings.mode === mode.value} onChange={() => selectMode(mode.value)} />
            <span><strong>{mode.title}</strong><small>{mode.detail}</small></span>
          </label>
        ))}
      </fieldset>
      <details className="advanced-settings">
        <summary><SlidersHorizontal size={18} aria-hidden="true" /> Erweiterte Einstellungen</summary>
        <div className="advanced-grid">
          <label>
            <span><Cpu size={16} aria-hidden="true" /> Parallele Bildanalysen <output>{settings.workerCount}</output></span>
            <input type="range" min="1" max="4" step="1" value={settings.workerCount} disabled={disabled} onChange={(event) => onChange({ ...settings, workerCount: Number(event.target.value) })} />
          </label>
          <label><span>pHash-Grenzwert <output>{settings.pHashThreshold}</output></span><input type="range" min="4" max="28" value={settings.pHashThreshold} disabled={disabled} onChange={(event) => onChange({ ...settings, pHashThreshold: Number(event.target.value) })} /></label>
          <label><span>Mindest-SSIM <output>{settings.minimumSsim.toFixed(2)}</output></span><input type="range" min="0.5" max="0.98" step="0.01" value={settings.minimumSsim} disabled={disabled} onChange={(event) => onChange({ ...settings, minimumSsim: Number(event.target.value) })} /></label>
          <button className="text-button" type="button" disabled={disabled} onClick={() => onChange(settingsForMode(settings.mode, settings.workerCount))}><RotateCcw size={16} aria-hidden="true" /> Standardwerte wiederherstellen</button>
        </div>
      </details>
      <div className="cache-setting">
        <label>
          <input type="checkbox" checked={cacheEnabled} disabled={disabled || typeof indexedDB === 'undefined'} onChange={(event) => onCacheChange(event.target.checked)} />
          <span><Database size={18} aria-hidden="true" /><strong>Analyse lokal zwischenspeichern</strong><small>Optional. Speichert kleine Vorschauen, Merkmale, Entscheidungen und vorhandene EXIF-/GPS-Daten auf diesem Gerät – keine Originalbilder.</small></span>
        </label>
        <button className="text-button danger-text" type="button" disabled={disabled || typeof indexedDB === 'undefined'} onClick={onClearCache}>Lokale Analysedaten löschen</button>
      </div>
    </section>
  )
}
