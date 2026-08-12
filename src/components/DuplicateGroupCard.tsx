import {
  AlertTriangle,
  Check,
  CheckCheck,
  GitCompareArrows,
  Maximize2,
  MoreHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import {
  candidateHasStrongMetadataConflict,
  groupCandidateIds,
  resolveComparisonDecision,
  resolveGroupComparison,
  safeBulkCandidateIds,
  type ResultPresentationTier,
} from '../core/clustering'
import type { CandidateEdge, Decision, DuplicateGroup, ImageFeatureRecord } from '../core/types'
import { formatBytes, formatDistanceMeters, formatDuration } from '../utils/format'
import { Thumbnail } from './Thumbnail'

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  comparisonGroup?: DuplicateGroup
  tier: ResultPresentationTier
  images: Map<string, ImageFeatureRecord>
  edges: Map<string, CandidateEdge>
  comparisonDecisions: Readonly<Record<string, Decision>>
  onDecision: (imageId: string, edgeId: string | undefined, tier: ResultPresentationTier, decision: Decision) => void
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

const TIER_COPY: Record<ResultPresentationTier, { eyebrow: string; title: string; explanation: string }> = {
  strong: {
    eyebrow: 'Starker Treffer',
    title: 'Duplikatgruppe',
    explanation: 'Die Kernmitglieder sind visuell stark miteinander verbunden.',
  },
  'manual-review': {
    eyebrow: 'Manuelle Prüfung',
    title: 'Prüfvorschlag',
    explanation: 'Diese Verbindung ist kein bestätigtes Gruppenmitglied und muss einzeln geprüft werden.',
  },
  'low-priority': {
    eyebrow: 'Niedrige Priorität',
    title: 'Schwacher Prüfvorschlag',
    explanation: 'Der visuelle Hinweis ist schwach und vorhandene Metadaten widersprechen dem Treffer.',
  },
}

export function DuplicateGroupCard({
  group,
  comparisonGroup,
  tier,
  images,
  edges,
  comparisonDecisions,
  onDecision,
  onReference,
  onRemove,
  onCompare,
  onOriginal,
  onMarkAll,
  onMarkReviewed,
  onDissolve,
}: DuplicateGroupCardProps) {
  const reference = images.get(group.referenceId)
  if (!reference) return null
  const members = groupCandidateIds(group)
    .map((id) => images.get(id))
    .filter((image): image is ImageFeatureRecord => Boolean(image))
  const copy = TIER_COPY[tier]
  const sourceGroup = comparisonGroup ?? group
  const safeBulkCount = tier === 'strong' ? safeBulkCandidateIds(sourceGroup, edges).length : 0
  const sourceCandidates = groupCandidateIds(sourceGroup)
    .map((id) => images.get(id))
    .filter((image): image is ImageFeatureRecord => Boolean(image))
  const allCandidatesDecided = sourceCandidates.length > 0
    && sourceCandidates.every((image) => {
      const resolved = resolveGroupComparison(sourceGroup, image.id, edges)
      const decision = resolveComparisonDecision(
        resolved,
        comparisonDecisions,
        sourceGroup.memberIds.includes(image.id) ? image.decision : 'unreviewed',
      )
      return decision === 'duplicate' || decision === 'different'
    })
  const groupReviewed = allCandidatesDecided
    && (tier === 'strong' ? sourceGroup.status === 'reviewed' : true)

  return (
    <article className={`duplicate-group card result-tier-${tier}`} aria-labelledby={`${group.id}-${tier}-title`}>
      <header className="group-header">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h3 id={`${group.id}-${tier}-title`}>{copy.title} {group.id.replace(/^group-/, '')} · {members.length + 1} Bilder</h3>
          <p className="group-explanation">{copy.explanation}</p>
        </div>
        <span className={`status ${groupReviewed ? 'success' : 'neutral'}`}>{groupReviewed ? 'Geprüft' : 'Noch ungeprüft'}</span>
      </header>
      <div className="group-reference">
        <Thumbnail thumbnailKey={reference.thumbnailKey} alt={`${tier === 'strong' ? 'Referenzbild' : 'Vergleichsanker'} ${reference.name}`} className="reference-image" />
        <div className="file-meta">
          <span className="reference-label"><Star size={15} fill="currentColor" aria-hidden="true" /> {tier === 'strong' ? 'Referenzbild' : 'Vergleichsanker'}</span>
          <strong title={reference.path}>{reference.name}</strong>
          <small>{reference.path}</small>
          <span>{reference.width} × {reference.height} · {formatBytes(reference.size)}</span>
        </div>
        <button className="button ghost compact screen-only" type="button" onClick={() => onOriginal(reference)}><Maximize2 size={16} aria-hidden="true" /> Original anzeigen</button>
      </div>
      <div className="candidate-list">
        {members.map((candidate) => {
          const resolved = resolveGroupComparison(sourceGroup, candidate.id, edges)
          const edge = resolved.edge
          const comparisonDecision = resolveComparisonDecision(
            resolved,
            comparisonDecisions,
            tier === 'strong' ? candidate.decision : 'unreviewed',
          )
          const comparisonBase = images.get(resolved.baseImageId) ?? reference
          const metadataConflict = edge?.metadata?.status === 'conflicts'
            || (tier === 'strong' && candidateHasStrongMetadataConflict(sourceGroup, candidate.id, edges))
          const score = edge?.score ?? 0
          return (
            <section className={`candidate-row${metadataConflict ? ' metadata-conflict' : ''}`} key={candidate.id} aria-label={`Vergleich mit ${candidate.name}`}>
              <Thumbnail thumbnailKey={candidate.thumbnailKey} alt={candidate.name} className="candidate-image" />
              <div className="candidate-copy">
                <div className="candidate-title">
                  <strong title={candidate.path}>{candidate.name}</strong>
                  {tier !== 'strong' && <span className="status warning">Einzeln prüfen</span>}
                  {metadataConflict && <span className="status danger"><AlertTriangle size={12} aria-hidden="true" /> Metadaten widersprechen</span>}
                </div>
                <small>{candidate.path}</small>
                <span>{candidate.width} × {candidate.height} · {formatBytes(candidate.size)}</span>
                {edge && (
                  <div className="similarity-line">
                    <strong>Bildähnlichkeit {Math.round(score)}/100</strong>
                    <span>{CATEGORY_LABEL[edge.category]}</span>
                  </div>
                )}
                {!resolved.directToReference && edge && (
                  <p className="comparison-base-note">Messwert und Vergleich beziehen sich auf <strong>{comparisonBase.name}</strong>, nicht direkt auf den Gruppenanker.</p>
                )}
                <div className="metric-strip" aria-label="Technische Einzelwerte">
                  <span>pHash {edge?.metrics.pHashDistance ?? '–'}</span>
                  <span>dHash {edge?.metrics.dHashDistance ?? '–'}</span>
                  <span>SSIM {edge?.metrics.ssim?.toFixed(2) ?? '–'}</span>
                  <span>Farbe {edge?.metrics.histogramSimilarity !== undefined ? `${Math.round(edge.metrics.histogramSimilarity * 100)} %` : '–'}</span>
                  {edge?.metadata?.gpsDistanceMeters !== undefined && <span>GPS {formatDistanceMeters(edge.metadata.gpsDistanceMeters)}</span>}
                  {edge?.metadata?.captureTimeDifferenceSeconds !== undefined && <span>Zeit {formatDuration(edge.metadata.captureTimeDifferenceSeconds * 1_000)}</span>}
                  {edge?.metadata?.sameCameraModel !== undefined && <span>Kamera {edge.metadata.sameCameraModel ? 'gleich' : 'verschieden'}</span>}
                </div>
                {edge && <details className="match-reasons screen-only"><summary>Warum dieser Treffer?</summary><ul>{edge.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
                {edge?.metadata && edge.metadata.status !== 'unavailable' && <details className="match-reasons metadata-reasons screen-only" open={metadataConflict}><summary>EXIF-Kontext: {metadataStatusLabel(edge.metadata.status)}</summary><ul>{edge.metadata.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
              </div>
              <div className="candidate-actions screen-only">
                <div className="decision-group" aria-label={`Entscheidung für ${candidate.name}`}>
                  <button className={comparisonDecision === 'duplicate' ? 'decision active yes' : 'decision yes'} type="button" aria-pressed={comparisonDecision === 'duplicate'} onClick={() => onDecision(candidate.id, edge?.id, tier, 'duplicate')}><Check size={16} aria-hidden="true" /> Als Duplikat bestätigen</button>
                  <button className={comparisonDecision === 'different' ? 'decision active no' : 'decision no'} type="button" aria-pressed={comparisonDecision === 'different'} onClick={() => onDecision(candidate.id, edge?.id, tier, 'different')}><X size={16} aria-hidden="true" /> Kein Duplikat</button>
                  <button className={comparisonDecision === 'later' ? 'decision active later' : 'decision later'} type="button" aria-pressed={comparisonDecision === 'later'} onClick={() => onDecision(candidate.id, edge?.id, tier, 'later')}><MoreHorizontal size={16} aria-hidden="true" /> Später prüfen</button>
                </div>
                <div className="row-links">
                  <button type="button" onClick={() => onCompare(comparisonBase, candidate, edge)}><GitCompareArrows size={15} aria-hidden="true" /> Vergleich mit {comparisonBase.name} öffnen</button>
                  {tier === 'strong' && <button type="button" onClick={() => onReference(group.id, candidate.id)}><Star size={15} aria-hidden="true" /> Als Referenz verwenden</button>}
                  <button type="button" onClick={() => onRemove(group.id, candidate.id)}><Trash2 size={15} aria-hidden="true" /> Aus Vorschlag entfernen</button>
                </div>
              </div>
            </section>
          )
        })}
      </div>
      {tier === 'strong' && (
        <footer className="group-footer screen-only">
          {safeBulkCount > 0 && <button className="button secondary compact" type="button" onClick={() => onMarkAll(group.id)}><CheckCheck size={17} aria-hidden="true" /> Nur sichere Kernmitglieder bestätigen ({safeBulkCount})</button>}
          <button className="button ghost compact" type="button" disabled={!allCandidatesDecided || groupReviewed} onClick={() => onMarkReviewed(group.id)}>{groupReviewed ? 'Gruppe geprüft' : allCandidatesDecided ? 'Gruppe als geprüft markieren' : 'Erst alle Vorschläge entscheiden'}</button>
          <button className="button ghost compact danger-text" type="button" onClick={() => onDissolve(group.id)}>Gruppe auflösen</button>
        </footer>
      )}
    </article>
  )
}

function metadataStatusLabel(status: NonNullable<CandidateEdge['metadata']>['status']): string {
  if (status === 'corroborates') return 'stützend'
  if (status === 'conflicts') return 'widersprüchlich'
  if (status === 'neutral') return 'Hinweis'
  return 'nicht verfügbar'
}
