import { ShieldCheck } from 'lucide-react'

export function PrivacyNotice() {
  return (
    <aside className="privacy-notice" aria-label="Datenschutzhinweis">
      <ShieldCheck size={24} aria-hidden="true" />
      <div>
        <strong>Ihre Bilder bleiben auf diesem Gerät.</strong>
        <p>Alle Bilder sowie vorhandene EXIF-, Aufnahmezeit- und GPS-Daten werden ausschließlich lokal in diesem Browser verarbeitet. Es werden keine Bilder oder Metadaten hochgeladen. Der bewusst heruntergeladene JSON-Bericht kann diese Metadaten einschließlich genauer GPS-Koordinaten enthalten.</p>
      </div>
    </aside>
  )
}
