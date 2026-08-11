import { useEffect, useMemo, useRef, useState } from 'react'
import { ArchiveRestore, CheckCircle2, HardDriveDownload, Play, ShieldCheck, Trash2 } from 'lucide-react'
import { AnalysisEngine, type AnalysisCacheAdapter } from '../core/pipeline/analysisEngine'
import { createDefaultSettings } from '../core/config/limits'
import { createZipFingerprint, zipArchiveService } from '../core/zip'
import { analysisStorage } from '../core/storage'
import { decodeSpecialImage, needsSpecialDecoder } from '../core/image/specialDecoders'
import {
  createCleanedFileListBlob,
  createCsvBlob,
  createJsonBlob,
  downloadBlob,
  reportFileStem,
} from '../core/export'
import type {
  AnalysisProgress,
  AnalysisResult,
  AnalysisSettings as Settings,
  AppError,
  CandidateEdge,
  Decision,
  DuplicateGroup,
  ImageFeatureRecord,
} from '../core/types'
import { thumbnailStore } from './thumbnailStore'
import { formatBytes } from '../utils/format'
import { Header } from '../components/Header'
import { PrivacyNotice } from '../components/PrivacyNotice'
import { CompatibilityCheck } from '../components/CompatibilityCheck'
import { FileSelection } from '../components/FileSelection'
import { AnalysisSettings } from '../components/AnalysisSettings'
import { AnalysisProgress as ProgressPanel } from '../components/AnalysisProgress'
import { ResultsToolbar, type ResultFilter, type ResultSort } from '../components/ResultsToolbar'
import { DuplicateGroupCard } from '../components/DuplicateGroupCard'
import { ComparisonDialog } from '../components/ComparisonDialog'
import { ExportPanel } from '../components/ExportPanel'
import { ErrorSummary } from '../components/ErrorSummary'
import './App.css'

const EMPTY_PROGRESS: AnalysisProgress = {
  phase: 'idle',
  percent: 0,
  processed: 0,
  total: 0,
  candidates: 0,
  message: 'Bereit',
}

interface ComparisonSelection {
  reference: ImageFeatureRecord
  candidate: ImageFeatureRecord
  edge?: CandidateEdge
}

const cacheAdapter: AnalysisCacheAdapter = {
  saveThumbnail: (fingerprint, key, blob) => analysisStorage.saveThumbnail(fingerprint, key, blob),
  saveAnalysis: (result) => analysisStorage.saveAnalysis(result.zipFingerprint, result),
}

async function createBrowserPreview(blob: Blob, format: ImageFeatureRecord['format']): Promise<Blob> {
  const buffer = await blob.arrayBuffer()
  const decoded = await decodeSpecialImage(blob, buffer, format)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = decoded.width
    canvas.height = decoded.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Die Originalansicht konnte nicht vorbereitet werden.')
    if (decoded.bitmap) {
      context.drawImage(decoded.bitmap, 0, 0)
    } else if (decoded.rgba) {
      const imageData = new ImageData(decoded.width, decoded.height)
      imageData.data.set(decoded.rgba)
      context.putImageData(imageData, 0, 0)
    } else {
      throw new Error('Der Bilddecoder lieferte keine darstellbaren Daten.')
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (preview) => preview ? resolve(preview) : reject(new Error('Die Originalansicht konnte nicht erzeugt werden.')),
        'image/png',
      )
    })
  } finally {
    decoded.bitmap?.close()
  }
}

