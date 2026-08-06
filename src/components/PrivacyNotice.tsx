import { ShieldCheck } from 'lucide-react'

export function PrivacyNotice() {
  return (
    <aside className="privacy-notice" aria-label="Datenschutzhinweis">
      <ShieldCheck size={24} aria-hidden="true" />
      <div>
        <strong>Ihre Bilder bleiben auf diesem Gerät.</strong>
        <p>Alle Bilder werden ausschließlich lokal in diesem Browser verarbeitet. Es werden keine Bilder hochgeladen oder an einen Server übertragen.</p>
      </div>
    </aside>
  )
}
