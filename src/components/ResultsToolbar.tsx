import { Filter, Search } from 'lucide-react'
import type { ResultPresentationTier } from '../core/clustering'

export type ResultFilter = 'all' | 'almost-certain-duplicate' | 'probable-duplicate' | 'needs-review' | 'duplicate' | 'different' | 'unreviewed'
export type ResultSort = 'similarity-desc' | 'similarity-asc' | 'name' | 'path' | 'size' | 'group-size'
export type ResultSection = ResultPresentationTier

export type ResultSectionCounts = Record<ResultSection, number>

interface ResultsToolbarProps {
  query: string
  filter: ResultFilter
  sort: ResultSort
  section: ResultSection
  sectionCounts: ResultSectionCounts
  onQueryChange: (value: string) => void
  onFilterChange: (value: ResultFilter) => void
  onSortChange: (value: ResultSort) => void
  onSectionChange: (value: ResultSection) => void
}

const SECTION_LABEL: Record<ResultSection, string> = {
  strong: 'Starke Treffer',
  'manual-review': 'Manuell prüfen',
  'low-priority': 'Niedrige Priorität',
}

export function ResultsToolbar({ query, filter, sort, section, sectionCounts, onQueryChange, onFilterChange, onSortChange, onSectionChange }: ResultsToolbarProps) {
  return (
    <div className="results-toolbar card" aria-label="Ergebnisse filtern und sortieren">
      <div className="result-section-tabs" role="tablist" aria-label="Ergebnisbereiche">
        {(Object.keys(SECTION_LABEL) as ResultSection[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={section === item}
            className={section === item ? 'active' : ''}
            onClick={() => onSectionChange(item)}
          >
            {SECTION_LABEL[item]} <span>{sectionCounts[item].toLocaleString('de-DE')}</span>
          </button>
        ))}
      </div>
      <div className="result-filter-row">
        <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Nach Dateiname oder Pfad suchen</span><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Dateiname oder Pfad suchen" /></label>
        <label><Filter size={17} aria-hidden="true" /><span className="sr-only">Ergebnisfilter</span><select value={filter} onChange={(event) => onFilterChange(event.target.value as ResultFilter)}>
          <option value="all">Alle Treffer im Bereich</option>
          <option value="almost-certain-duplicate">Sehr wahrscheinlich identisch</option>
          <option value="probable-duplicate">Wahrscheinliche Duplikate</option>
          <option value="needs-review">Manuell prüfen</option>
          <option value="duplicate">Bestätigte Duplikate</option>
          <option value="different">Keine Duplikate</option>
          <option value="unreviewed">Noch ungeprüft</option>
        </select></label>
        <label><span>Sortieren</span><select value={sort} onChange={(event) => onSortChange(event.target.value as ResultSort)}>
          <option value="similarity-desc">Höchste Ähnlichkeit zuerst</option>
          <option value="similarity-asc">Niedrigste Ähnlichkeit zuerst</option>
          <option value="name">Dateiname</option>
          <option value="path">Ordnerpfad</option>
          <option value="size">Dateigröße</option>
          <option value="group-size">Gruppengröße</option>
        </select></label>
      </div>
    </div>
  )
}