function App() {
  const engineRef = useRef<AnalysisEngine | undefined>(undefined)
  const [file, setFile] = useState<File>()
  const [settings, setSettings] = useState<Settings>(() => createDefaultSettings())
  const [cacheEnabled, setCacheEnabled] = useState(false)
  const [cachedResult, setCachedResult] = useState<AnalysisResult>()
  const [checkingCache, setCheckingCache] = useState(false)
  const [progress, setProgress] = useState<AnalysisProgress>(EMPTY_PROGRESS)
  const [result, setResult] = useState<AnalysisResult>()
  const [errors, setErrors] = useState<AppError[]>([])
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ResultFilter>('all')
  const [sort, setSort] = useState<ResultSort>('similarity-desc')
  const [visibleCount, setVisibleCount] = useState(20)
  const [comparison, setComparison] = useState<ComparisonSelection>()
  const [notice, setNotice] = useState<string>()
  const browserReady = typeof Worker !== 'undefined'

  useEffect(() => {
    void Promise.all([analysisStorage.loadSettings(), analysisStorage.isCacheEnabled()])
      .then(([storedSettings, storedCacheEnabled]) => {
        if (storedSettings) setSettings(storedSettings)
        setCacheEnabled(storedCacheEnabled)
      })
      .catch(() => undefined)
    return () => engineRef.current?.cancel()
  }, [])

  useEffect(() => setVisibleCount(20), [filter, query, sort])

  const handleSettingsChange = (next: Settings) => {
    setSettings(next)
    void analysisStorage.saveSettings(next).catch(() => undefined)
  }

  const handleCacheChange = (enabled: boolean) => {
    setCacheEnabled(enabled)
    void analysisStorage.setCacheEnabled(enabled).catch(() => undefined)
    if (!enabled) setCachedResult(undefined)
    else if (file) void checkForCachedResult(file, true)
  }

  const checkForCachedResult = async (selectedFile: File, force = false) => {
    if (!force && !cacheEnabled && !(await analysisStorage.isCacheEnabled().catch(() => false))) return
    setCheckingCache(true)
    try {
      const fingerprint = await createZipFingerprint(selectedFile)
      const stored = await analysisStorage.loadAnalysis(fingerprint)
      setCachedResult(stored)
    } catch {
      setCachedResult(undefined)
    } finally {
      setCheckingCache(false)
    }
  }

  const handleFileSelect = (selectedFile: File) => {
    thumbnailStore.clear()
    setFile(selectedFile)
    setResult(undefined)
    setErrors([])
    setProgress(EMPTY_PROGRESS)
    setCachedResult(undefined)
    setNotice(undefined)
    if (cacheEnabled) void checkForCachedResult(selectedFile)
  }

  const startAnalysis = async () => {
    if (!file || running || !browserReady) return
    setCachedResult(undefined)
    setResult(undefined)
    setErrors([])
    setProgress(EMPTY_PROGRESS)
    setRunning(true)
    setPaused(false)
    setNotice(undefined)
    thumbnailStore.clear()

    const engine = new AnalysisEngine(
      {
        onProgress: setProgress,
        onError: (error) => setErrors((current) => [...current, error]),
      },
      cacheEnabled ? cacheAdapter : undefined,
    )
    engineRef.current = engine

    try {
      const analysis = await engine.run(file, settings)
      thumbnailStore.setFingerprint(analysis.zipFingerprint)
      setResult(analysis)
      setErrors(analysis.errors)
    } catch (error) {
      const aborted = (error instanceof DOMException || error instanceof Error) && error.name === 'AbortError'
      if (!aborted) {
        setErrors((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            code: 'invalid-zip',
            message: error instanceof Error ? error.message : 'Die Analyse konnte nicht abgeschlossen werden.',
            detail: error instanceof Error ? error.stack : String(error),
            phase: progress.phase,
            recoverable: false,
          },
        ])
        setProgress((current) => ({ ...current, phase: 'error', message: 'Analyse fehlgeschlagen' }))
      }
    } finally {
      engineRef.current = undefined
      setRunning(false)
      setPaused(false)
    }
  }

  const continueCachedAnalysis = () => {
    if (!cachedResult) return
    thumbnailStore.clear()
    thumbnailStore.setFingerprint(cachedResult.zipFingerprint)
    setResult(cachedResult)
    setErrors(cachedResult.errors)
    setProgress({
      phase: 'completed',
      percent: 100,
      processed: cachedResult.images.length,
      total: cachedResult.images.length,
      candidates: cachedResult.edges.length,
      message: 'Gespeicherte Analyse geladen',
    })
    setCachedResult(undefined)
    setNotice('Die vorhandene lokale Analyse wurde geladen.')
  }

  const deleteCachedAnalysis = async () => {
    if (!cachedResult) return
    await analysisStorage.deleteAnalysis(cachedResult.zipFingerprint)
    setCachedResult(undefined)
    setNotice('Die gespeicherten Daten für diese ZIP-Datei wurden gelöscht.')
  }

  const clearAllCachedData = async () => {
    try {
      await analysisStorage.clearAnalysisData()
      thumbnailStore.clear()
      setCachedResult(undefined)
      setNotice('Alle dauerhaft gespeicherten Analysedaten wurden gelöscht.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Die lokalen Daten konnten nicht gelöscht werden.')
    }
  }

  const persistUpdatedResult = (updater: (current: AnalysisResult) => AnalysisResult) => {
    setResult((current) => {
      if (!current) return current
      const next = updater(current)
      if (cacheEnabled) void analysisStorage.saveAnalysis(next.zipFingerprint, next).catch(() => undefined)
      return next
    })
  }

  const updateDecision = (imageId: string, decision: Decision) => {
    persistUpdatedResult((current) => ({
      ...current,
      images: current.images.map((image) => image.id === imageId ? { ...image, decision } : image),
    }))
    if (cacheEnabled && result) void analysisStorage.saveDecision(result.zipFingerprint, imageId, decision).catch(() => undefined)
  }

  const updateGroup = (groupId: string, updater: (group: DuplicateGroup) => DuplicateGroup | undefined) => {
    persistUpdatedResult((current) => ({
      ...current,
      groups: current.groups.flatMap((group) => {
        if (group.id !== groupId) return [group]
        const updated = updater(group)
        return updated ? [updated] : []
      }),
    }))
  }

  const setReference = (groupId: string, imageId: string) => updateGroup(groupId, (group) => ({
    ...group,
    referenceId: imageId,
    memberIds: [...new Set([imageId, ...group.memberIds])],
    uncertainIds: group.uncertainIds.filter((id) => id !== imageId),
  }))

  const removeFromGroup = (groupId: string, imageId: string) => updateGroup(groupId, (group) => ({
    ...group,
    memberIds: group.memberIds.filter((id) => id !== imageId),
    uncertainIds: group.uncertainIds.filter((id) => id !== imageId),
    edgeIds: group.edgeIds.filter((edgeId) => !edgeId.includes(imageId)),
  }))

  const markAllDuplicates = (groupId: string) => {
    const group = result?.groups.find((candidate) => candidate.id === groupId)
    if (!group) return
    const ids = new Set([...group.memberIds, ...group.uncertainIds])
    ids.delete(group.referenceId)
    persistUpdatedResult((current) => ({
      ...current,
      images: current.images.map((image) => ids.has(image.id) ? { ...image, decision: 'duplicate' as const } : image),
    }))
  }

  const openOriginal = async (image: ImageFeatureRecord) => {
    if (!file) return
    const popup = window.open('about:blank', '_blank')
    if (popup) popup.opener = null
    try {
      const extracted = await zipArchiveService.extractImage(file, image.path)
      const displayBlob = popup && needsSpecialDecoder(image.format)
        ? await createBrowserPreview(extracted.blob, image.format)
        : extracted.blob
      const url = URL.createObjectURL(displayBlob)
      if (popup) popup.location.href = url
      else downloadBlob(extracted.blob, image.name)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      popup?.close()
      setNotice(error instanceof Error ? error.message : 'Das Originalbild konnte nicht geöffnet werden.')
    }
  }

  const imageMap = useMemo(() => new Map(result?.images.map((image) => [image.id, image]) ?? []), [result?.images])
  const edgeMap = useMemo(() => new Map(result?.edges.map((edge) => [edge.id, edge]) ?? []), [result?.edges])
  const filteredGroups = useMemo(() => {
    if (!result) return []
    const normalizedQuery = query.trim().toLocaleLowerCase('de-DE')
    const groupScore = (group: DuplicateGroup) => Math.max(0, ...group.edgeIds.map((id) => edgeMap.get(id)?.score ?? 0))
    const matchesFilter = (group: DuplicateGroup) => {
      const ids = new Set([...group.memberIds, ...group.uncertainIds])
      const groupEdges = result.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId))
      const groupImages = result.images.filter((image) => ids.has(image.id))
      if (filter === 'all') return true
      if (filter === 'duplicate' || filter === 'different' || filter === 'unreviewed') return groupImages.some((image) => image.decision === filter)
      return groupEdges.some((edge) => edge.category === filter)
    }
    const groups = result.groups.filter((group) => {
      const ids = new Set([...group.memberIds, ...group.uncertainIds])
      const queryMatches = !normalizedQuery || result.images.some((image) => ids.has(image.id) && `${image.name}\n${image.path}`.toLocaleLowerCase('de-DE').includes(normalizedQuery))
      return queryMatches && matchesFilter(group)
    })
    return groups.sort((left, right) => {
      const leftReference = imageMap.get(left.referenceId)
      const rightReference = imageMap.get(right.referenceId)
      if (sort === 'similarity-desc') return groupScore(right) - groupScore(left)
      if (sort === 'similarity-asc') return groupScore(left) - groupScore(right)
      if (sort === 'group-size') return right.memberIds.length + right.uncertainIds.length - left.memberIds.length - left.uncertainIds.length
      if (sort === 'size') return (rightReference?.size ?? 0) - (leftReference?.size ?? 0)
      const leftValue = sort === 'path' ? leftReference?.path : leftReference?.name
      const rightValue = sort === 'path' ? rightReference?.path : rightReference?.name
      return (leftValue ?? '').localeCompare(rightValue ?? '', 'de', { numeric: true, sensitivity: 'base' })
    })
  }, [edgeMap, filter, imageMap, query, result, sort])

  const exportReport = (kind: 'csv' | 'json' | 'cleaned') => {
    if (!result) return
    const stem = reportFileStem(result.zipName)
    if (kind === 'csv') downloadBlob(createCsvBlob(result), `${stem}.csv`)
    else if (kind === 'json') downloadBlob(createJsonBlob(result), `${stem}.json`)
    else downloadBlob(createCleanedFileListBlob(result), `${stem}-dateiliste.csv`)
  }

  return (
    <div className="app-shell">
      <Header />
      <main id="main" className="main-content">
        <section className="intro" aria-labelledby="page-title">
          <div><span className="eyebrow">Lokale Duplikatprüfung</span><h1 id="page-title">Doppelte Baustellenfotos erkennen – ohne dass sie den Rechner verlassen.</h1><p>Wählen Sie eine ZIP-Datei aus. Die Anwendung vergleicht Bildfingerabdrücke und zeigt getrennt dazu hilfreichen EXIF-Kontext wie Aufnahmezeit, GPS-Abstand und Kameramodell an.</p></div>
          <div className="intro-note"><strong>Für einen prüfbaren Arbeitsablauf</strong>Keine Bilder werden automatisch gelöscht. Jede Entscheidung bleibt bei Ihnen und kann als Bericht exportiert werden.</div>
        </section>
        <PrivacyNotice />
        <div className="workspace-grid">
          <FileSelection file={file} disabled={running} onSelect={handleFileSelect} />
          <AnalysisSettings settings={settings} cacheEnabled={cacheEnabled} disabled={running} onChange={handleSettingsChange} onCacheChange={handleCacheChange} onClearCache={() => { void clearAllCachedData() }} />
        </div>
        <CompatibilityCheck />
        {checkingCache && <div className="cache-resume card" role="status"><ArchiveRestore size={20} aria-hidden="true" /><span>Vorhandene lokale Analyse wird gesucht …</span></div>}
        {cachedResult && (
          <section className="cache-resume card" aria-labelledby="cache-title">
            <ArchiveRestore size={24} aria-hidden="true" />
            <div><h2 id="cache-title">Für diese ZIP-Datei wurden bereits Analysedaten gefunden.</h2><p>Analyse vom {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(cachedResult.analyzedAt))} mit {cachedResult.images.length.toLocaleString('de-DE')} Bildern fortsetzen?</p></div>
            <div><button className="button primary" type="button" onClick={continueCachedAnalysis}>Fortsetzen</button><button className="button secondary" type="button" onClick={() => { setCachedResult(undefined); void startAnalysis() }}>Neu analysieren</button><button className="button ghost danger-text" type="button" onClick={() => { void deleteCachedAnalysis() }}><Trash2 size={16} aria-hidden="true" /> Gespeicherte Daten löschen</button></div>
          </section>
        )}
        {notice && <p className="notice-message" role="status"><CheckCircle2 size={17} aria-hidden="true" /> {notice}</p>}
        {!cachedResult && (
          <div className="start-actions">
            <small>Die Dauer hängt von Bildanzahl, Auflösung und Leistung des Arbeitslaptops ab. Bei 3.000 Bildern kann die Prüfung längere Zeit benötigen.</small>
            <button className="button primary" type="button" disabled={!file || running || !browserReady} onClick={() => { void startAnalysis() }}><Play size={18} fill="currentColor" aria-hidden="true" /> Analyse starten</button>
          </div>
        )}
        {running && <ProgressPanel progress={progress} paused={paused} onPause={() => { engineRef.current?.pause(); setPaused(true) }} onResume={() => { engineRef.current?.resume(); setPaused(false) }} onCancel={() => engineRef.current?.cancel()} />}
        {!running && !result && errors.length > 0 && <ErrorSummary errors={errors} />}
        {result && (
          <section className="results-section" aria-labelledby="results-title">
            <div className="results-heading">
              <div><span className="eyebrow">Analyse abgeschlossen</span><h2 id="results-title">Mögliche Duplikate</h2><p>Prüfen Sie jeden Treffer. Der technische Wert ist ein Hinweis, keine Garantie.</p></div>
              <dl className="summary-stats">
                <div><dt>Analysierte Bilder</dt><dd>{result.images.length.toLocaleString('de-DE')}</dd></div>
                <div><dt>Ergebnisgruppen</dt><dd>{result.groups.length.toLocaleString('de-DE')}</dd></div>
                <div><dt>Vergleichskanten</dt><dd>{result.edges.length.toLocaleString('de-DE')}</dd></div>
                <div><dt>Übersprungen / defekt</dt><dd>{(result.summary.skippedEntries + result.summary.corruptedImages).toLocaleString('de-DE')}</dd></div>
              </dl>
            </div>
            <div className="analysis-summary card"><span><HardDriveDownload size={17} aria-hidden="true" /><strong>ZIP-Zusammenfassung</strong></span><span>{result.summary.totalEntries.toLocaleString('de-DE')} Dateien gefunden</span><span>{formatBytes(result.summary.totalUncompressedBytes)} geschätzte Gesamtgröße</span><span>Formate: {result.summary.formats.map((format) => format.toUpperCase()).join(', ') || '–'}</span></div>
            <ResultsToolbar query={query} filter={filter} sort={sort} onQueryChange={setQuery} onFilterChange={setFilter} onSortChange={setSort} />
            {filteredGroups.length === 0 ? <div className="empty-results card"><ShieldCheck size={30} aria-hidden="true" /><p>{result.groups.length === 0 ? 'Mit den aktuellen Einstellungen wurden keine möglichen Duplikatgruppen gefunden.' : 'Keine Gruppen entsprechen dem aktuellen Filter.'}</p></div> : filteredGroups.slice(0, visibleCount).map((group) => (
              <DuplicateGroupCard key={group.id} group={group} images={imageMap} edges={edgeMap} onDecision={updateDecision} onReference={setReference} onRemove={removeFromGroup} onCompare={(reference, candidate, edge) => setComparison(edge ? { reference, candidate, edge } : { reference, candidate })} onOriginal={(image) => { void openOriginal(image) }} onMarkAll={markAllDuplicates} onMarkReviewed={(groupId) => updateGroup(groupId, (group) => ({ ...group, status: 'reviewed' }))} onDissolve={(groupId) => updateGroup(groupId, () => undefined)} />
            ))}
            {visibleCount < filteredGroups.length && <div className="load-more"><button className="button secondary" type="button" onClick={() => setVisibleCount((count) => count + 20)}>Weitere Gruppen anzeigen ({(filteredGroups.length - visibleCount).toLocaleString('de-DE')})</button></div>}
            <ExportPanel disabled={result.groups.length === 0} onCsv={() => exportReport('csv')} onJson={() => exportReport('json')} onCleanedList={() => exportReport('cleaned')} />
            {result.errors.length > 0 && <ErrorSummary errors={result.errors} />}
          </section>
        )}
      </main>
      <footer className="site-footer"><div><span>Bildabgleich Lokal · Version {__APP_VERSION__}</span><span><ShieldCheck size={15} aria-hidden="true" /> Nur lokale Verarbeitung</span><a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Drittanbieter-Lizenzen</a><span>Build {new Intl.DateTimeFormat('de-DE').format(new Date(__BUILD_DATE__))}</span></div></footer>
      {comparison && <ComparisonDialog reference={comparison.reference} candidate={comparison.candidate} {...(comparison.edge ? { edge: comparison.edge } : {})} onClose={() => setComparison(undefined)} />}
    </div>
  )
}

export default App
