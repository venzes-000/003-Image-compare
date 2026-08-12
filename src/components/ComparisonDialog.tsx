import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertTriangle, Blend, Columns2, Contrast, Minus, Move, Plus, X } from 'lucide-react'
import type { CandidateEdge, ImageFeatureRecord } from '../core/types'
import { effectiveCandidateRotationDegrees, rotatedImageFitScale } from '../core/clustering'
import { useThumbnailUrl } from '../hooks/useThumbnailUrl'
import { formatBytes, formatCoordinates, formatDistanceMeters, formatDuration } from '../utils/format'

type ViewMode = 'side' | 'overlay' | 'difference'

interface ComparisonDialogProps {
  reference: ImageFeatureRecord
  candidate: ImageFeatureRecord
  edge?: CandidateEdge
  onClose: () => void
}

export function ComparisonDialog({ reference, candidate, edge, onClose }: ComparisonDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const dragOrigin = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | undefined>(undefined)
  const referenceUrl = useThumbnailUrl(reference.thumbnailKey)
  const candidateUrl = useThumbnailUrl(candidate.thumbnailKey)
  const [mode, setMode] = useState<ViewMode>('side')
  const [opacity, setOpacity] = useState(50)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = openerRef.current
    if (dialog && !dialog.open) dialog.showModal()
    closeRef.current?.focus()
    const handleCancel = (event: Event) => { event.preventDefault(); onClose() }
    dialog?.addEventListener('cancel', handleCancel)
    return () => {
      dialog?.removeEventListener('cancel', handleCancel)
      opener?.focus()
    }
  }, [onClose])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
  }
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current
    if (!origin) return
    setOffset({ x: origin.offsetX + event.clientX - origin.x, y: origin.offsetY + event.clientY - origin.y })
  }

  const candidateRotation = effectiveCandidateRotationDegrees(edge, candidate.id)
  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
  const imageStyle = { transform }
  const overlayFitScale = mode === 'side'
    ? 1
    : rotatedImageFitScale(reference.aspectRatio, candidate.aspectRatio, candidateRotation)
  const candidateImageStyle = { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom * overlayFitScale}) rotate(${candidateRotation}deg)` }
  const alignedCandidateAspect = candidateRotation === 90 || candidateRotation === 270
    ? 1 / candidate.aspectRatio
    : candidate.aspectRatio
  const differentAspect = Math.abs(reference.aspectRatio - alignedCandidateAspect) / Math.max(reference.aspectRatio, alignedCandidateAspect) > 0.05

  return (
    <dialog ref={dialogRef} className="comparison-dialog" aria-labelledby="comparison-title">
      <div className="comparison-shell">
        <header>
          <div><span className="eyebrow">Detailprüfung</span><h2 id="comparison-title">Bilder vergleichen</h2></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Vergleichsansicht schließen"><X aria-hidden="true" /></button>
        </header>
        <div className="comparison-toolbar" aria-label="Darstellung">
          <div className="segmented-control">
            <button className={mode === 'side' ? 'active' : ''} type="button" onClick={() => setMode('side')}><Columns2 size={17} aria-hidden="true" /> Nebeneinander</button>
            <button className={mode === 'overlay' ? 'active' : ''} type="button" onClick={() => setMode('overlay')}><Blend size={17} aria-hidden="true" /> Überblendung</button>
            <button className={mode === 'difference' ? 'active' : ''} type="button" onClick={() => setMode('difference')}><Contrast size={17} aria-hidden="true" /> Differenz</button>
          </div>
          {mode === 'overlay' && <label className="opacity-control">Überblendung <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /><output>{opacity} %</output></label>}
          <div className="zoom-control"><Move size={16} aria-hidden="true" /><button type="button" onClick={() => setZoom(Math.max(1, zoom - 0.25))} aria-label="Verkleinern"><Minus size={16} /></button><output>{Math.round(zoom * 100)} %</output><button type="button" onClick={() => setZoom(Math.min(4, zoom + 0.25))} aria-label="Vergrößern"><Plus size={16} /></button><button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>Zurücksetzen</button></div>
        </div>
        {differentAspect && <p className="comparison-warning">Die Bilder haben unterschiedliche Seitenverhältnisse. Das kann auf einen Zuschnitt hindeuten.</p>}
        {candidateRotation !== 0 && <p className="comparison-warning metadata">Für den visuellen Vergleich wird der Kandidat um {candidateRotation}° gedreht ausgerichtet.</p>}
        {edge?.metadata?.status === 'conflicts' && <p className="comparison-warning metadata"><AlertTriangle size={16} aria-hidden="true" /> Die vorhandenen Metadaten widersprechen diesem visuellen Treffer. Bitte einzeln prüfen.</p>}
        <div className={`comparison-stage mode-${mode}`} onPointerDown={startDrag} onPointerMove={drag} onPointerUp={() => { dragOrigin.current = undefined }}>
          {mode === 'side' ? (
            <><figure>{referenceUrl && <img src={referenceUrl} alt={`Referenz: ${reference.name}`} style={imageStyle} />}<figcaption>Referenz</figcaption></figure><figure>{candidateUrl && <img src={candidateUrl} alt={`Kandidat: ${candidate.name}`} style={candidateImageStyle} />}<figcaption>Kandidat</figcaption></figure></>
          ) : (
            <div className="image-stack">
              <div className="image-alignment-frame" style={{ aspectRatio: reference.aspectRatio, width: `min(82%, ${390 * reference.aspectRatio}px)` }}>
                {referenceUrl && <img src={referenceUrl} alt={`Referenz: ${reference.name}`} style={imageStyle} />}
                {candidateUrl && <img className={mode === 'difference' ? 'difference-layer' : ''} src={candidateUrl} alt={`Kandidat: ${candidate.name}`} style={{ ...candidateImageStyle, opacity: mode === 'overlay' ? opacity / 100 : 1 }} />}
              </div>
            </div>
          )}
        </div>
        <div className="comparison-details">
          {[reference, candidate].map((image, index) => <dl key={image.id}><div><dt>Rolle</dt><dd>{index === 0 ? 'Tatsächliche Vergleichsbasis' : 'Kandidat'}</dd></div><div><dt>Datei</dt><dd>{image.name}</dd></div><div><dt>Pfad</dt><dd>{image.path}</dd></div><div><dt>Format</dt><dd>{image.format.toUpperCase()}</dd></div><div><dt>Auflösung</dt><dd>{image.width} × {image.height}</dd></div><div><dt>Größe</dt><dd>{formatBytes(image.size)}</dd></div>{image.metadata?.capturedAt && <div><dt>Aufgenommen</dt><dd>{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(image.metadata.capturedAt))}</dd></div>}{image.metadata?.latitude !== undefined && image.metadata.longitude !== undefined && <div><dt>GPS</dt><dd>{formatCoordinates(image.metadata.latitude, image.metadata.longitude)}</dd></div>}{(image.metadata?.cameraMake || image.metadata?.cameraModel) && <div><dt>Kamera</dt><dd>{[image.metadata.cameraMake, image.metadata.cameraModel].filter(Boolean).join(' ')}</dd></div>}{image.metadata?.lensModel && <div><dt>Objektiv</dt><dd>{image.metadata.lensModel}</dd></div>}</dl>)}
          <dl className="metrics"><div><dt>Bildähnlichkeit</dt><dd>{edge ? `${Math.round(edge.score)}/100` : '–'}</dd></div><div><dt>pHash-Distanz</dt><dd>{edge?.metrics.pHashDistance ?? '–'}</dd></div><div><dt>dHash-Distanz</dt><dd>{edge?.metrics.dHashDistance ?? '–'}</dd></div><div><dt>SSIM</dt><dd>{edge?.metrics.ssim?.toFixed(3) ?? '–'}</dd></div><div><dt>Farbähnlichkeit</dt><dd>{edge?.metrics.histogramSimilarity ? `${Math.round(edge.metrics.histogramSimilarity * 100)} %` : '–'}</dd></div>{edge?.metadata?.gpsDistanceMeters !== undefined && <div><dt>GPS-Abstand</dt><dd>{formatDistanceMeters(edge.metadata.gpsDistanceMeters)}</dd></div>}{edge?.metadata?.captureTimeDifferenceSeconds !== undefined && <div><dt>Zeitabstand</dt><dd>{formatDuration(edge.metadata.captureTimeDifferenceSeconds * 1_000)}</dd></div>}{edge?.metadata?.sameCameraModel !== undefined && <div><dt>Kameraabgleich</dt><dd>{edge.metadata.sameCameraModel ? 'gleiches Modell' : 'verschiedene Modelle'}</dd></div>}</dl>
        </div>
        <p className="score-disclaimer">Der Wert von 0 bis 100 ist ein technischer Ähnlichkeitswert und keine Wahrscheinlichkeit oder Garantie.</p>
      </div>
    </dialog>
  )
}
