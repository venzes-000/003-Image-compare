import { Check, CheckCheck, GitCompareArrows, Maximize2, MoreHorizontal, Star, Trash2, X } from 'lucide-react'
import type { CandidateEdge, Decision, DuplicateGroup, ImageFeatureRecord } from '../core/types'
import { formatBytes } from '../utils/format'
import { Thumbnail } from './Thumbnail'

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  images: Map<string, ImageFeatureRecord>
  edges: Map<string, CandidateEdge>
  onDecision: (imageId: string, decision: Decision) => void
  onReference: (groupId: string, imageId: string) => void
  onRemove: (groupId: string, imageId: string) => void
  onCompare: (reference: ImageFeatureRecord, candidate: ImageFeatureRecord, edge?: CandidateEdge) => void
  onOriginal: (image: ImageFeatureRecord) => void
  onMarkAll: (groupId: string) => void
  onMarkReviewed: (groupId: string) => void
  onDissolve: (groupId: string) => void
}

const CATEGORY_LABEL: Record<CandidateEdge['category'], string> = {
  'almost-certain-duplicate': 'Sehr wahrscheinlich identisch',
  'probable-duplicate': 'Wahrscheinliches Duplikat',
  'needs-review': 'Manuell prüfen',
  'probably-different': 'Wahrscheinlich verschieden',
}

