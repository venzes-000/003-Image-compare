import { Braces, Download, FileSpreadsheet, ListChecks } from 'lucide-react'

interface ExportPanelProps {
  disabled: boolean
  onCsv: () => void
  onJson: () => void
  onCleanedList: () => void
}

export function ExportPanel({ disabled, onCsv, onJson, onCleanedList }: ExportPanelProps) {
  return (
    <section className="export-panel card" aria-labelledby="export-title">
      <div><span className="eyebrow">Prüfnachweis</span><h2 id="export-title">Ergebnisse exportieren</h2><p>Die Berichte enthalten Dateipfade, Messwerte und Ihre Entscheidungen – keine Originalbilder.</p></div>
      <div className="export-actions">
        <button className="button secondary" type="button" disabled={disabled} onClick={onCsv}><FileSpreadsheet size={18} aria-hidden="true" /> CSV-Bericht</button>
        <button className="button secondary" type="button" disabled={disabled} onClick={onJson}><Braces size={18} aria-hidden="true" /> JSON-Bericht</button>
        <button className="button secondary" type="button" disabled={disabled} onClick={onCleanedList}><ListChecks size={18} aria-hidden="true" /> Bereinigte Dateiliste</button>
      </div>
      <small><Download size={14} aria-hidden="true" /> Downloads werden nur lokal in diesem Browser erzeugt.</small>
    </section>
  )
}
