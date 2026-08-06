import { LockKeyhole } from 'lucide-react'

export function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#main" aria-label="Bildabgleich Lokal – zum Inhalt">
        <span className="brand-mark" aria-hidden="true">BL</span>
        <span>
          <strong>Bildabgleich Lokal</strong>
          <small>Prüfung von Baustellenfotos</small>
        </span>
      </a>
      <div className="local-badge"><LockKeyhole size={16} aria-hidden="true" /> Nur lokale Verarbeitung</div>
    </header>
  )
}
