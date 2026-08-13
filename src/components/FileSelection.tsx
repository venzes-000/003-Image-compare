import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Archive, FileCheck2, FolderOpen, Images, Info } from 'lucide-react'
import { APP_LIMITS } from '../core/config/limits'
import { formatBytes } from '../utils/format'

interface FileSelectionProps {
  file?: File
  disabled: boolean
  onSelect: (file: File) => void
}

export function FileSelection({ file, disabled, onSelect }: FileSelectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const selectFile = (candidate?: File) => {
    if (!candidate) return
    if (!candidate.name.toLocaleLowerCase('de-DE').endsWith('.zip')) {
      inputRef.current?.setCustomValidity('Bitte wählen Sie eine ZIP-Datei aus.')
      inputRef.current?.reportValidity()
      return
    }
    inputRef.current?.setCustomValidity('')
    onSelect(candidate)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0])
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled) selectFile(event.dataTransfer.files[0])
  }

  return (
    <section className="file-section card" aria-labelledby="file-title">
      <div className="section-heading">
        <span className="step-number">1</span>
        <div><h2 id="file-title">Bildsammlung auswählen</h2><p>Öffnen Sie eine ZIP-Datei direkt von diesem Gerät.</p></div>
      </div>
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {file ? <FileCheck2 size={38} aria-hidden="true" /> : <Archive size={38} aria-hidden="true" />}
        {file ? (
          <div className="selected-file">
            <strong>{file.name}</strong>
            <span>{formatBytes(file.size)} · zuletzt geändert {new Intl.DateTimeFormat('de-DE').format(file.lastModified)}</span>
          </div>
        ) : (
          <div><strong>ZIP-Datei hier ablegen</strong><span>oder über den Dateidialog auswählen</span></div>
        )}
        <button className="button secondary" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <FolderOpen size={18} aria-hidden="true" /> ZIP-Datei auswählen
        </button>
        <input ref={inputRef} className="sr-only" type="file" accept=".zip,application/zip" onChange={handleChange} disabled={disabled} aria-label="ZIP-Datei auswählen" />
      </div>
      <div className="file-guidance">
        <span><Images size={17} aria-hidden="true" /> JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP und TIFF</span>
        <span><Archive size={17} aria-hidden="true" /> Technisches Maximum: {APP_LIMITS.maxImages.toLocaleString('de-DE')} Bilder</span>
        <span><Info size={17} aria-hidden="true" /> Maximal {formatBytes(APP_LIMITS.maxTotalUncompressedBytes)} entpackt</span>
        <span><Info size={17} aria-hidden="true" /> Tab während der Analyse geöffnet lassen</span>
      </div>
    </section>
  )
}