export function DuplicateGroupCard({ group, images, edges, onDecision, onReference, onRemove, onCompare, onOriginal, onMarkAll, onMarkReviewed, onDissolve }: DuplicateGroupCardProps) {
  const reference = images.get(group.referenceId)
  if (!reference) return null
  const members = [...new Set([...group.memberIds, ...group.uncertainIds])]
    .filter((id) => id !== group.referenceId)
    .map((id) => images.get(id))
    .filter((image): image is ImageFeatureRecord => Boolean(image))
  const uncertain = new Set(group.uncertainIds)
  const directEdgeByCandidate = new Map<string, CandidateEdge>()
  const bestEdgeByCandidate = new Map<string, CandidateEdge>()
  for (const edgeId of group.edgeIds) {
    const edge = edges.get(edgeId)
    if (!edge) continue
    for (const imageId of [edge.sourceId, edge.targetId]) {
      if (imageId === reference.id) continue
      const current = bestEdgeByCandidate.get(imageId)
      if (!current || edge.score > current.score) bestEdgeByCandidate.set(imageId, edge)
    }
    if (edge.sourceId === reference.id) directEdgeByCandidate.set(edge.targetId, edge)
    else if (edge.targetId === reference.id) directEdgeByCandidate.set(edge.sourceId, edge)
  }

  return (
    <article className="duplicate-group card" aria-labelledby={`${group.id}-title`}>
      <header className="group-header">
        <div><span className="eyebrow">Ergebnisgruppe</span><h3 id={`${group.id}-title`}>Gruppe {group.id.replace(/^group-/, '')} · {members.length + 1} Bilder</h3></div>
        <span className={`status ${group.status === 'reviewed' ? 'success' : 'neutral'}`}>{group.status === 'reviewed' ? 'Geprüft' : 'Noch ungeprüft'}</span>
      </header>
      <div className="group-reference">
        <Thumbnail thumbnailKey={reference.thumbnailKey} alt={`Referenzbild ${reference.name}`} className="reference-image" />
        <div className="file-meta"><span className="reference-label"><Star size={15} fill="currentColor" aria-hidden="true" /> Referenzbild</span><strong title={reference.path}>{reference.name}</strong><small>{reference.path}</small><span>{reference.width} × {reference.height} · {formatBytes(reference.size)}</span></div>
        <button className="button ghost compact" type="button" onClick={() => onOriginal(reference)}><Maximize2 size={16} aria-hidden="true" /> Original anzeigen</button>
      </div>
      <div className="candidate-list">
        {members.map((candidate) => {
          const directEdge = directEdgeByCandidate.get(candidate.id)
          const edge = directEdge ?? bestEdgeByCandidate.get(candidate.id)
          const comparisonBase = edge
            ? images.get(edge.sourceId === candidate.id ? edge.targetId : edge.sourceId) ?? reference
            : reference
          const score = edge?.score ?? 0
          return (
            <section className="candidate-row" key={candidate.id} aria-label={`Vergleich mit ${candidate.name}`}>
              <Thumbnail thumbnailKey={candidate.thumbnailKey} alt={candidate.name} className="candidate-image" />
              <div className="candidate-copy">
                <div className="candidate-title"><strong title={candidate.path}>{candidate.name}</strong>{uncertain.has(candidate.id) && <span className="status warning">Unsichere Verbindung</span>}</div>
                <small>{candidate.path}</small>
                <span>{candidate.width} × {candidate.height} · {formatBytes(candidate.size)}</span>
                {edge && <div className="similarity-line"><strong>{Math.round(score)} %</strong><span>{CATEGORY_LABEL[edge.category]}{!directEdge && uncertain.has(candidate.id) ? ' · beste Gruppenverbindung' : ''}</span></div>}
                <div className="metric-strip" aria-label="Technische Einzelwerte">
                  <span>pHash {edge?.metrics.pHashDistance ?? '–'}</span>
                  <span>dHash {edge?.metrics.dHashDistance ?? '–'}</span>
                  <span>SSIM {edge?.metrics.ssim?.toFixed(2) ?? '–'}</span>
                  <span>Farbe {edge?.metrics.histogramSimilarity ? `${Math.round(edge.metrics.histogramSimilarity * 100)} %` : '–'}</span>
                </div>
                {edge && <details className="match-reasons"><summary>Warum dieser Treffer?</summary><ul>{edge.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
              </div>
              <div className="candidate-actions">
                <div className="decision-group" aria-label={`Entscheidung für ${candidate.name}`}>
                  <button className={candidate.decision === 'duplicate' ? 'decision active yes' : 'decision yes'} type="button" aria-pressed={candidate.decision === 'duplicate'} onClick={() => onDecision(candidate.id, 'duplicate')}><Check size={16} aria-hidden="true" /> Als Duplikat bestätigen</button>
                  <button className={candidate.decision === 'different' ? 'decision active no' : 'decision no'} type="button" aria-pressed={candidate.decision === 'different'} onClick={() => onDecision(candidate.id, 'different')}><X size={16} aria-hidden="true" /> Kein Duplikat</button>
                  <button className={candidate.decision === 'later' ? 'decision active later' : 'decision later'} type="button" aria-pressed={candidate.decision === 'later'} onClick={() => onDecision(candidate.id, 'later')}><MoreHorizontal size={16} aria-hidden="true" /> Später prüfen</button>
                </div>
                <div className="row-links">
                  <button type="button" onClick={() => onCompare(comparisonBase, candidate, edge)}><GitCompareArrows size={15} aria-hidden="true" /> Vergleichsansicht öffnen</button>
                  <button type="button" onClick={() => onReference(group.id, candidate.id)}><Star size={15} aria-hidden="true" /> Als Referenz verwenden</button>
                  <button type="button" onClick={() => onRemove(group.id, candidate.id)}><Trash2 size={15} aria-hidden="true" /> Aus Gruppe entfernen</button>
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <footer className="group-footer">
        <button className="button secondary compact" type="button" onClick={() => onMarkAll(group.id)}><CheckCheck size={17} aria-hidden="true" /> Alle außer Referenz als Duplikate markieren</button>
        <button className="button ghost compact" type="button" onClick={() => onMarkReviewed(group.id)}>Gruppe als geprüft markieren</button>
        <button className="button ghost compact danger-text" type="button" onClick={() => onDissolve(group.id)}>Gruppe auflösen</button>
      </footer>
    </article>
  )
}
